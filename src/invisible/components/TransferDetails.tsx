import { useState } from "react";
import { recoveryCodeToHex } from "@invisible-labs/sdk/user";
import { formatSol } from "../amount";
import { shortAddress } from "../presentation";
import type { PrivateTransferController } from "../usePrivateTransferController";
import { Icon } from "../ui/Icons";
import { ErrorMessage } from "../ui/ErrorMessage";
import { CopyValue } from "../ui/CopyValue";

const PHASE_LABELS: Record<string, string> = {
  awaiting_deposit: "Waiting for deposit",
  activating: "Activating transfer",
  waiting_for_liquidity: "Waiting for liquidity",
  retry_delayed: "Settlement delayed",
  recovery_required: "Recovery needed",
  matched_scheduled: "Payout scheduled",
  locked_pending_payout: "Preparing payout",
  submitted: "Payout submitted",
  confirming: "Confirming payout",
  completed: "Transfer complete",
  refund_pending: "Refund pending",
  refunded: "Refund complete",
  expired: "Transfer expired",
};
export function TransferDetails({
  controller,
}: {
  controller: PrivateTransferController;
}) {
  const {
    transfer,
    status,
    snapshot,
    ready,
    isTerminal,
    canDeposit,
    depositExpiry,
    depositExpired,
    canRefund,
    transfers,
    requestRefund,
  } = controller;
  if (!transfer) return null;
  return (
    <article className="status-card">
      <div className="status-heading">
        <h2 aria-live="polite">
          {snapshot
            ? (PHASE_LABELS[snapshot.settlement_phase] ??
              snapshot.settlement_phase)
            : (status.view?.state ?? transfer.status)}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh status"
          disabled={!ready || isTerminal}
          onClick={status.refresh}
        >
          <Icon name="clock" />
        </button>
      </div>
      {!status.fresh && (
        <p className="hint">Last known state. Reconnect to refresh.</p>
      )}
      {canDeposit && (
        <>
          <p>
            Save your Recovery Code, then send exactly{" "}
            <strong>{formatSol(transfer.amountLamports)} devnet SOL</strong> to
            this deposit address.
          </p>
          <CopyValue
            key={transfer.depositAddress}
            label="Deposit address"
            value={transfer.depositAddress!}
          />
          {depositExpiry && (
            <p className="hint">
              Deposit before{" "}
              <time dateTime={new Date(depositExpiry).toISOString()}>
                {new Date(depositExpiry).toLocaleString()}
              </time>
              . Do not fund an expired address.
            </p>
          )}
        </>
      )}
      {depositExpired && transfer.stage === "ready" && !isTerminal && (
        <p role="status">
          The deposit window expired. Do not send funds; refresh status.
        </p>
      )}
      {transfer.stage === "allocation" && (
        <p role="alert" className="error">
          Initialization did not finish. Do not send funds. Check the saved
          transfer before trying again.
        </p>
      )}
      {transfer.recoveryCode && !isTerminal && (
        <details className="recovery">
          <summary>
            Recovery Code <span className="muted">Keep private</span>
          </summary>
          <CopyValue
            key={transfer.swapId}
            label="Recovery Code"
            value={recoveryCodeToHex(transfer.recoveryCode)}
          />
        </details>
      )}
      {snapshot && (
        <dl className="status-facts">
          <div>
            <dt>Net payout</dt>
            <dd>
              {formatSol(transfer.policySnapshot.net_payout_lamports)} SOL
            </dd>
          </div>
          <div>
            <dt>Settled</dt>
            <dd>{formatSol(snapshot.settled_amount_lamports)} SOL</dd>
          </div>
          <div>
            <dt>Refund availability</dt>
            <dd>{snapshot.refundability.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Refund outcome</dt>
            <dd>{snapshot.refund_status ?? "None"}</dd>
          </div>
        </dl>
      )}
      {status.view && (
        <ul className="payouts" aria-label="Confirmed payouts">
          {status.view.fragments_executed.map((payout) => (
            <li key={`${payout.index}:${payout.tx_signature}`}>
              <span>
                {formatSol(payout.amount_lamports)} SOL to{" "}
                {shortAddress(payout.destination_address)}
              </span>
              <a
                href={`https://solscan.io/tx/${encodeURIComponent(payout.tx_signature)}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                View payout ↗
              </a>
            </li>
          ))}
          {status.view.withdraw_execution && (
            <li>
              <span>
                {formatSol(status.view.withdraw_execution.amount_lamports)} SOL
                refunded to{" "}
                {shortAddress(
                  status.view.withdraw_execution.destination_address,
                )}
              </span>
              <a
                href={`https://solscan.io/tx/${encodeURIComponent(status.view.withdraw_execution.tx_signature)}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                View refund ↗
              </a>
            </li>
          )}
        </ul>
      )}
      <ErrorMessage error={status.error} />
      {!isTerminal && (
        <RefundForm
          key={transfer.swapId}
          hasRecoveryCode={!!transfer.recoveryCode}
          canRefund={canRefund}
          blocked={transfers.refundBlocked}
          onRefund={requestRefund}
        />
      )}
    </article>
  );
}
function RefundForm({
  hasRecoveryCode,
  canRefund,
  blocked,
  onRefund,
}: {
  hasRecoveryCode: boolean;
  canRefund: boolean;
  blocked: boolean;
  onRefund: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      className="refund-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canRefund) void onRefund(code).then(() => setCode(""));
      }}
    >
      {!hasRecoveryCode && (
        <label>
          Recovery Code
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
      )}
      <p className="hint">
        Refunds return to the original deposit wallet. Acceptance is pending
        until status confirms the outcome.
      </p>
      <button
        type="submit"
        className="secondary-action"
        disabled={!canRefund || (!hasRecoveryCode && !code.trim())}
      >
        Request refund
      </button>
      {blocked && (
        <p role="status" className="notice">
          A refund is pending or uncertain. Refresh status before submitting
          again.
        </p>
      )}
    </form>
  );
}
