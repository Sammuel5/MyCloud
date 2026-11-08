export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status: number, code = "REQUEST_FAILED", details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiFetchOptions extends RequestInit {
  json?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  finalHeaders.set("Accept", "application/json");
  let body = rest.body;
  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const response = await fetch(path, {
    ...rest,
    body,
    headers: finalHeaders,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    let message = response.statusText || "Request failed";
    let code = "REQUEST_FAILED";
    let details: unknown;
    try {
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        details?: unknown;
      };
      message = payload.error || message;
      code = payload.code || code;
      details = payload.details;
    } catch {
      // Non-JSON errors (for example a proxy error page) keep the status text.
    }
    throw new ApiClientError(message, response.status, code, details);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, json?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", json });
}

export function apiPatch<T>(path: string, json?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", json });
}

export function apiDelete<T>(path: string, json?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE", json });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "PASSWORD_CHANGE_REQUIRED") {
      return "You must change your temporary password before continuing.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function quotaBytesToGb(value: number): number {
  if (!value) return 0;
  return Math.round((value / 1024 ** 3) * 100) / 100;
}

export function gbToQuotaBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1024 ** 3);
}
