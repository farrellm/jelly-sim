import {
  API_BASE,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  type ActionsRequest,
  type ActionsResponse,
  type ApiErrorBody,
  type ErrorCode,
  type MeResponse,
  type StateResponse,
} from '@jelly/shared';

/**
 * A typed failure from the API. The UI branches on `code` — "you cannot afford this" and
 * "your session expired" call for very different screens — and never on message text.
 */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: { path: string; message: string }[];
  /** Present on STATE_CONFLICT: the version the server is actually holding (§7). */
  readonly stateVersion?: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.error;
    this.details = body.details;
    this.stateVersion = body.stateVersion;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // The session is an HttpOnly cookie. Without this, fetch drops it and every request
    // is anonymous.
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorBody = (body ?? {
      error: 'INTERNAL',
      message: 'The server is not answering.',
    }) as ApiErrorBody;
    throw new ApiRequestError(res.status, errorBody);
  }

  return body as T;
}

export const api = {
  register: (payload: { username: string; password: string; beanName: string }) =>
    request<MeResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload: { username: string; password: string }) =>
    request<MeResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: () => request<MeResponse>('/auth/me'),

  state: (slot = 0) => request<StateResponse>(`/state?slot=${slot}`),

  actions: (payload: ActionsRequest) =>
    request<ActionsResponse>('/actions', { method: 'POST', body: JSON.stringify(payload) }),
};
