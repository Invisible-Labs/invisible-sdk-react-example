import { useEffect, useRef, useState, type FormEvent } from "react";
import { publicKey } from "@invisible-labs/sdk";
import { invisibleDevnet } from "@invisible-labs/sdk/presets";
import {
  INSTANT_PAYOUT_WINDOW_MS, MIN_ENTRY_AMOUNT_LAMPORTS, MAX_ENTRY_AMOUNT_LAMPORTS,
  SUPPORTED_TOTAL_DEADLINE_MS, recoveryCodeToHex,
} from "@invisible-labs/sdk/user";
import { formatSol, isTerminalState, parseSolAmount, toUiError, useInvisibleSession, usePrivateTransfers, useTransferStatus, type InvisibleUiError } from "./invisible";

const COORDINATOR_URL = import.meta.env.VITE_INVISIBLE_COORDINATOR_URL?.trim() || invisibleDevnet();
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
const ADDRESS_PREVIEW_LENGTH = 6;
const SOURCE_URL = "https://github.com/Invisible-Labs/invisible-sdk-react-example";
const DOCS_URL = "https://docs.invisible.exchange/docs/sdk/";
const SETTINGS_ID = "transfer-settings";
const HELP_ID = "integration-help";
const shortAddress = (address: string) => `${address.slice(0, ADDRESS_PREVIEW_LENGTH)}...${address.slice(-ADDRESS_PREVIEW_LENGTH)}`;
function windowLabel(windowMs: number) {
  if (windowMs === INSTANT_PAYOUT_WINDOW_MS) return "Instant";
  const [duration, unit] = windowMs >= MILLISECONDS_PER_DAY ? [windowMs / MILLISECONDS_PER_DAY, "day"] : windowMs >= MILLISECONDS_PER_HOUR ? [windowMs / MILLISECONDS_PER_HOUR, "hour"] : [windowMs / MILLISECONDS_PER_MINUTE, "minute"];
  return `${duration} ${unit}${duration === 1 ? "" : "s"}`;
}
const PHASE_LABELS: Record<string, string> = {
  awaiting_deposit: "Waiting for deposit", activating: "Activating transfer", waiting_for_liquidity: "Waiting for liquidity",
  retry_delayed: "Settlement delayed", recovery_required: "Recovery needed", matched_scheduled: "Payout scheduled",
  locked_pending_payout: "Preparing payout", submitted: "Payout submitted", confirming: "Confirming payout",
  completed: "Transfer complete", refund_pending: "Refund pending", refunded: "Refund complete", expired: "Transfer expired",
};
const ICON_PATHS = {
  arrow: "M12 4v16m-7-7 7 7 7-7", chevron: "m6 9 6 6 6-6", close: "m6 6 12 12M6 18 18 6",
  clock: "M12 7v5l3 2", check: "m5 12 4 4L19 6", copy: "M9 9h11v11H9zM5 15H3V3h12v2",
  help: "M9.5 8a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 4h.01",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
} as const;
function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {(name === "clock" || name === "help") && <circle cx="12" cy="12" r="9" />}<path d={ICON_PATHS[name]} />
  </svg>;
}
function SolIcon() {
  return <span className="sol-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 4 16 0-3 4H2zm-3 6h16l3 4H5zm3 6h16l-3 4H2z" /></svg></span>;
}
function ErrorMessage({ error }: { error: InvisibleUiError | null }) {
  return error ? <p role="alert" className="error">{error.message}{error.remoteAccepted ? " This request was already accepted. Check its saved status before submitting again." : ""}</p> : null;
}
function CopyValue({ label, value }: { label: string; value: string }) {
  const [error, setError] = useState<InvisibleUiError | null>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(null); }
    catch (error) { setError(toUiError(error)); }
  }
  return <div className="copy-value"><span className="muted">{label}</span><div><code>{value}</code><button className="icon-button" type="button" aria-label={copied ? `${label} copied` : `Copy ${label}`} onClick={copy}><Icon name={copied ? "check" : "copy"} /></button></div><ErrorMessage error={error} /></div>;
}

export default function App() {
  const connection = useInvisibleSession(COORDINATOR_URL);
  const transfers = usePrivateTransfers(connection.session, COORDINATOR_URL);
  const status = useTransferStatus(connection.session, transfers.selected, connection.fail);
  const [tab, setTab] = useState<"transfer" | "activity">("transfer");
  const [amountSol, setAmountSol] = useState("");
  const [destination, setDestination] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [deadlineMs, setDeadlineMs] = useState(INSTANT_PAYOUT_WINDOW_MS);
  const [formError, setFormError] = useState<InvisibleUiError | null>(null);
  const [recipientError, setRecipientError] = useState<InvisibleUiError | null>(null);
  const recipientDialog = useRef<HTMLDialogElement>(null);
  const recipientField = useRef<HTMLInputElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const transfer = transfers.selected;
  const snapshot = status.view?.actor_sync?.snapshot;
  const isTerminal = status.view ? isTerminalState(status.view.state) : transfer?.stage === "terminal-cleaned";
  const ready = connection.phase === "connected";
  const canCreate = ready && transfers.loaded && !transfers.busy && !transfers.creationBlocked;
  const canRefund = ready && status.fresh && snapshot?.refundability === "available_now" && !transfers.refundBlocked && !transfers.busy;
  const depositExpiry = transfer?.depositExpiresAtMs;
  const coordinatorNow = Date.now() + ((transfer?.coordinatorTimestampMs ?? transfer?.updatedAtMs ?? Date.now()) - (transfer?.updatedAtMs ?? Date.now()));
  const depositExpired = depositExpiry !== undefined && coordinatorNow >= depositExpiry;
  const canDeposit = !depositExpired && ready && transfer?.stage === "ready" && transfer.status === "awaiting_deposit" &&
    !isTerminal && (status.view === null || status.view.state === "awaiting_deposit");

  // Session setup is read-only. Financial commands remain explicit user actions.
  useEffect(() => { void connection.connect(); }, [connection.connect]);
  useEffect(() => {
    if (status.fresh && status.view) {
      transfers.reconcileRefund(status.view);
      if (isTerminalState(status.view.state)) void transfers.reload().catch(connection.fail);
    }
  }, [status.fresh, status.view, transfers.reconcileRefund, transfers.reload, connection.fail]);

  function chooseRecipient(event: FormEvent) {
    event.preventDefault();
    try {
      publicKey(recipientInput.trim());
      setDestination(recipientInput.trim());
      setRecipientError(null);
      recipientDialog.current?.close();
    } catch (error) { setRecipientError(toUiError(error)); }
  }
  function review(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    try {
      parseSolAmount(amountSol);
      publicKey(destination);
      setFormError(null);
      reviewDialog.current?.showModal();
    } catch (error) { setFormError(toUiError(error)); }
  }
  async function create() {
    if (!canCreate) return;
    reviewDialog.current?.close();
    await transfers.createTransfer({ amountSol, destination, deadlineMs });
    setTab("activity");
  }
  function reconnect() { connection.disconnect(); void connection.connect(); }

  return <>
    <header className="app-header">
      <a className="brand" href={SOURCE_URL} aria-label="Invisible source"><span className="diamond" aria-hidden="true">◇</span><span>Invisible</span></a>
      <nav aria-label="Main navigation">
        <button className={tab === "transfer" ? "nav-active" : ""} onClick={() => setTab("transfer")}>Transfer</button>
        <button className={tab === "activity" ? "nav-active" : ""} onClick={() => setTab("activity")}>Activity</button>
        <a href={DOCS_URL} target="_blank" rel="noreferrer">Docs<Icon name="chevron" /></a>
      </nav>
      <span className="network" title={`Invisible connection: ${connection.phase}`}><span className={`connection-dot phase-${connection.phase}`} />Solana devnet</span>
    </header>

    <main className="app-main">
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Private transfer" onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "transfer" : event.key === "End" ? "activity" : tab === "transfer" ? "activity" : "transfer";
          setTab(next);
          event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
        }}>
          <button role="tab" id="transfer-tab" tabIndex={tab === "transfer" ? 0 : -1} aria-selected={tab === "transfer"} aria-controls="transfer-panel" onClick={() => setTab("transfer")}>Transfer</button>
          <button role="tab" id="activity-tab" tabIndex={tab === "activity" ? 0 : -1} aria-selected={tab === "activity"} aria-controls="activity-panel" onClick={() => setTab("activity")}>Activity{transfers.transfers.length > 0 && <span className="count">{transfers.transfers.length}</span>}</button>
        </div>
        <div className="toolbar-tools">
          <button className="icon-button" title="Transfer activity" aria-label="Transfer activity" onClick={() => setTab("activity")}><Icon name="clock" /></button>
          <button className="icon-button settings-trigger" aria-label="Transfer settings" popoverTarget={SETTINGS_ID}><Icon name="settings" /></button>
        </div>
      </div>
      <div id={SETTINGS_ID} popover="auto" className="settings-popover">
        <h2>Transfer settings</h2>
        <label className="settings-row">Payout window<select value={deadlineMs} onChange={event => setDeadlineMs(Number(event.target.value))}>{SUPPORTED_TOTAL_DEADLINE_MS.map(windowMs => <option key={windowMs} value={windowMs}>{windowLabel(windowMs)}</option>)}</select></label>
        <div className="settings-row"><span>Network</span><span className="muted">Solana devnet</span></div>
        <p className="hint">Scheduled payouts follow the accepted coordinator policy. Only devnet SOL is supported.</p>
      </div>

      <section id="transfer-panel" role="tabpanel" aria-labelledby="transfer-tab" hidden={tab !== "transfer"}>
        <form onSubmit={review}>
          <div className="amount-card">
            <label className="muted" htmlFor="amount">Send</label>
            <div className="amount-row"><input id="amount" aria-label="SOL amount" required inputMode="decimal" autoComplete="off" placeholder="0" value={amountSol} onChange={event => setAmountSol(event.target.value)} /><span className="token-pill"><SolIcon />SOL</span></div>
            <div className="card-caption"><span>Solana devnet</span><span>{formatSol(MIN_ENTRY_AMOUNT_LAMPORTS)} - {formatSol(MAX_ENTRY_AMOUNT_LAMPORTS)} SOL</span></div>
          </div>
          <div className="flow-arrow" aria-hidden="true"><Icon name="arrow" /></div>
          <div className="recipient-card">
            <span className="muted">To</span>
            <div className="amount-row"><span className={`receive-amount ${amountSol ? "entered" : ""}`}>{amountSol || "0"}</span><button className={`recipient-pill ${destination ? "selected" : ""}`} type="button" aria-haspopup="dialog" aria-label={destination ? "Change recipient address" : "Select recipient address"} onClick={() => { setRecipientInput(destination); setRecipientError(null); recipientDialog.current?.showModal(); recipientField.current?.focus(); }}>{destination ? shortAddress(destination) : "Select recipient"}<Icon name="chevron" /></button></div>
            <div className="card-caption"><span>SOL · Before fees</span><span>{windowLabel(deadlineMs)}</span></div>
          </div>
          <button className="primary-action" disabled={!canCreate || !amountSol.trim() || !destination}>{transfers.busy ? "Creating transfer..." : connection.phase === "connecting" ? "Connecting..." : !ready ? "Connection unavailable" : !amountSol.trim() ? "Enter an amount" : !destination ? "Select recipient" : "Review transfer"}</button>
          {connection.phase === "error" && <button className="text-button retry-button" type="button" disabled={transfers.busy} onClick={reconnect}>Retry connection</button>}
        </form>
        <p className="form-footnote">No wallet connection needed. Fund the deposit from your own wallet.</p>
      </section>

      <section id="activity-panel" role="tabpanel" aria-labelledby="activity-tab" hidden={tab !== "activity"}>
        {transfers.transfers.length === 0 ? <div className="empty-state"><Icon name="clock" /><h2>No transfers yet</h2><p>Your saved transfers will appear here.</p><button className="text-button" onClick={() => setTab("transfer")}>Create a transfer</button></div> : <>
          <div className="transfer-list" aria-label="Saved transfers">{transfers.transfers.map(record => <button className={`transfer-item ${record.swapId === transfers.selectedId ? "selected" : ""}`} key={record.swapId} disabled={transfers.busy} onClick={() => transfers.select(record.swapId)}><SolIcon /><span><strong>{formatSol(record.amountLamports)} SOL</strong><small>{shortAddress(record.destinationAddress)}</small></span><span className="muted">{record.status.replaceAll("_", " ")}</span></button>)}</div>
          {transfer && <article className="status-card">
            <div className="status-heading"><h2 aria-live="polite">{snapshot ? PHASE_LABELS[snapshot.settlement_phase] ?? snapshot.settlement_phase : status.view?.state ?? transfer.status}</h2><button className="icon-button" aria-label="Refresh status" disabled={!ready || isTerminal} onClick={status.refresh}><Icon name="clock" /></button></div>
            {!status.fresh && <p className="hint">Last known state. Reconnect to refresh.</p>}
            {canDeposit && <>
              <p>Save your Recovery Code, then send exactly <strong>{formatSol(transfer.amountLamports)} devnet SOL</strong> to this deposit address.</p>
              <CopyValue key={transfer.depositAddress} label="Deposit address" value={transfer.depositAddress!} />
              {depositExpiry && <p className="hint">Deposit before <time dateTime={new Date(depositExpiry).toISOString()}>{new Date(depositExpiry).toLocaleString()}</time>. Do not fund an expired address.</p>}
            </>}
            {depositExpired && transfer.stage === "ready" && !isTerminal && <p role="status">The deposit window expired. Do not send funds; refresh status.</p>}
            {transfer.stage === "allocation" && <p role="alert" className="error">Initialization did not finish. Do not send funds. Check the saved transfer before trying again.</p>}
            {transfer.recoveryCode && !isTerminal && <details className="recovery"><summary>Recovery Code <span className="muted">Keep private</span></summary><CopyValue key={transfer.swapId} label="Recovery Code" value={recoveryCodeToHex(transfer.recoveryCode)} /></details>}
            {snapshot && <dl className="status-facts"><div><dt>Net payout</dt><dd>{formatSol(transfer.policySnapshot.net_payout_lamports)} SOL</dd></div><div><dt>Settled</dt><dd>{formatSol(snapshot.settled_amount_lamports)} SOL</dd></div><div><dt>Refund availability</dt><dd>{snapshot.refundability.replaceAll("_", " ")}</dd></div><div><dt>Refund outcome</dt><dd>{snapshot.refund_status ?? "None"}</dd></div></dl>}
            {status.view && <ul className="payouts" aria-label="Confirmed payouts">{status.view.fragments_executed.map(payout => <li key={`${payout.index}:${payout.tx_signature}`}><span>{formatSol(payout.amount_lamports)} SOL to {shortAddress(payout.destination_address)}</span><a href={`https://solscan.io/tx/${encodeURIComponent(payout.tx_signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View payout ↗</a></li>)}{status.view.withdraw_execution && <li><span>{formatSol(status.view.withdraw_execution.amount_lamports)} SOL refunded to {shortAddress(status.view.withdraw_execution.destination_address)}</span><a href={`https://solscan.io/tx/${encodeURIComponent(status.view.withdraw_execution.tx_signature)}?cluster=devnet`} target="_blank" rel="noreferrer">View refund ↗</a></li>}</ul>}
            <ErrorMessage error={status.error} />
            {!isTerminal && <RefundForm key={transfer.swapId} hasRecoveryCode={!!transfer.recoveryCode} canRefund={canRefund} blocked={transfers.refundBlocked} onRefund={async recoveryInput => { if (status.view && canRefund) { await transfers.refund(transfer, status.view, recoveryInput); status.refresh(); } }} />}
          </article>}
        </>}
        {connection.phase === "error" && <button className="text-button retry-button" disabled={transfers.busy} onClick={reconnect}>Retry connection</button>}
      </section>
      {transfers.creationBlocked && <p role="status" className="notice">An incomplete or uncertain request is saved. <button className="text-button" onClick={() => setTab("activity")}>Review activity</button> before creating another transfer.</p>}
      <ErrorMessage error={connection.error} /><ErrorMessage error={transfers.error} /><ErrorMessage error={formError} />
    </main>

    <dialog ref={recipientDialog} aria-labelledby="recipient-title" className="recipient-dialog" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><div className="dialog-content">
      <div className="dialog-heading"><h2 id="recipient-title">Select recipient</h2><button className="icon-button" aria-label="Close recipient" onClick={() => recipientDialog.current?.close()}><Icon name="close" /></button></div>
      <form onSubmit={chooseRecipient}><label className="address-field"><SolIcon /><input aria-label="Recipient address" ref={recipientField} required autoComplete="off" spellCheck={false} placeholder="Paste a Solana address" value={recipientInput} onChange={event => setRecipientInput(event.target.value)} /></label><div className="recipient-info"><SolIcon /><span><strong>Solana</strong><small>SOL · Devnet</small></span><Icon name="check" /></div><p className="hint">Only SOL transfers are supported. Check the full recipient address before continuing.</p><ErrorMessage error={recipientError} /><button className="primary-action" disabled={!recipientInput.trim()}>Use this address</button></form>
    </div></dialog>
    <dialog ref={reviewDialog} aria-labelledby="review-title" className="review-dialog"><div className="dialog-content">
      <div className="dialog-heading"><h2 id="review-title">Review transfer</h2><button className="icon-button" aria-label="Close review" onClick={() => reviewDialog.current?.close()}><Icon name="close" /></button></div>
      <div className="review-amount"><SolIcon /><strong>{amountSol || "0"} SOL</strong></div><p className="muted">Private transfer on Solana devnet</p>
      <dl className="status-facts"><div><dt>Recipient</dt><dd className="full-address">{destination}</dd></div><div><dt>Payout window</dt><dd>{windowLabel(deadlineMs)}</dd></div></dl>
      <p className="hint">Create the deposit address, save your Recovery Code, then send the exact deposit from your own wallet. The accepted policy determines fees and the final payout.</p>
      <button className="primary-action" disabled={!canCreate} onClick={() => void create()}>Create private transfer</button>
    </div></dialog>
    <button className="help-button icon-button" aria-label="Help and documentation" popoverTarget={HELP_ID}><Icon name="help" /></button>
    <div id={HELP_ID} popover="auto" className="help-popover"><h2>Invisible example</h2><p className="hint">Devnet beta. Your Recovery Code is stored in this browser. Browser storage is not an encrypted vault.</p><a href={DOCS_URL} target="_blank" rel="noreferrer">SDK documentation ↗</a><a href={SOURCE_URL} target="_blank" rel="noreferrer">Source and integration guide ↗</a><button className="text-button" disabled={transfers.busy || connection.phase === "connecting"} onClick={reconnect}>Reconnect to Invisible</button></div>
  </>;
}
function RefundForm({ hasRecoveryCode, canRefund, blocked, onRefund }: { hasRecoveryCode: boolean; canRefund: boolean; blocked: boolean; onRefund: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  return <form className="refund-form" onSubmit={event => { event.preventDefault(); if (canRefund) void onRefund(code).then(() => setCode("")); }}>
    {!hasRecoveryCode && <label>Recovery Code<input type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>}
    <p className="hint">Refunds return to the original deposit wallet. Acceptance is pending until status confirms the outcome.</p><button className="secondary-action" disabled={!canRefund || (!hasRecoveryCode && !code.trim())}>Request refund</button>
    {blocked && <p role="status" className="notice">A refund is pending or uncertain. Refresh status before submitting again.</p>}
  </form>;
}
