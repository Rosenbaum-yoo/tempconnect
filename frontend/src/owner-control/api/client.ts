/**
 * OCC API Client
 * Alle Requests gehen gegen /api/v1/owner-control/*
 * Credentials: include (nutzt die platform-Session-Cookie)
 *
 * CSRF: Lazy-fetch von /api/csrf beim ersten mutierenden Request.
 * Alle nicht-GET-Methoden erhalten x-csrf-token (global CSRF-Schutz auf /api/).
 */
import type { ApiResult } from "@occ/types";

const BASE = "/api/v1/owner-control";

let _csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  try {
    const res = await fetch("/api/csrf", { credentials: "include" });
    if (res.ok) {
      const d = await res.json().catch(() => null);
      _csrfToken = (d?.token ?? d?.csrfToken) || "";
    }
  } catch {
    // CSRF-Token nicht verfügbar — Request wird es fehlschlagen lassen
  }
  return _csrfToken ?? "";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = await getCsrfToken();
    if (token) headers["x-csrf-token"] = token;
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        data: null,
        error: (payload as { error?: { code: string; message?: string } })?.error ?? {
          code: String(res.status),
        },
      };
    }

    return payload as ApiResult<T>;
  } catch {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: "Netzwerkfehler." },
    };
  }
}

export const occApi = {
  get:   <T>(path: string)                 => request<T>("GET",    path),
  post:  <T>(path: string, body?: unknown) => request<T>("POST",   path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH",  path, body),
  del:   <T>(path: string)                 => request<T>("DELETE", path),
};
