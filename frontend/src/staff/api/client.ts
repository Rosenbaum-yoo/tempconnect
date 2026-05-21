/**
 * SCC API Client
 * Basis: /staff/api — separater Cookie-Scope (tc.staff.sid)
 * Kein @occ- oder @soc-Import.
 */

const BASE = "/staff/api";

export class SccApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "SccApiError";
    this.status = status;
    this.code = code;
  }
  get isUnauthorized()  { return this.status === 401; }
  get isForbidden()     { return this.status === 403; }
  // 428 = Step-Up erforderlich oder abgelaufen (Haupt-Repo gibt SCC_STEP_UP_REQUIRED)
  get isStepUpRequired(){ return this.status === 428; }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let data: { data?: T; error?: { code: string; message: string } } | T;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text } as T; }

  if (!res.ok) {
    const d = data as { error?: { code?: string; message?: string }; code?: string; message?: string };
    const msg = d?.error?.message ?? d?.message ?? `SCC API ${res.status}`;
    const code = d?.error?.code ?? d?.code ?? null;
    throw new SccApiError(res.status, msg, code);
  }

  // Unterstütze sowohl Envelope { data: T } als auch direktes T
  const d = data as { data?: T };
  return (d && Object.prototype.hasOwnProperty.call(d, "data") ? d.data : data) as T;
}

export const sccApi = {
  get:  <T>(path: string)                 => request<T>("GET",    path),
  post: <T>(path: string, body?: unknown) => request<T>("POST",   path, body ?? {}),
  patch:<T>(path: string, body?: unknown) => request<T>("PATCH",  path, body ?? {}),
  del:  <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  _base: BASE,
};
