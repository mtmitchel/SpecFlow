export type LlmErrorCode = "invalid_api_key" | "rate_limit" | "timeout" | "provider_error";

export class LlmProviderError extends Error {
  public readonly code: LlmErrorCode;
  public readonly statusCode?: number;

  public constructor(message: string, code: LlmErrorCode, statusCode?: number) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
