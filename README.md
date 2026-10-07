# Invisible React example

A copyable frontend integration for private SOL transfers, using **Vite + React + TypeScript** and the public [`@invisible-labs/sdk`](https://www.npmjs.com/package/@invisible-labs/sdk). MIT licensed. Static hosting on Cloudflare Pages.

**Devnet beta:** the pinned SDK is `0.9.0-devnet`. Use devnet SOL. A compatible, available coordinator is required for real transfers.

[Live example](https://invisible-sdk-react-example.pages.dev/).

## Run

Node.js 24 recommended; Node.js 22.12+ supported.

```bash
git clone https://github.com/Invisible-Labs/invisible-sdk-react-example.git
cd invisible-sdk-react-example
npm ci
npm run dev
```

No GitHub Packages authentication or API key is needed. The SDK's `invisibleDevnet()` preset supplies the default route. To use another compatible coordinator, copy `.env.example` to `.env.local` and set `VITE_INVISIBLE_COORDINATOR_URL` to its public `wss://` URL. The route cannot override the SDK's embedded attestation policy.

1. Connect. The SDK opens the WebSocket, completes Noise XX and verifies attestation.
2. Enter an amount, destination and supported payout window. Create the transfer.
3. Save the Recovery Code. Send the exact displayed devnet SOL amount from your external Solana wallet to the deposit address before expiry.
4. Follow authenticated status updates, confirmed payouts and refund outcomes.
5. If eligible, request a refund to the original deposit wallet.

This example does not send the deposit transaction for you. Keep wallet funding in your application's existing wallet integration.

## Copy into your frontend

Copy **the entire `src/invisible/` folder**, excluding `invisible.test.tsx`, and install the same public SDK version:

```bash
npm install @invisible-labs/sdk@0.9.0-devnet
```

The folder depends only on React and the public SDK. It imports no app components, routing, design system, Vite environment variables or private workspace packages.

```tsx
import { invisibleDevnet } from "@invisible-labs/sdk/presets";
import { useInvisibleSession, usePrivateTransfers, useTransferStatus } from "./invisible";

const coordinatorUrl = invisibleDevnet();

function PrivateTransfer() {
  const connection = useInvisibleSession(coordinatorUrl);
  const transfers = usePrivateTransfers(connection.session, coordinatorUrl);
  const status = useTransferStatus(connection.session, transfers.selected, connection.fail);

  return <>
    <button onClick={() => void connection.connect()}>Connect</button>
    <button disabled={!connection.session || !transfers.loaded || transfers.busy || transfers.creationBlocked}
      onClick={() => void transfers.createTransfer({
        amountSol: "1.5",
        destination: "YOUR_SOLANA_DESTINATION_ADDRESS",
        deadlineMs: 0,
      })}>Create transfer</button>
    <p>{status.view?.state}</p>
    <p role="alert">{connection.error?.message ?? transfers.error?.message ?? status.error?.message}</p>
  </>;
}
```

See [`src/App.tsx`](src/App.tsx) for the complete deposit, saved-transfer, Recovery Code and refund UI. See the [folder guide](src/invisible/README.md) for lifecycle and integration details.

## Ownership and safety

- **SDK:** WebSocket transport, Noise, attestation, DKG/delegation, policy validation, recovery codes, typed errors and local transfer records.
- **Hooks:** React cleanup, command concurrency, selected transfer, polling, refresh subscriptions and readable errors.
- **Application:** form/UI, external wallet deposit and your storage/privacy policy.
- `SyncRequired` messages carry refresh hints. Only `sync` provides lifecycle truth.
- Polling never overlaps; retries apply to reads. A failed attestation stops the session. Disconnect closes it; reconnect creates and attests a fresh one. Select a saved transfer to resume reads.
- Mutations are never automatically replayed after timeout, disconnect or lost response. A non-secret local marker and native Web Locks prevent repeating an uncertain request across reloads and cooperating tabs. No client idempotency key is sent to the coordinator.
- A refund receipt is acceptance, not settlement. Keep reading sync for `refund_status`, landed amount and transaction signatures.
- Browser storage is **not an encrypted vault**. SDK records may contain the sync secret and Recovery Code. Same-origin scripts/profile access can read them. Terminal SDK records remove bearer secrets.
- SDK persistence does not save pre-delegation resume secrets or signing shares. An `allocation` record is not a fundable transfer. Do not recreate or resume it blindly.
- No LP integration, protocol implementation, raw WebSocket messages, secret logs, analytics or backend is included.

For a blocked uncertain request, reconnect and inspect the saved transfer first. The marker deliberately stays blocked if no authoritative outcome can be established. The [folder guide](src/invisible/README.md#uncertain-operations) describes this boundary.

## Cloudflare Pages

The live example uses a manual static upload. GitHub CI verifies the source; it does not automatically deploy the demo.

For automatic deployments of your own copy, connect your GitHub repository in **Workers & Pages > Create application > Pages > Import an existing Git repository**:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `24` (`NODE_VERSION` if needed) |
| Environment | Optional `VITE_INVISIBLE_COORDINATOR_URL` |

The build serves static HTML, CSS and JavaScript. The SDK connects from the browser directly to the coordinator. No SSR, Pages Function or server proxy is needed. `public/_headers` sets simple security headers. Keep WASM compilation enabled if you add a CSP.

[Cloudflare Vite deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/).

## Verify

```bash
bash scripts/local-ci.sh
npm run preview
```

CI runs the same install, behavioral tests, typecheck, production build and dependency audit. Tests cover failed attestation, recovery records, unknown outcomes, double submits, transfer correlation, refresh hints, stale responses, polling cleanup and terminal states.

Mocked tests verify the React adapter. They do not prove live coordinator compatibility, wallet funding or on-chain settlement. Validate those against a compatible coordinator before treating a transfer as operationally verified.

[Command inventory](docs/repo-actions.md) · [SDK docs](https://docs.invisible.exchange/docs/sdk/) · [Reference product](https://app.invisible.exchange/)
