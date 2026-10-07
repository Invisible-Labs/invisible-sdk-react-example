import { useCallback, useEffect, useRef, useState } from "react";
import { AttestationError, InvalidDepositAmountError, createExponentialBackoff, type Session } from "@invisible-labs/sdk";
import { subscribe } from "@invisible-labs/sdk/events";
import { sync, type PersistedTransfer, type SyncUserResponse } from "@invisible-labs/sdk/user";
import { isReadRetryable, toUiError, type InvisibleUiError } from "./errors";

const POLL_INTERVAL_MS = 5_000;
const SYNC_TIMEOUT_MS = 5_000;
const MAX_RETRY_MS = 30_000;
const TERMINAL_STATES = new Set<SyncUserResponse["state"]>(["completed", "refunded", "failed"]);

export const isTerminalState = (state: SyncUserResponse["state"]) => TERMINAL_STATES.has(state);

type StatusState = {
  swapId: string;
  session: Session;
  view: SyncUserResponse | null;
  error: InvisibleUiError | null;
  fresh: boolean;
};

/** Push messages are refresh hints. Only an authenticated sync is state truth. */
export function useTransferStatus(session: Session | null, transfer: PersistedTransfer | null, onAttestationError: (error: unknown) => void) {
  const [state, setState] = useState<StatusState | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const swapId = transfer?.swapId;
  const secret = transfer?.syncSecret;
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!session || !swapId || !secret) return;
    let stopped = false;
    let inFlight = false;
    let queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastVersion: number | undefined;
    const backoff = createExponentialBackoff({ initialDelayMs: POLL_INTERVAL_MS, maxDelayMs: MAX_RETRY_MS });
    const visible = () => document.visibilityState !== "hidden";
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!stopped && visible()) timer = setTimeout(() => void reconcile(), delay);
    };
    const reconcile = async () => {
      if (stopped || !visible()) return;
      if (inFlight) { queued = true; return; }
      clearTimeout(timer);
      inFlight = true;
      let delay = POLL_INTERVAL_MS;
      try {
        const view = await sync(session, swapId, new Uint8Array(secret), SYNC_TIMEOUT_MS);
        if (stopped) return;
        const snapshot = view.actor_sync?.snapshot;
        if (snapshot && snapshot.contract_id !== swapId) throw new Error("Coordinator returned a different transfer.");
        if (snapshot && lastVersion !== undefined && snapshot.state_version < lastVersion) {
          throw new Error("Coordinator returned an older transfer snapshot.");
        }
        lastVersion = snapshot?.state_version ?? lastVersion;
        setState({ swapId, session, view, error: null, fresh: true });
        backoff.reset();
        if (isTerminalState(view.state)) stopped = true;
      } catch (error) {
        if (stopped) return;
        setState(previous => ({
          swapId, session,
          view: previous?.swapId === swapId && previous.session === session ? previous.view : null,
          error: toUiError(error), fresh: false,
        }));
        if (error instanceof AttestationError) { stopped = true; onAttestationError(error); }
        else if (error instanceof InvalidDepositAmountError) delay = POLL_INTERVAL_MS;
        else if (isReadRetryable(error)) delay = backoff.nextDelayMs();
        else stopped = true;
      } finally {
        inFlight = false;
        if (queued && !stopped) { queued = false; void reconcile(); }
        else schedule(delay);
      }
    };
    const unsubscribe = subscribe(session, { subjectType: "transfer", subjectId: swapId }, hint => {
      if (lastVersion === undefined || hint.stateVersion > lastVersion) void reconcile();
    });
    const wake = () => { if (visible()) void reconcile(); else clearTimeout(timer); };
    refreshRef.current = wake;
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    void reconcile();
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      refreshRef.current = () => {};
    };
  }, [session, swapId, secret, onAttestationError]);

  const current = state !== null && state.swapId === swapId && state.session === session ? state : null;
  return { view: current?.view ?? null, error: current?.error ?? null, fresh: current?.fresh ?? false, refresh };
}
