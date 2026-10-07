import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttestationError, CommandError, StorageError, TransportError, closeSession, createSession, type Session } from "@invisible-labs/sdk";
import { contractRequest, listPersistedTransfers, requestRefund, type ContractRequestResult, type PersistedTransfer, type SyncUserResponse } from "@invisible-labs/sdk/user";
import { subscribe } from "@invisible-labs/sdk/events";
import { parseSolAmount } from "./amount";
import { toUiError } from "./errors";
import { hasPendingMutation, mutationKey, runMutation } from "./mutations";
import { useInvisibleSession } from "./useInvisibleSession";
import { usePrivateTransfers } from "./usePrivateTransfers";
import { useTransferStatus } from "./useTransferStatus";
import { sync } from "@invisible-labs/sdk/user";

vi.mock("@invisible-labs/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@invisible-labs/sdk")>();
  return { ...actual, createSession: vi.fn(), closeSession: vi.fn(), attestation: { ...actual.attestation, onPolicyViolation: vi.fn(() => vi.fn()) } };
});
vi.mock("@invisible-labs/sdk/user", async importOriginal => ({
  ...await importOriginal<typeof import("@invisible-labs/sdk/user")>(),
  contractRequest: vi.fn(), listPersistedTransfers: vi.fn(), sync: vi.fn(), requestRefund: vi.fn(),
}));
vi.mock("@invisible-labs/sdk/events", () => ({ subscribe: vi.fn(() => vi.fn()) }));

const URL = "wss://coordinator.example/ws-noise";
const DESTINATION = "11111111111111111111111111111111";
const session = { attested: true } as Session;
const policy = {
  asset: "SOL", entry_amount_lamports: 1_500_000_000, total_committed_lamports: 1_500_000_000,
  payout_deadline_ms: 0, payout_schedule: [{ destination_address: DESTINATION }], fragment_count: 1,
  payout_mode: "instant", matching_mode: "exact_1_to_1", fragmentation_allowed: "payout_side_only",
  min_fee_bps: 15, fee_bps: 15, fee_lamports: 2_250_000, net_payout_lamports: 1_497_750_000,
} as const;
const transfer: PersistedTransfer = {
  schemaVersion: 1, stage: "ready", swapId: "transfer-a", amountLamports: 1_500_000_000,
  destinationAddress: DESTINATION, policySnapshot: policy, status: "awaiting_deposit", updatedAtMs: 1,
  depositAddress: DESTINATION, depositExpiresAtMs: Date.now() + 60_000,
  syncSecret: new Uint8Array(32).fill(1), recoveryCode: new Uint8Array(32).fill(2),
};
function view(id = transfer.swapId, version = 1): SyncUserResponse {
  return { state: "settling", fragments_executed: [], coordinatorTimestampMs: Date.now(), actor_sync: {
    actor: "normal_user", snapshot: {
      contract_id: id, status: "settling", settlement_phase: "waiting_for_liquidity",
      refundability: "available_now", refund_status: null, source_liquidity_use: "available",
      destination_wallet: DESTINATION, deposit_amount_lamports: 1_500_000_000, deposit_expires_at_ms: Date.now(),
      payout_window: { starts_at_ms: Date.now(), deadline_ms: null }, settlement_tx_hashes: [],
      settled_amount_lamports: 0, protocol_fee_lamports: 0, network_fee_lost_lamports: [],
      recovery_refund_remaining_lamports: 1_500_000_000, withdrawal_requested_lamports: 0,
      withdrawal_landed_lamports: 0, withdrawal_landed_fee_lamports: 0, withdrawal_canceled_lamports: 0,
      withdrawal_network_fee_loss_lamports: 0, withdrawal_tx_hashes: [], retry: { should_retry: false, poll_after_ms: null },
      state_version: version, updated_at_ms: Date.now(),
    },
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function flush() { await act(async () => { await Promise.resolve(); }); }

beforeEach(() => {
  vi.stubGlobal("localStorage", (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage);
  localStorage.clear();
  vi.mocked(listPersistedTransfers).mockResolvedValue([transfer]);
  vi.mocked(sync).mockResolvedValue(view());
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, action: () => unknown) => action() } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("public SDK integration boundaries", () => {
  it("parses exact lamports and validates SDK limits without floating point rounding", () => {
    expect(parseSolAmount("1.500000001")).toBe(1_500_000_001);
    expect(parseSolAmount("100")).toBe(100_000_000_000);
    for (const invalid of ["1.499999999", "100.000000001", "1e9", "1.5000000001", "NaN", "-2"]) {
      expect(() => parseSolAmount(invalid)).toThrow();
    }
  });

  it("uses SDK error normalization and preserves accepted storage failures", () => {
    expect(toUiError({ unexpected: true }).message).not.toContain("[object Object]");
    const error = toUiError(new StorageError("STORAGE_QUOTA_EXCEEDED", "Cannot save", { swapId: transfer.swapId, remoteAccepted: true }));
    expect(error).toMatchObject({ kind: "storage", swapId: transfer.swapId, remoteAccepted: true });
    expect(toUiError(new AttestationError("MRTD_MISMATCH", "Wrong measurement")).kind).toBe("attestation");
  });

  it("deduplicates connects and closes a late session after unmount", async () => {
    const pending = deferred<Session>();
    vi.mocked(createSession).mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useInvisibleSession(URL));
    let first!: Promise<Session | null>;
    act(() => { first = result.current.connect(); expect(result.current.connect()).toBe(first); });
    expect(createSession).toHaveBeenCalledExactlyOnceWith({ coordinatorUrl: URL, clientPersistence: true });
    unmount();
    pending.resolve(session);
    await first;
    expect(closeSession).toHaveBeenCalledWith(session);
  });

  it("never publishes or keeps a session whose attestation failed", async () => {
    vi.mocked(createSession).mockRejectedValue(new AttestationError("MRTD_MISMATCH", "Mismatch"));
    const { result } = renderHook(() => useInvisibleSession(URL));
    await act(async () => { await result.current.connect(); });
    expect(result.current.phase).toBe("error");
    expect(result.current.session).toBeNull();
    expect(contractRequest).not.toHaveBeenCalled();
  });

  it("survives reload markers and never repeats an ambiguous mutation", async () => {
    const key = mutationKey(URL, "create");
    const action = vi.fn().mockRejectedValue(new TransportError("CONNECTION_LOST", "Lost response"));
    await expect(runMutation(key, action)).rejects.toThrow("Lost response");
    expect(hasPendingMutation(key)).toBe(true);
    await expect(runMutation(key, action)).rejects.toThrow("reconciliation");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh attempt only after a proven pre-seal rejection", async () => {
    const key = mutationKey(URL, "create");
    await expect(runMutation(key, async () => { throw new CommandError("REJECTED_RESOURCE_CAP", "Full", { coordinatorCode: "ERR_ADMISSION_CAPACITY_FULL" }); })).rejects.toThrow();
    expect(hasPendingMutation(key)).toBe(false);
    expect(await runMutation(key, async () => "accepted")).toBe("accepted");
  });

  it("fails before the financial command if local storage cannot write", async () => {
    const action = vi.fn();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await expect(runMutation(mutationKey(URL, "create"), action)).rejects.toThrow("Full");
    expect(action).not.toHaveBeenCalled();
  });

  it("restores records without creating or refunding anything", async () => {
    const { result } = renderHook(() => usePrivateTransfers(session, URL));
    await flush();
    expect(result.current.selected?.swapId).toBe(transfer.swapId);
    expect(contractRequest).not.toHaveBeenCalled();
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it("guards rapid double submits and sends the exact SDK payout policy", async () => {
    const pending = deferred<ContractRequestResult>();
    vi.mocked(contractRequest).mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePrivateTransfers(session, URL));
    await flush();
    const input = { amountSol: "1.5", destination: DESTINATION, deadlineMs: 0 };
    let first!: Promise<void>;
    act(() => { first = result.current.createTransfer(input); void result.current.createTransfer(input); });
    await flush();
    expect(contractRequest).toHaveBeenCalledTimes(1);
    expect(contractRequest).toHaveBeenCalledWith(session, {
      amountLamports: 1_500_000_000, payoutPolicy: { destinations: [{ address: DESTINATION, sharePercent: 100 }], totalDeadlineMs: 0 },
    });
    pending.reject(new TransportError("CONNECTION_LOST", "Unknown"));
    await act(async () => { await first; });
    expect(result.current.creationBlocked).toBe(true);
  });

  it("correlates refunds and refuses a second unknown request", async () => {
    vi.mocked(requestRefund).mockRejectedValue(new TransportError("CONNECTION_LOST", "Unknown refund"));
    const { result } = renderHook(() => usePrivateTransfers(session, URL));
    await flush();
    await act(async () => { await result.current.refund(transfer, view("other-transfer")); });
    expect(requestRefund).not.toHaveBeenCalled();
    await act(async () => { await result.current.refund(transfer, view()); });
    expect(requestRefund).toHaveBeenCalledExactlyOnceWith(session, { swapId: transfer.swapId, syncSecret: transfer.syncSecret, recoveryCode: transfer.recoveryCode });
    await act(async () => { await result.current.refund(transfer, view()); });
    expect(requestRefund).toHaveBeenCalledTimes(1);
    expect(result.current.refundBlocked).toBe(true);
  });

  it("blocks commands until saved records have loaded", async () => {
    const pending = deferred<readonly PersistedTransfer[]>();
    vi.mocked(listPersistedTransfers).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => usePrivateTransfers(session, URL));
    await act(async () => { await result.current.createTransfer({ amountSol: "1.5", destination: DESTINATION, deadlineMs: 0 }); });
    expect(contractRequest).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
    pending.resolve([transfer]);
    await flush();
    expect(result.current.loaded).toBe(true);
  });

  it("does not clear an unknown refund from stale or unrelated refund history", async () => {
    vi.mocked(requestRefund).mockRejectedValue(new TransportError("CONNECTION_LOST", "Unknown"));
    const { result } = renderHook(() => usePrivateTransfers(session, URL));
    await flush();
    await act(async () => { await result.current.refund(transfer, view()); });
    const original = view();
    const sameVersion: SyncUserResponse = { ...original, actor_sync: { actor: "normal_user", snapshot: { ...original.actor_sync!.snapshot, refundability: "request_pending", refund_status: "queued" } } };
    act(() => result.current.reconcileRefund(sameVersion));
    expect(result.current.refundBlocked).toBe(true);
    const unrelated: SyncUserResponse = { ...sameVersion, actor_sync: { actor: "normal_user", snapshot: { ...original.actor_sync!.snapshot, state_version: 2, refund_status: "failed" } } };
    act(() => result.current.reconcileRefund(unrelated));
    expect(result.current.refundBlocked).toBe(true);
    const pendingRefund: SyncUserResponse = { ...sameVersion, actor_sync: { actor: "normal_user", snapshot: { ...sameVersion.actor_sync!.snapshot, state_version: 3 } } };
    act(() => result.current.reconcileRefund(pendingRefund));
    expect(result.current.refundBlocked).toBe(false);
  });

});

describe("sync and WebSocket hints", () => {
  it("reads authoritative sync, rejects mismatched records and marks status stale", async () => {
    vi.mocked(sync).mockResolvedValueOnce(view("other-transfer"));
    const fail = vi.fn();
    const { result } = renderHook(() => useTransferStatus(session, transfer, fail));
    await flush();
    expect(result.current.view).toBeNull();
    expect(result.current.fresh).toBe(false);
    expect(result.current.error?.message).toContain("different transfer");
  });

  it("coalesces push hints received during a sync and stops polling terminal states", async () => {
    const pending = deferred<SyncUserResponse>();
    vi.mocked(sync).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...view(), state: "completed" });
    const fail = vi.fn();
    const { result } = renderHook(() => useTransferStatus(session, transfer, fail));
    const hint = vi.mocked(subscribe).mock.calls[0][2];
    const event = { subjectType: "transfer", subjectId: transfer.swapId, stateVersion: 2, eventKind: "fulfilled", createdAtMs: 1, syncRequired: true } as const;
    act(() => { hint(event); hint(event); });
    expect(sync).toHaveBeenCalledTimes(1);
    pending.resolve(view());
    await flush();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(result.current.view?.state).toBe("completed");
    act(() => result.current.refresh());
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("ignores stale results after switching transfers and cleans subscriptions", async () => {
    const pending = deferred<SyncUserResponse>();
    vi.mocked(sync).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(view("transfer-b"));
    const unsubscribe = vi.fn();
    vi.mocked(subscribe).mockReturnValue(unsubscribe);
    const fail = vi.fn();
    const { result, rerender, unmount } = renderHook(({ record }) => useTransferStatus(session, record, fail), { initialProps: { record: transfer } });
    rerender({ record: { ...transfer, swapId: "transfer-b" } });
    await flush();
    pending.resolve(view());
    await flush();
    expect(result.current.view?.actor_sync?.snapshot.contract_id).toBe("transfer-b");
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("retries reads only and prevents attestation failures from retrying", async () => {
    vi.useFakeTimers();
    vi.mocked(sync).mockRejectedValueOnce(new TransportError("CONNECTION_LOST", "Dropped")).mockResolvedValueOnce(view());
    const fail = vi.fn();
    const { result } = renderHook(() => useTransferStatus(session, transfer, fail));
    await flush();
    expect(result.current.fresh).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(result.current.fresh).toBe(true);
    vi.mocked(sync).mockRejectedValueOnce(new AttestationError("NOT_ATTESTED", "Expired"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(fail).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(sync).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(sync).toHaveBeenCalledTimes(calls);
    expect(contractRequest).not.toHaveBeenCalled();
    expect(requestRefund).not.toHaveBeenCalled();
  });
});
