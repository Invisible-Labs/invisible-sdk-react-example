import { useCallback, useEffect, useRef, useState } from "react";
import { PolicyValidationError, publicKey, type Session } from "@invisible-labs/sdk";
import {
  contractRequest, listPersistedTransfers, requestRefund, recoveryCodeFromUserInput,
  SUPPORTED_TOTAL_DEADLINE_MS, type PersistedTransfer, type SyncUserResponse,
} from "@invisible-labs/sdk/user";
import { parseSolAmount } from "./amount";
import { toUiError, type InvisibleUiError } from "./errors";
import { hasPendingMutation, mutationKey, runMutation } from "./mutations";

const FULL_DESTINATION_SHARE = 100;
const CREATE_ACTION = "create";

/** Thin command adapter. Recovery records and protocol validation belong to the SDK. */
export function usePrivateTransfers(session: Session | null, coordinatorUrl: string) {
  const [transfers, setTransfers] = useState<readonly PersistedTransfer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<InvisibleUiError | null>(null);
  const [creationBlocked, setCreationBlocked] = useState(false);
  const [refundBlockedIds, setRefundBlockedIds] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(false);
  const activeSession = useRef(session);
  activeSession.current = session;
  const createKey = mutationKey(coordinatorUrl, CREATE_ACTION);

  const reload = useCallback(async () => {
    if (!session) return;
    const records = await listPersistedTransfers(session);
    if (activeSession.current !== session) return;
    setTransfers(records);
    setLoadedSession(session);
    setSelectedId(current => current ?? records[0]?.swapId ?? null);
    setCreationBlocked(hasPendingMutation(createKey) || records.some(record => record.stage === "allocation"));
    setRefundBlockedIds(new Set(records.filter(record => hasPendingMutation(mutationKey(coordinatorUrl, `refund:${record.swapId}`))).map(record => record.swapId)));
  }, [session, coordinatorUrl, createKey]);

  useEffect(() => {
    setError(null);
    void reload().catch(error => {
      if (activeSession.current === session) setError(toUiError(error));
    });
  }, [reload, session]);

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (!session || inFlight.current) return;
    if (loadedSession !== session) { setError(toUiError(new Error("Wait for saved transfers to load before submitting a request."))); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (error) { if (activeSession.current === session) setError(toUiError(error)); }
    finally {
      try { await reload(); }
      catch (error) { if (activeSession.current === session) setError(toUiError(error)); }
      inFlight.current = false;
      setBusy(false);
    }
  }, [session, reload, loadedSession]);

  const createTransfer = useCallback((input: { amountSol: string; destination: string; deadlineMs: number }) => perform(async () => {
    if (!session) return;
    const amountLamports = parseSolAmount(input.amountSol);
    const destination = publicKey(input.destination.trim());
    if (!SUPPORTED_TOTAL_DEADLINE_MS.includes(input.deadlineMs)) {
      throw new PolicyValidationError("INVALID_PAYOUT_PLAN", "Choose a supported payout window.");
    }
    if (creationBlocked) throw new Error("An incomplete transfer needs reconciliation before creating another.");
    const contract = await runMutation(createKey, () => contractRequest(session, {
      amountLamports,
      payoutPolicy: { destinations: [{ address: destination, sharePercent: FULL_DESTINATION_SHARE }], totalDeadlineMs: input.deadlineMs },
    }));
    if (activeSession.current === session) setSelectedId(contract.swapId);
  }), [session, perform, creationBlocked, createKey]);

  const refund = useCallback((transfer: PersistedTransfer, status: SyncUserResponse, recoveryInput?: string) => perform(async () => {
    if (!session) return;
    if (status.actor_sync?.snapshot.contract_id !== transfer.swapId || status.actor_sync.snapshot.refundability !== "available_now") {
      throw new Error("Refresh the transfer: a refund is not currently available.");
    }
    const recoveryCode = recoveryInput ? recoveryCodeFromUserInput(recoveryInput) : transfer.recoveryCode;
    const syncSecret = transfer.syncSecret;
    if (!recoveryCode || !syncSecret) throw new Error("Enter the Recovery Code and restore the transfer status first.");
    const key = mutationKey(coordinatorUrl, `refund:${transfer.swapId}`);
    await runMutation(key, () => requestRefund(session, {
      swapId: transfer.swapId, syncSecret: new Uint8Array(syncSecret), recoveryCode: new Uint8Array(recoveryCode),
    }), status.actor_sync.snapshot.state_version);
  }), [session, perform, coordinatorUrl]);

  const reconcileRefund = useCallback((status: SyncUserResponse) => {
    const snapshot = status.actor_sync?.snapshot;
    if (!snapshot || (snapshot.refundability !== "request_pending" && status.state !== "refunded")) return;
    const key = mutationKey(coordinatorUrl, `refund:${snapshot.contract_id}`);
    try {
      const marker = localStorage.getItem(key);
      if (marker === null) return;
      const version: unknown = JSON.parse(marker).stateVersion;
      if (typeof version !== "number" || snapshot.state_version <= version) return;
      localStorage.removeItem(key);
      setRefundBlockedIds(previous => new Set([...previous].filter(id => id !== snapshot.contract_id)));
    } catch (error) { setError(toUiError(error)); }
  }, [coordinatorUrl]);

  const selected = transfers.find(transfer => transfer.swapId === selectedId) ?? null;
  return {
    transfers, selected, selectedId, select: setSelectedId, busy, error, loaded: session !== null && loadedSession === session,
    creationBlocked, refundBlocked: selectedId !== null && refundBlockedIds.has(selectedId),
    createTransfer, refund, reconcileRefund, reload,
  };
}
