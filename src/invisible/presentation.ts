import { INSTANT_PAYOUT_WINDOW_MS } from "@invisible-labs/sdk/user";

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
const ADDRESS_PREVIEW_LENGTH = 6;
export const shortAddress = (address: string) =>
  `${address.slice(0, ADDRESS_PREVIEW_LENGTH)}...${address.slice(-ADDRESS_PREVIEW_LENGTH)}`;
export function windowLabel(windowMs: number) {
  if (windowMs === INSTANT_PAYOUT_WINDOW_MS) return "Instant";
  const [duration, unit] =
    windowMs >= MILLISECONDS_PER_DAY
      ? [windowMs / MILLISECONDS_PER_DAY, "day"]
      : windowMs >= MILLISECONDS_PER_HOUR
        ? [windowMs / MILLISECONDS_PER_HOUR, "hour"]
        : [windowMs / MILLISECONDS_PER_MINUTE, "minute"];
  return `${duration} ${unit}${duration === 1 ? "" : "s"}`;
}
