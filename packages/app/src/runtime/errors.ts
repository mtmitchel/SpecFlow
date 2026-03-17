export interface HandlerErrorShape {
  code: string;
  message: string;
  statusCode: number;
  response: Record<string, unknown>;
}

export class HandlerError extends Error {
  readonly shape: HandlerErrorShape;

  constructor(shape: HandlerErrorShape) {
    super(shape.message);
    this.name = "HandlerError";
    this.shape = shape;
  }
}

export const isHandlerError = (value: unknown): value is HandlerError => value instanceof HandlerError;

export const createHandlerError = (
  code: string,
  statusCode: number,
  message: string,
  response?: Record<string, unknown>
): HandlerError => new HandlerError({
  code,
  message,
  statusCode,
  response: response ?? { error: code, message }
});

export const badRequest = (message: string, response?: Record<string, unknown>): HandlerError =>
  createHandlerError("Bad Request", 400, message, response ?? { error: "Bad Request", message });

export const notFound = (message: string, response?: Record<string, unknown>): HandlerError =>
  createHandlerError("Not Found", 404, message, response ?? { error: "Not Found", message });

export const conflict = (message: string, response?: Record<string, unknown>): HandlerError =>
  createHandlerError("Blocked", 409, message, response ?? { error: "Blocked", message });

export const tooManyRequests = (message: string, response?: Record<string, unknown>): HandlerError =>
  createHandlerError("Too Many Requests", 429, message, response ?? { error: "Too Many Requests", message });

export const upstreamFailure = (message: string, response?: Record<string, unknown>): HandlerError =>
  createHandlerError("Upstream Failed", 502, message, response ?? { error: "Upstream Failed", message });
