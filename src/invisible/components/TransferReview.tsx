import type { Ref } from "react";
import type { PrivateTransferInput } from "../usePrivateTransferController";
import { windowLabel } from "../presentation";
import { SolIcon } from "../ui/Icons";
import { Dialog } from "../ui/Dialog";

export function TransferReview({
  input,
  canCreate,
  onConfirm,
  ref,
}: {
  input: PrivateTransferInput;
  canCreate: boolean;
  onConfirm: () => Promise<void>;
  ref: Ref<HTMLDialogElement>;
}) {
  const { amountSol, destination, deadlineMs } = input;
  return (
    <Dialog
      ref={ref}
      title="Review transfer"
      closeLabel="Close review"
      className="review-dialog"
    >
      <div className="review-amount">
        <SolIcon />
        <strong>{amountSol || "0"} SOL</strong>
      </div>
      <p className="muted">Private transfer on Solana devnet</p>
      <dl className="status-facts">
        <div>
          <dt>Recipient</dt>
          <dd className="full-address">{destination}</dd>
        </div>
        <div>
          <dt>Payout window</dt>
          <dd>{windowLabel(deadlineMs)}</dd>
        </div>
      </dl>
      <p className="hint">
        Create the deposit address, save your Recovery Code, then send the exact
        deposit from your own wallet. The accepted policy determines fees and
        the final payout.
      </p>
      <button
        type="button"
        className="primary-action"
        disabled={!canCreate}
        onClick={() => void onConfirm()}
      >
        Create private transfer
      </button>
    </Dialog>
  );
}
