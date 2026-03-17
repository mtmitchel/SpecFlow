export class RequestCancelledError extends Error {
  public constructor(message = "Request cancelled") {
    super(message);
    this.name = "RequestCancelledError";
  }
}

export const asCancelledError = (reason: unknown): RequestCancelledError => {
  if (reason instanceof RequestCancelledError) {
    return reason;
  }

  if (reason instanceof Error && reason.message.trim()) {
    return new RequestCancelledError(reason.message);
  }

  if (typeof reason === "string" && reason.trim()) {
    return new RequestCancelledError(reason);
  }

  return new RequestCancelledError();
};

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw asCancelledError(signal.reason);
  }
};
