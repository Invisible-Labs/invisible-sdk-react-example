import { useId, useState } from "react";
import { INSTANT_PAYOUT_WINDOW_MS } from "@invisible-labs/sdk/user";
import { PayoutWindowPicker } from "./PayoutWindowPicker";
import type { PrivateTransferController } from "../usePrivateTransferController";
import { Icon } from "../ui/Icons";
import { ErrorMessage } from "../ui/ErrorMessage";
import { TransferForm } from "./TransferForm";
import { TransferActivity } from "./TransferActivity";

export type TransferTab = "transfer" | "activity";
const SOURCE_URL =
  "https://github.com/Invisible-Labs/invisible-sdk-react-example";
const DOCS_URL = "https://docs.invisible.exchange/docs/sdk/";

export function PrivateTransferWidget({
  controller,
  tab,
  onTabChange,
}: {
  controller: PrivateTransferController;
  tab: TransferTab;
  onTabChange: (tab: TransferTab) => void;
}) {
  const settingsId = useId();
  const [deadlineMs, setDeadlineMs] = useState(INSTANT_PAYOUT_WINDOW_MS);
  const helpId = useId();
  const transferTabId = useId();
  const activityTabId = useId();
  const transferPanelId = useId();
  const activityPanelId = useId();
  const { transfers, connection, canCreate } = controller;
  return (
    <div className="invisible-widget">
      <div className="toolbar">
        <div
          className="tabs"
          role="tablist"
          aria-label="Private transfer"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "transfer"
                : event.key === "End"
                  ? "activity"
                  : tab === "transfer"
                    ? "activity"
                    : "transfer";
            onTabChange(next);
            event.currentTarget
              .querySelector<HTMLButtonElement>(
                `[id="${next === "transfer" ? transferTabId : activityTabId}"]`,
              )
              ?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id={transferTabId}
            tabIndex={tab === "transfer" ? 0 : -1}
            aria-selected={tab === "transfer"}
            aria-controls={transferPanelId}
            onClick={() => onTabChange("transfer")}
          >
            Transfer
          </button>
          <button
            type="button"
            role="tab"
            id={activityTabId}
            tabIndex={tab === "activity" ? 0 : -1}
            aria-selected={tab === "activity"}
            aria-controls={activityPanelId}
            onClick={() => onTabChange("activity")}
          >
            Activity
            {transfers.transfers.length > 0 && (
              <span className="count">{transfers.transfers.length}</span>
            )}
          </button>
        </div>
        <div className="toolbar-tools">
          <button
            type="button"
            className="icon-button"
            title="Transfer activity"
            aria-label="Transfer activity"
            onClick={() => onTabChange("activity")}
          >
            <Icon name="clock" />
          </button>
          <button
            type="button"
            className="icon-button settings-trigger"
            aria-label="Transfer settings"
            popoverTarget={settingsId}
          >
            <Icon name="settings" />
          </button>
          <button
            type="button"
            className="icon-button help-trigger"
            aria-label="Help and documentation"
            popoverTarget={helpId}
          >
            <Icon name="help" />
          </button>
        </div>
      </div>
      <div id={settingsId} popover="auto" className="settings-popover">
        <h2>Transfer settings</h2>
        <PayoutWindowPicker value={deadlineMs} onChange={setDeadlineMs} />
        <div className="settings-row">
          <span>Network</span>
          <span className="muted">Solana devnet</span>
        </div>
        <p className="hint">
          Scheduled payouts follow the accepted coordinator policy. Only devnet
          SOL is supported.
        </p>
      </div>

      <section
        id={transferPanelId}
        role="tabpanel"
        aria-labelledby={transferTabId}
        hidden={tab !== "transfer"}
      >
        <TransferForm
          deadlineMs={deadlineMs}
          canCreate={canCreate}
          busy={transfers.busy}
          phase={connection.phase}
          onReconnect={controller.reconnect}
          onCreate={async (input) => {
            await controller.createTransfer(input);
            onTabChange("activity");
          }}
        />
      </section>
      <section
        id={activityPanelId}
        role="tabpanel"
        aria-labelledby={activityTabId}
        hidden={tab !== "activity"}
      >
        <TransferActivity
          controller={controller}
          onCreate={() => onTabChange("transfer")}
        />
      </section>
      {transfers.creationBlocked && (
        <p role="status" className="notice">
          An incomplete or uncertain request is saved.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => onTabChange("activity")}
          >
            Review activity
          </button>{" "}
          before creating another transfer.
        </p>
      )}
      <ErrorMessage error={connection.error} />
      <ErrorMessage error={transfers.error} />
      <div id={helpId} popover="auto" className="help-popover">
        <h2>Invisible example</h2>
        <p className="hint">
          Devnet beta. Your Recovery Code is stored in this browser. Browser
          storage is not an encrypted vault.
        </p>
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          SDK documentation ↗
        </a>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source and integration guide ↗
        </a>
        <button
          type="button"
          className="text-button"
          disabled={transfers.busy || connection.phase === "connecting"}
          onClick={controller.reconnect}
        >
          Reconnect to Invisible
        </button>
      </div>
    </div>
  );
}
