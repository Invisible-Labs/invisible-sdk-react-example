import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession, type Session, TransportError } from "@invisible-labs/sdk";
import { contractRequest, listPersistedTransfers, requestRefund, sync, type ContractRequestResult, type PersistedTransfer, SUPPORTED_TOTAL_DEADLINE_MS } from "@invisible-labs/sdk/user";
import App from "./App";

vi.mock("@invisible-labs/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@invisible-labs/sdk")>();
  return { ...actual, createSession: vi.fn(), closeSession: vi.fn(), attestation: { ...actual.attestation, onPolicyViolation: vi.fn(() => vi.fn()) } };
});
vi.mock("@invisible-labs/sdk/user", async importOriginal => ({ ...await importOriginal<typeof import("@invisible-labs/sdk/user")>(), contractRequest: vi.fn(), listPersistedTransfers: vi.fn(), requestRefund: vi.fn(), sync: vi.fn() }));
vi.mock("@invisible-labs/sdk/events", () => ({ subscribe: vi.fn(() => vi.fn()) }));

const DESTINATION = "11111111111111111111111111111111";
const DEPOSIT = "So11111111111111111111111111111111111111112";
const SWAP_ID = "test-transfer";
const RECOVERY_CODE_LENGTH = 32;
const DEPOSIT_WINDOW_MS = 60_000;
const SCHEDULED_WINDOW_MS = SUPPORTED_TOTAL_DEADLINE_MS[1];
const ENTRY_LAMPORTS = 1_500_000_001;
const session = { attested: true } as Session;
const record: PersistedTransfer = {
  schemaVersion: 1, stage: "ready", swapId: SWAP_ID, amountLamports: ENTRY_LAMPORTS,
  destinationAddress: DESTINATION, policySnapshot: {
    asset: "SOL", entry_amount_lamports: ENTRY_LAMPORTS, total_committed_lamports: ENTRY_LAMPORTS,
    payout_deadline_ms: 0, payout_schedule: [{ destination_address: DESTINATION }], fragment_count: 1,
    payout_mode: "instant", matching_mode: "exact_1_to_1", fragmentation_allowed: "payout_side_only",
    min_fee_bps: 15, fee_bps: 15, fee_lamports: 2_250_000, net_payout_lamports: 1_497_750_001,
  }, status: "awaiting_deposit", updatedAtMs: Date.now(), depositAddress: DEPOSIT,
  depositExpiresAtMs: Date.now() + DEPOSIT_WINDOW_MS,
  syncSecret: new Uint8Array(RECOVERY_CODE_LENGTH).fill(1), recoveryCode: new Uint8Array(RECOVERY_CODE_LENGTH).fill(2),
};
beforeEach(() => {
  vi.stubGlobal("localStorage", (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage);
  localStorage.clear();
  // jsdom omits native dialog methods; real modal behavior is checked in Brave.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, action: () => unknown) => action() } });
  vi.mocked(createSession).mockResolvedValue(session);
  vi.mocked(listPersistedTransfers).mockResolvedValue([]);
  vi.mocked(sync).mockResolvedValue({ state: "awaiting_deposit", fragments_executed: [], coordinatorTimestampMs: Date.now() });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function enterTransfer() {
  await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("SOL amount"), { target: { value: "1.500000001" } });
  fireEvent.click(screen.getByRole("button", { name: "Select recipient address" }));
  fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: DESTINATION } });
  fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Review transfer" }) as HTMLButtonElement).disabled).toBe(false));
}
it("opens a read-only session without a wallet and creates only after a reviewed explicit command", async () => {
  let accept!: (result: ContractRequestResult) => void;
  vi.mocked(contractRequest).mockReturnValue(new Promise(resolve => { accept = resolve; }));
  render(<App />);
  await enterTransfer();
  expect(contractRequest).not.toHaveBeenCalled();
  expect(requestRefund).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /connect wallet/i })).toBeNull();
  fireEvent.change(screen.getByLabelText("Payout window"), { target: { value: String(SCHEDULED_WINDOW_MS) } });
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  const review = screen.getByRole("dialog", { name: "Review transfer" });
  expect(within(review).getByText(DESTINATION)).toBeTruthy();
  const confirm = within(review).getByRole("button", { name: "Create private transfer" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(contractRequest).toHaveBeenCalledTimes(1));
  expect(contractRequest).toHaveBeenCalledWith(session, { amountLamports: ENTRY_LAMPORTS, payoutPolicy: { destinations: [{ address: DESTINATION, sharePercent: 100 }], totalDeadlineMs: SCHEDULED_WINDOW_MS } });
  vi.mocked(listPersistedTransfers).mockResolvedValue([record]);
  await act(async () => { accept({ swapId: SWAP_ID } as ContractRequestResult); });
  await waitFor(() => expect(screen.getByText(DEPOSIT)).toBeTruthy());
  expect(screen.getByRole("tab", { name: /Activity/ }).getAttribute("aria-selected")).toBe("true");
});
it("validates recipient and amount without sending a command; permits closing the review", async () => {
  render(<App />);
  await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  const tabs = screen.getByRole("tablist");
  fireEvent.keyDown(tabs, { key: "ArrowRight" });
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Activity" }));
  fireEvent.keyDown(tabs, { key: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "Select recipient address" }));
  fireEvent.change(screen.getByLabelText("Recipient address"), { target: { value: "invalid-address" } });
  fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
  expect(screen.getByRole("dialog", { name: "Select recipient" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).not.toContain("[object Object]");
  fireEvent.click(screen.getByRole("button", { name: "Close recipient" }));
  await enterTransfer();
  fireEvent.change(screen.getByLabelText("SOL amount"), { target: { value: "1.499999999" } });
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  expect(screen.getByRole("alert").textContent).toContain("between");
  expect(contractRequest).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("SOL amount"), { target: { value: "1.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  fireEvent.click(screen.getByRole("button", { name: "Close review" }));
  expect(contractRequest).not.toHaveBeenCalled();
});
it("keeps an uncertain creation blocked and shows recovery guidance in the redesigned UI", async () => {
  vi.mocked(contractRequest).mockRejectedValue(new TransportError("CONNECTION_LOST", "The response was lost"));
  render(<App />);
  await enterTransfer();
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  fireEvent.click(screen.getByRole("button", { name: "Create private transfer" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("uncertain"));
  expect(screen.getByRole("alert").textContent).toContain("response was lost");
  fireEvent.click(screen.getByRole("tab", { name: "Transfer" }));
  expect((screen.getByRole("button", { name: "Review transfer" }) as HTMLButtonElement).disabled).toBe(true);
  expect(contractRequest).toHaveBeenCalledTimes(1);
});
it("never displays expired or terminal deposit instructions or terminal bearer material", async () => {
  vi.mocked(listPersistedTransfers).mockResolvedValue([{ ...record, depositExpiresAtMs: Date.now() - DEPOSIT_WINDOW_MS }]);
  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("expired"));
  expect(screen.queryByText(DEPOSIT)).toBeNull();
  cleanup();
  vi.mocked(listPersistedTransfers).mockResolvedValue([{ ...record, stage: "terminal-cleaned", status: "completed", recoveryCode: undefined, syncSecret: undefined }]);
  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "completed" })).toBeTruthy());
  expect(screen.queryByText(DEPOSIT)).toBeNull();
  expect(screen.queryByText("Recovery Code")).toBeNull();
  expect(screen.queryByRole("button", { name: "Request refund" })).toBeNull();
});
