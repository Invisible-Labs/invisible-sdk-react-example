import { useId, useRef, useState, type FormEvent } from "react";
import { publicKey } from "@invisible-labs/sdk";
import {
  MIN_ENTRY_AMOUNT_LAMPORTS,
  MAX_ENTRY_AMOUNT_LAMPORTS,
} from "@invisible-labs/sdk/user";
import { formatSol, parseSolAmount } from "../amount";
import { toUiError, type InvisibleUiError } from "../errors";
import type { PrivateTransferController } from "../usePrivateTransferController";
import { windowLabel } from "../presentation";
import { Icon, SolIcon } from "../ui/Icons";
import { ErrorMessage } from "../ui/ErrorMessage";
import { TransferReview } from "./TransferReview";

export function TransferForm({
  deadlineMs,
  canCreate,
  busy,
  phase,
  onCreate,
  onReconnect,
}: {
  deadlineMs: number;
  canCreate: boolean;
  busy: boolean;
  phase: PrivateTransferController["connection"]["phase"];
  onCreate: PrivateTransferController["createTransfer"];
  onReconnect: () => void;
}) {
  const amountId = useId();
  const destinationId = useId();
  const [amountSol, setAmountSol] = useState("");
  const [destination, setDestination] = useState("");
  const [formError, setFormError] = useState<InvisibleUiError | null>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const ready = phase === "connected";
  function review(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    try {
      parseSolAmount(amountSol);
      const address = destination.trim();
      publicKey(address);
      setDestination(address);
      setFormError(null);
      reviewDialog.current?.showModal();
    } catch (error) {
      setFormError(toUiError(error));
    }
  }
  async function create() {
    if (!canCreate) return;
    reviewDialog.current?.close();
    await onCreate({ amountSol, destination, deadlineMs });
  }

  return (
    <>
      <form onSubmit={review}>
        <div className="amount-card">
          <label className="muted" htmlFor={amountId}>
            Send
          </label>
          <div className="amount-row">
            <input
              id={amountId}
              aria-label="SOL amount"
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amountSol}
              onChange={(event) => setAmountSol(event.target.value)}
            />
            <span className="token-pill">
              <SolIcon />
              SOL
            </span>
          </div>
          <div className="card-caption">
            <span>Solana devnet</span>
            <span>
              {formatSol(MIN_ENTRY_AMOUNT_LAMPORTS)} -{" "}
              {formatSol(MAX_ENTRY_AMOUNT_LAMPORTS)} SOL
            </span>
          </div>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <Icon name="arrow" />
        </div>
        <div className="recipient-card">
          <label className="muted" htmlFor={destinationId}>
            Destination address
          </label>
          <div className="address-field">
            <SolIcon />
            <input
              id={destinationId}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a Solana address"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </div>
          <div className="card-caption">
            <span>Solana devnet</span>
            <span>{windowLabel(deadlineMs)}</span>
          </div>
        </div>
        <button
          type="submit"
          className="primary-action"
          disabled={!canCreate || !amountSol.trim() || !destination.trim()}
        >
          {busy
            ? "Creating transfer..."
            : phase === "connecting"
              ? "Connecting..."
              : !ready
                ? "Connection unavailable"
                : !amountSol.trim()
                  ? "Enter an amount"
                  : !destination.trim()
                    ? "Enter a destination address"
                    : "Review transfer"}
        </button>
        {phase === "error" && (
          <button
            className="text-button retry-button"
            type="button"
            disabled={busy}
            onClick={onReconnect}
          >
            Retry connection
          </button>
        )}
      </form>
      <p className="form-footnote">
        No wallet connection needed. Fund the deposit from your own wallet.
      </p>
      <ErrorMessage error={formError} />
      <TransferReview
        ref={reviewDialog}
        input={{ amountSol, destination, deadlineMs }}
        canCreate={canCreate}
        onConfirm={create}
      />
    </>
  );
}
