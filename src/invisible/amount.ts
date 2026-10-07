import { PolicyValidationError, lamports } from "@invisible-labs/sdk";
import { MAX_ENTRY_AMOUNT_LAMPORTS, MIN_ENTRY_AMOUNT_LAMPORTS } from "@invisible-labs/sdk/user";

export const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_DECIMALS = 9;
const DECIMAL_SOL = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/;

export function parseSolAmount(value: string): number {
  const match = DECIMAL_SOL.exec(value.trim());
  if (!match) throw new PolicyValidationError("INVALID_AMOUNT", "Enter SOL with at most 9 decimal places.");
  const amount = BigInt(match[1]) * BigInt(LAMPORTS_PER_SOL) +
    BigInt((match[2] ?? "").padEnd(SOL_DECIMALS, "0"));
  if (amount < BigInt(MIN_ENTRY_AMOUNT_LAMPORTS) || amount > BigInt(MAX_ENTRY_AMOUNT_LAMPORTS)) {
    throw new PolicyValidationError("INVALID_AMOUNT", `Enter between ${formatSol(MIN_ENTRY_AMOUNT_LAMPORTS)} and ${formatSol(MAX_ENTRY_AMOUNT_LAMPORTS)} SOL.`);
  }
  return lamports(Number(amount));
}

export function formatSol(value: number | bigint): string {
  const amount = BigInt(value);
  const whole = amount / BigInt(LAMPORTS_PER_SOL);
  const fraction = (amount % BigInt(LAMPORTS_PER_SOL)).toString().padStart(SOL_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
