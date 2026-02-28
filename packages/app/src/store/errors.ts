export class RetryableConflictError extends Error {
  public readonly retryable = true;

  public constructor(message: string) {
    super(message);
    this.name = "RetryableConflictError";
  }
}

export class NotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
