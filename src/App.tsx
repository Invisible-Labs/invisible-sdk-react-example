import { useState } from "react";
import { invisibleDevnet } from "@invisible-labs/sdk/presets";
import { usePrivateTransferController } from "./invisible";
import { PrivateTransferWidget, type TransferTab } from "./invisible/ui";
import "./invisible/styles.css";

const COORDINATOR_URL =
  import.meta.env.VITE_INVISIBLE_COORDINATOR_URL?.trim() || invisibleDevnet();
const SOURCE_URL =
  "https://github.com/Invisible-Labs/invisible-sdk-react-example";
const DOCS_URL = "https://docs.invisible.exchange/docs/sdk/";

export default function App() {
  const controller = usePrivateTransferController(COORDINATOR_URL);
  const [tab, setTab] = useState<TransferTab>("transfer");
  const { connection } = controller;
  return (
    <>
      <header className="app-header">
        <a className="brand" href={SOURCE_URL} aria-label="Invisible source">
          <span className="diamond" aria-hidden="true">
            ◇
          </span>
          <span>Invisible</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "transfer" ? "nav-active" : ""}
            onClick={() => setTab("transfer")}
          >
            Transfer
          </button>
          <button
            className={tab === "activity" ? "nav-active" : ""}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Docs<span aria-hidden="true">↗</span>
          </a>
        </nav>
        <span
          className="network"
          title={`Invisible connection: ${connection.phase}`}
        >
          <span className={`connection-dot phase-${connection.phase}`} />
          Solana devnet
        </span>
      </header>

      <main className="app-main">
        <PrivateTransferWidget
          controller={controller}
          tab={tab}
          onTabChange={setTab}
        />
      </main>
    </>
  );
}
