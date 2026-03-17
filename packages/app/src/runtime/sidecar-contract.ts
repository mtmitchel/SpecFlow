export interface SidecarRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface SidecarSuccess {
  id: string;
  ok: true;
  result: unknown;
}

export interface SidecarFailure {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
  };
}

export interface SidecarNotification {
  event: string;
  requestId?: string;
  payload: unknown;
}

export type SidecarMessage = SidecarSuccess | SidecarFailure | SidecarNotification;
