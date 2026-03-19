export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const toApiError = (
  statusCode: number,
  payload: unknown,
  fallbackMessage?: string,
): ApiError => {
  if (isRecord(payload)) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : fallbackMessage ?? `Request failed with ${statusCode}`;
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const details = "details" in payload ? payload.details : undefined;

    return new ApiError(statusCode, message, code, details);
  }

  if (typeof payload === "string" && payload.trim()) {
    return new ApiError(statusCode, payload);
  }

  return new ApiError(statusCode, fallbackMessage ?? `Request failed with ${statusCode}`);
};

export const parseApiErrorText = (statusCode: number, text: string): ApiError => {
  try {
    return toApiError(statusCode, JSON.parse(text), text || `Request failed with ${statusCode}`);
  } catch {
    return new ApiError(statusCode, text || `Request failed with ${statusCode}`);
  }
};

export const parse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw parseApiErrorText(response.status, text);
  }

  return (await response.json()) as T;
};

export const requestJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  return parse<T>(response);
};
