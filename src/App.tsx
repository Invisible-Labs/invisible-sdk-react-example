import { useEffect, useState, type FormEvent } from "react";
import { invisibleDevnet } from "@invisible-labs/sdk/presets";
import {
  INSTANT_PAYOUT_WINDOW_MS, MIN_ENTRY_AMOUNT_LAMPORTS, MAX_ENTRY_AMOUNT_LAMPORTS,
  SUPPORTED_TOTAL_DEADLINE_MS, recoveryCodeToHex,
} from "@invisible-labs/sdk/user";
import { formatSol, isTerminalState, toUiError, useInvisibleSession, usePrivateTransfers, useTransferStatus, type InvisibleUiError } from "./invisible";

const COORDINATOR_URL = import.meta.env.VITE_INVISIBLE_COORDINATOR_URL?.trim() || invisibleDevnet();
const MILLISECONDS_PER_MINUTE = 60_000;
const INITIAL_AMOUNT_SOL = formatSol(MIN_ENTRY_AMOUNT_LAMPORTS);

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

function ErrorMessage({ error }: { error: InvisibleUiError | null }) {
  return error ? <p role="alert" className="error">{error.message}{error.remoteAccepted ? " The coordinator already accepted this request. Do not create another; reconcile the saved transfer." : ""}</p> : null;
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [error, setError] = useState<InvisibleUiError | null>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(null); }
    catch (error) { setError(toUiError(error)); }
  }
  return <div className="copy-value"><span>{label}</span><code>{value}</code><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><ErrorMessage error={error} /></div>;
}

export default function App() {
  const connection = useInvisibleSession(COORDINATOR_URL);
  const transfers = usePrivateTransfers(connection.session, COORDINATOR_URL);
  const status = useTransferStatus(connection.session, transfers.selected, connection.fail);
  const [amountSol, setAmountSol] = useState(INITIAL_AMOUNT_SOL);
  const [destination, setDestination] = useState("");
  const [deadlineMs, setDeadlineMs] = useState(INSTANT_PAYOUT_WINDOW_MS);
  const [recoveryInput, setRecoveryInput] = useState("");
  const transfer = transfers.selected;
  const snapshot = status.view?.actor_sync?.snapshot;
  const isTerminal = status.view ? isTerminalState(status.view.state) : transfer?.stage === "terminal-cleaned";
  const ready = connection.phase === "connected";
  const canRefund = ready && status.fresh && snapshot?.refundability === "available_now" && !transfers.refundBlocked && !transfers.busy;
  const depositExpiry = transfer?.depositExpiresAtMs;
  const coordinatorNow = Date.now() + ((transfer?.coordinatorTimestampMs ?? transfer?.updatedAtMs ?? Date.now()) - (transfer?.updatedAtMs ?? Date.now()));
  const depositExpired = depositExpiry !== undefined && coordinatorNow >= depositExpiry;
  const canDeposit = !depositExpired && ready && transfer?.stage === "ready" && transfer.status === "awaiting_deposit" &&
    !isTerminal && (status.view === null || status.view.state === "awaiting_deposit");

  useEffect(() => {
    if (status.fresh && status.view) {
      transfers.reconcileRefund(status.view);
      if (isTerminalState(status.view.state)) void transfers.reload().catch(connection.fail);
    }
  }, [status.fresh, status.view, transfers.reconcileRefund, transfers.reload, connection.fail]);

  useEffect(() => { setRecoveryInput(""); }, [transfers.selectedId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    await transfers.createTransfer({ amountSol, destination, deadlineMs });
  }

  async function refund() {
    if (!transfer || !status.view || !canRefund) return;
    await transfers.refund(transfer, status.view, recoveryInput);
    setRecoveryInput("");
    status.refresh();
  }

  return <main>
    <header>
      <span className="tag">SOLANA DEVNET</span>
      <h1>Invisible, in React.</h1>
      <p>A small, copyable example for private SOL transfers.</p>
      <nav><a href="https://github.com/Invisible-Labs/invisible-sdk-react-example">Source and integration guide</a><a href="https://docs.invisible.exchange/docs/sdk/">SDK documentation</a></nav>
    </header>

    <section aria-labelledby="session-title">
      <h2 id="session-title">1. Connect</h2>
      <p>Connection: <strong>{connection.phase}</strong>. The SDK verifies the coordinator before enabling transfers.</p>
      <div className="actions">
        <button disabled={connection.phase === "connecting" || ready || transfers.busy} onClick={() => void connection.connect()}>Connect</button>
        <button disabled={connection.phase === "disconnected" || transfers.busy} onClick={connection.disconnect}>Disconnect</button>
        <button disabled={connection.phase === "connecting" || transfers.busy} onClick={() => { connection.disconnect(); void connection.connect(); }}>Reconnect</button>
      </div>
      <ErrorMessage error={connection.error} />
      <p className="hint">This beta uses devnet SOL. Recovery material is saved in this browser by the SDK. Browser storage is not an encrypted vault.</p>
    </section>

    <section aria-labelledby="create-title">
      <h2 id="create-title">2. Create a private transfer</h2>
      <form onSubmit={event => void create(event)}>
        <label>SOL amount<input required inputMode="decimal" value={amountSol} onChange={event => setAmountSol(event.target.value)} /></label>
        <p className="hint">{formatSol(MIN_ENTRY_AMOUNT_LAMPORTS)} to {formatSol(MAX_ENTRY_AMOUNT_LAMPORTS)} SOL. Send this exact deposit amount; the final payout follows the coordinator policy and fees.</p>
        <label>Destination address<input required autoComplete="off" spellCheck={false} value={destination} onChange={event => setDestination(event.target.value)} /></label>
        <label>Payout window<select value={deadlineMs} onChange={event => setDeadlineMs(Number(event.target.value))}>
          {SUPPORTED_TOTAL_DEADLINE_MS.map(windowMs => <option key={windowMs} value={windowMs}>{windowMs === INSTANT_PAYOUT_WINDOW_MS ? "Instant" : `${windowMs / MILLISECONDS_PER_MINUTE} minutes`}</option>)}
        </select></label>
        <button disabled={!ready || !transfers.loaded || transfers.busy || transfers.creationBlocked}>{transfers.busy ? "Request in progress..." : "Create transfer"}</button>
      </form>
      {transfers.creationBlocked && <p role="status">An incomplete or uncertain request is saved. Reconnect and review it before creating another transfer.</p>}
      <ErrorMessage error={transfers.error} />
    </section>

    <section aria-labelledby="status-title">
      <h2 id="status-title">3. Deposit and follow the transfer</h2>
      {transfers.transfers.length > 0 ? <label>Saved transfer<select value={transfers.selectedId ?? ""} disabled={transfers.busy} onChange={event => transfers.select(event.target.value)}>
        {transfers.transfers.map(record => <option key={record.swapId} value={record.swapId}>{record.swapId} ({formatSol(record.amountLamports)} SOL)</option>)}
      </select></label> : <p>Connect to load saved transfers, or create your first transfer.</p>}
      {transfer && <>
        <p aria-live="polite">Status: <strong>{snapshot ? PHASE_LABELS[snapshot.settlement_phase] ?? snapshot.settlement_phase : status.view?.state ?? transfer.status}</strong>{!status.fresh && " (last known state)"}</p>
        <p className="hint">Refund eligibility: {snapshot?.refundability ?? "waiting for status"}. Refund outcome: {snapshot?.refund_status ?? "none"}.</p>
        {canDeposit && <>
          <p>Save your Recovery Code, then send exactly <strong>{formatSol(transfer.amountLamports)} devnet SOL</strong> from your own Solana wallet to:</p>
          <CopyValue key={transfer.depositAddress} label="Deposit address" value={transfer.depositAddress!} />
          {depositExpiry && <p>Deposit expires: <time dateTime={new Date(depositExpiry).toISOString()}>{new Date(depositExpiry).toLocaleString()}</time>. Do not fund an expired address.</p>}
          <p className="hint">The SDK creates and delegates the deposit wallet. Your external wallet sends the deposit; this example does not submit wallet transactions.</p>
        </>}
        {depositExpired && transfer.stage === "ready" && !isTerminal && <p role="status">The deposit window has expired. Do not send funds; refresh the authoritative status.</p>}
        {transfer.stage === "allocation" && <p role="alert">Initialization did not finish. Do not send funds. No automatic allocation or DKG replay is attempted.</p>}
        {transfer.recoveryCode && !isTerminal && <details><summary>Recovery Code (keep private)</summary><CopyValue key={transfer.swapId} label="Recovery Code" value={recoveryCodeToHex(transfer.recoveryCode)} /></details>}
        {transfer.depositAddress && snapshot && <p>Net payout in the accepted policy: {formatSol(transfer.policySnapshot.net_payout_lamports)} SOL. Settled: {formatSol(snapshot.settled_amount_lamports)} SOL.</p>}
        {status.view && <ul aria-label="Confirmed payouts">
          {status.view.fragments_executed.map(payout => <li key={`${payout.index}:${payout.tx_signature}`}>{formatSol(payout.amount_lamports)} SOL to {payout.destination_address}: <a href={`https://solscan.io/tx/${encodeURIComponent(payout.tx_signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View payout</a></li>)}
          {status.view.withdraw_execution && <li>Refund: {formatSol(status.view.withdraw_execution.amount_lamports)} SOL to {status.view.withdraw_execution.destination_address}. <a href={`https://solscan.io/tx/${encodeURIComponent(status.view.withdraw_execution.tx_signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View refund</a></li>}
        </ul>}
        <button disabled={!ready || isTerminal} onClick={status.refresh}>Refresh status</button>
        <ErrorMessage error={status.error} />
        {!isTerminal && <>
          {!transfer.recoveryCode && <label>Recovery Code<input type="password" autoComplete="off" value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)} /></label>}
          <p>Refunds go to the original deposit wallet. An accepted request stays pending until sync confirms its outcome.</p>
          <button disabled={!canRefund || (!transfer.recoveryCode && !recoveryInput.trim())} onClick={() => void refund()}>Request refund</button>
          {transfers.refundBlocked && <p role="status">A refund request is pending or uncertain. Refresh status; do not submit it again.</p>}
        </>}
      </>}
    </section>
  </main>;
}
