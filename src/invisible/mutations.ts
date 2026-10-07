import { CommandError, PolicyValidationError } from "@invisible-labs/sdk";

const MUTATION_NAMESPACE = "invisible-react-example:mutation";
const PRE_SEAL_REJECTIONS = new Set(["ERR_PRESEAL_ADMISSION_BUSY", "ERR_ADMISSION_CAPACITY_FULL"]);

export function mutationKey(coordinatorUrl: string, action: string): string {
  return `${MUTATION_NAMESPACE}:${encodeURIComponent(coordinatorUrl)}:${action}`;
}

export function hasPendingMutation(key: string): boolean {
  return localStorage.getItem(key) !== null;
}

/** A non-secret marker survives reloads; Web Locks serialize cooperating tabs. */
export async function runMutation<T>(key: string, action: () => Promise<T>, markerVersion?: number): Promise<T> {
  if (!navigator.locks) throw new Error("Use a browser with Web Locks on HTTPS or localhost.");
  return navigator.locks.request(key, async () => {
    if (hasPendingMutation(key)) {
      throw new Error("A previous request needs reconciliation. Reconnect and check its status before submitting again.");
    }
    localStorage.setItem(key, JSON.stringify({ stateVersion: markerVersion }));
    try {
      const result = await action();
      if (markerVersion === undefined) localStorage.removeItem(key);
      return result;
    } catch (error) {
      // Only proven local validation or pre-seal rejection permits another attempt.
      if (error instanceof PolicyValidationError ||
        (error instanceof CommandError && error.coordinatorCode && PRE_SEAL_REJECTIONS.has(error.coordinatorCode))) {
        localStorage.removeItem(key);
      }
      throw error;
    }
  });
}
