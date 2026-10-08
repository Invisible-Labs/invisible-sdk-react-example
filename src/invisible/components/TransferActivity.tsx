import { formatSol } from "../amount";
import { shortAddress } from "../presentation";
import type { PrivateTransferController } from "../usePrivateTransferController";
import { Icon, SolIcon } from "../ui/Icons";
import { TransferDetails } from "./TransferDetails";

export function TransferActivity({
  controller,
  onCreate,
}: {
  controller: PrivateTransferController;
  onCreate: () => void;
}) {
  const { transfers, connection } = controller;
  return (
    <>
      {transfers.transfers.length === 0 ? (
        <div className="empty-state">
          <Icon name="clock" />
          <h2>No transfers yet</h2>
          <p>Your saved transfers will appear here.</p>
          <button type="button" className="text-button" onClick={onCreate}>
            Create a transfer
          </button>
        </div>
      ) : (
        <>
          <div className="transfer-list" aria-label="Saved transfers">
            {transfers.transfers.map((record) => (
              <button
                type="button"
                className={`transfer-item ${record.swapId === transfers.selectedId ? "selected" : ""}`}
                key={record.swapId}
                disabled={transfers.busy}
                onClick={() => transfers.select(record.swapId)}
              >
                <SolIcon />
                <span>
                  <strong>{formatSol(record.amountLamports)} SOL</strong>
                  <small>{shortAddress(record.destinationAddress)}</small>
                </span>
                <span className="muted">
                  {record.status.replaceAll("_", " ")}
                </span>
              </button>
            ))}
          </div>
          <TransferDetails controller={controller} />
        </>
      )}
      {connection.phase === "error" && (
        <button
          type="button"
          className="text-button retry-button"
          disabled={transfers.busy}
          onClick={controller.reconnect}
        >
          Retry connection
        </button>
      )}
    </>
  );
}
