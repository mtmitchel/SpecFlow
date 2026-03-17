import type { SpecFlowRuntime } from "../types.js";
import { notFound } from "../errors.js";
import { requireValidEntityId } from "./shared.js";

export const getOperationStatus = async (runtime: SpecFlowRuntime, operationId: string) => {
  requireValidEntityId(operationId, "operation ID");
  const status = await runtime.store.getOperationStatus(operationId);
  if (!status) {
    throw notFound(`Operation ${operationId} not found`);
  }

  return status;
};
