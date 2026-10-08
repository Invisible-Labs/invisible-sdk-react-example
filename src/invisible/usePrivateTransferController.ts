import { useCallback, useEffect } from "react";
import { useInvisibleSession } from "./useInvisibleSession";
import { usePrivateTransfers } from "./usePrivateTransfers";
import { useTransferStatus, isTerminalState } from "./useTransferStatus";

export type PrivateTransferInput = Parameters<
  ReturnType<typeof usePrivateTransfers>["createTransfer"]
>[0];

/** One session owner; presentation consumers share this controller. */
export function usePrivateTransferController(coordinatorUrl: string) {
  const connection = useInvisibleSession(coordinatorUrl);
  const transfers = usePrivateTransfers(connection.session, coordinatorUrl);
  const status = useTransferStatus(
    connection.session,
    transfers.selected,
    connection.fail,
  );
  const transfer = transfers.selected;
  const snapshot = status.view?.actor_sync?.snapshot;
  const isTerminal = status.view
    ? isTerminalState(status.view.state)
    : transfer?.stage === "terminal-cleaned";
  const ready = connection.phase === "connected";
  const canCreate =
    ready && transfers.loaded && !transfers.busy && !transfers.creationBlocked;
  const canRefund =
    ready &&
    !isTerminal &&
    snapshot?.contract_id === transfer?.swapId &&
    status.fresh &&
    snapshot?.refundability === "available_now" &&
    !transfers.refundBlocked &&
    !transfers.busy;
  const depositExpiry = transfer?.depositExpiresAtMs;
  const coordinatorNow =
    Date.now() +
    ((transfer?.coordinatorTimestampMs ?? transfer?.updatedAtMs ?? Date.now()) -
      (transfer?.updatedAtMs ?? Date.now()));
  const depositExpired =
    depositExpiry !== undefined && coordinatorNow >= depositExpiry;
  const canDeposit =
    !depositExpired &&
    ready &&
    transfer?.stage === "ready" &&
    transfer.status === "awaiting_deposit" &&
    !isTerminal &&
    (status.view === null || status.view.state === "awaiting_deposit");

  // Session setup is read-only. Financial commands remain explicit user actions.
  useEffect(() => {
    void connection.connect();
  }, [connection.connect]);
  useEffect(() => {
    if (status.fresh && status.view) {
      transfers.reconcileRefund(status.view);
      if (isTerminalState(status.view.state))
        void transfers.reload().catch(connection.fail);
    }
  }, [
    status.fresh,
    status.view,
    transfers.reconcileRefund,
    transfers.reload,
    connection.fail,
  ]);

  const reconnect = useCallback(() => {
    connection.disconnect();
    void connection.connect();
  }, [connection.disconnect, connection.connect]);
  const createTransfer = useCallback(
    async (input: PrivateTransferInput) => {
      if (canCreate) await transfers.createTransfer(input);
    },
    [canCreate, transfers.createTransfer],
  );
  const requestRefund = useCallback(
    async (recoveryInput: string) => {
      if (transfer && status.view && canRefund) {
        await transfers.refund(transfer, status.view, recoveryInput);
        status.refresh();
      }
    },
    [transfer, status.view, canRefund, transfers.refund, status.refresh],
  );

  return {
    connection,
    transfers,
    status,
    transfer,
    snapshot,
    isTerminal,
    ready,
    canCreate,
    canRefund,
    depositExpiry,
    depositExpired,
    canDeposit,
    reconnect,
    createTransfer,
    requestRefund,
  };
}
export type PrivateTransferController = ReturnType<
  typeof usePrivateTransferController
>;
