import { useCallback, useEffect, useRef, useState } from "react";
import { isRequestCancelledError } from "../../../api/transport.js";
import { useToast } from "../../context/toast.js";

export type BusyActionResult = "completed" | "cancelled" | "failed";

export const useCancellableBusyAction = () => {
  const { showError } = useToast();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  const cancelBusyAction = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setBusyAction(null);
  }, []);

  const withBusyAction = useCallback(
    async (action: string, run: (signal: AbortSignal) => Promise<void>): Promise<BusyActionResult> => {
      const controller = new AbortController();
      activeControllerRef.current?.abort();
      activeControllerRef.current = controller;
      setBusyAction(action);

      try {
        await run(controller.signal);
        return "completed";
      } catch (error) {
        if (isRequestCancelledError(error)) {
          return "cancelled";
        }

        showError((error as Error).message ?? "Initiative action failed");
        return "failed";
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
          setBusyAction(null);
        }
      }
    },
    [showError],
  );

  return {
    busyAction,
    isBusy: busyAction !== null,
    cancelBusyAction,
    withBusyAction,
  };
};
