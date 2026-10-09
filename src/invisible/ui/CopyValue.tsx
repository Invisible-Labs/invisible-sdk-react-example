import { useState } from "react";
import { toUiError, type InvisibleUiError } from "../errors";
import { Icon } from "./Icons";
import { ErrorMessage } from "./ErrorMessage";

export function CopyValue({ label, value }: { label: string; value: string }) {
  const [error, setError] = useState<InvisibleUiError | null>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(null);
    } catch (error) {
      setError(toUiError(error));
    }
  }
  return (
    <div className="copy-value">
      <span className="muted">{label}</span>
      <div>
        <code>{value}</code>
        <button
          className="icon-button"
          type="button"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          onClick={copy}
        >
          <Icon name={copied ? "check" : "copy"} />
        </button>
      </div>
      <ErrorMessage error={error} />
    </div>
  );
}
