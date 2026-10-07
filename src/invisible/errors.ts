import {
  AttestationError, CommandError, InvalidDepositAmountError, PolicyValidationError,
  RoutingError, StorageError, TransportError, isInvisibleError, normalizeError,
} from "@invisible-labs/sdk";

export type InvisibleUiError = {
  kind: "attestation" | "connection" | "command" | "validation" | "storage" | "unknown";
  message: string;
  code?: string;
  swapId?: string;
  remoteAccepted?: boolean;
};

export function toUiError(error: unknown): InvisibleUiError {
  const kind = error instanceof AttestationError ? "attestation"
    : error instanceof TransportError || error instanceof RoutingError ? "connection"
    : error instanceof StorageError ? "storage"
    : error instanceof PolicyValidationError ? "validation"
    : error instanceof CommandError ? "command" : "unknown";
  return {
    kind,
    message: normalizeError(error, "The operation could not be completed."),
    ...(isInvisibleError(error) ? { code: error.code } : {}),
    ...(error instanceof StorageError ? { swapId: error.swapId, remoteAccepted: error.remoteAccepted } : {}),
  };
}

export function isReadRetryable(error: unknown): boolean {
  return error instanceof TransportError ||
    (error instanceof CommandError && !(error instanceof InvalidDepositAmountError) &&
      error.coordinatorCode === "ERR_PRESEAL_ADMISSION_BUSY");
}
