import { useCallback, useEffect, useRef, useState } from "react";
import { attestation, closeSession, createSession, type Session } from "@invisible-labs/sdk";
import { toUiError, type InvisibleUiError } from "./errors";

type SessionState = {
  phase: "disconnected" | "connecting" | "connected" | "error";
  session: Session | null;
  error: InvisibleUiError | null;
};
const DISCONNECTED: SessionState = { phase: "disconnected", session: null, error: null };

/** The SDK owns WebSocket, Noise and attestation; React owns lifetime only. */
export function useInvisibleSession(coordinatorUrl: string) {
  const [state, setState] = useState<SessionState>(DISCONNECTED);
  const generation = useRef(0);
  const active = useRef<Session | null>(null);
  const pending = useRef<Promise<Session | null> | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  const close = useCallback(() => {
    generation.current += 1;
    pending.current = null;
    unsubscribe.current?.();
    unsubscribe.current = null;
    if (active.current) closeSession(active.current);
    active.current = null;
  }, []);

  const disconnect = useCallback(() => {
    close();
    setState(DISCONNECTED);
  }, [close]);

  const fail = useCallback((error: unknown) => {
    close();
    setState({ phase: "error", session: null, error: toUiError(error) });
  }, [close]);

  const connect = useCallback((): Promise<Session | null> => {
    if (active.current?.attested) return Promise.resolve(active.current);
    if (pending.current) return pending.current;
    close();
    const run = generation.current;
    setState({ phase: "connecting", session: null, error: null });
    const promise = createSession({ coordinatorUrl, clientPersistence: true }).then(session => {
      if (generation.current !== run) {
        closeSession(session);
        return null;
      }
      active.current = session;
      unsubscribe.current = attestation.onPolicyViolation(session, fail);
      setState({ phase: "connected", session, error: null });
      return session;
    }).catch(error => {
      if (generation.current === run) fail(error);
      return null;
    }).finally(() => {
      if (generation.current === run) pending.current = null;
    });
    pending.current = promise;
    return promise;
  }, [coordinatorUrl, close, fail]);

  useEffect(() => {
    setState(DISCONNECTED);
    return close;
  }, [coordinatorUrl, close]);

  return { ...state, connect, disconnect, fail };
}
