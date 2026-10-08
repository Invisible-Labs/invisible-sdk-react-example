import type { InvisibleUiError } from "../errors";

export function ErrorMessage({ error }: { error: InvisibleUiError | null }) {
  return error ? (
    <p role="alert" className="error">
      {error.message}
      {error.remoteAccepted
        ? " This request was already accepted. Check its saved status before submitting again."
        : ""}
    </p>
  ) : null;
}
