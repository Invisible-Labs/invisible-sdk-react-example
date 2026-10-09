import { useId } from "react";
import { SUPPORTED_TOTAL_DEADLINE_MS } from "@invisible-labs/sdk/user";
import { windowLabel } from "../presentation";
import { Icon } from "../ui/Icons";

export function PayoutWindowPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (windowMs: number) => void;
}) {
  const name = useId();
  return (
    <fieldset className="payout-options">
      <legend>Payout window</legend>
      {SUPPORTED_TOTAL_DEADLINE_MS.map((windowMs) => (
        <label key={windowMs}>
          <input
            type="radio"
            name={name}
            value={windowMs}
            checked={value === windowMs}
            onChange={() => onChange(windowMs)}
          />
          <span>{windowLabel(windowMs)}</span>
          <Icon name="check" />
        </label>
      ))}
    </fieldset>
  );
}
