import { tokenStorage } from "./tokenStorage";

// "/api" in development (Vite proxy). Set VITE_API_BASE_URL for production.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  // status 0 means the request never reached the server.
  constructor({ status, message, code, details, serverCode, serverData, retryAfterSeconds }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code; // "NETWORK" | "TIMEOUT" | undefined
    this.details = details;
    this.serverCode = serverCode; // e.g. "CAPTCHA_INVALID", sent by the backend
    this.serverData = serverData;
    this.retryAfterSeconds = retryAfterSeconds; // set on 429: how long until trying again is allowed
  }
}

export async function request(path, { method = "GET", body, auth = false, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStorage.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Abort the request if the server takes too long, or if the caller cancels.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled by the caller on purpose
    throw new ApiError({
      status: 0,
      code: timedOut ? "TIMEOUT" : "NETWORK",
      message: timedOut ? "The request timed out." : "Could not reach the server.",
    });
  } finally {
    clearTimeout(timer);
  }

  // The backend always replies with JSON, but guard against HTML error pages.
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // On "too many attempts" (429) the server says how long to wait, in a header and in the body.
    const headerSeconds = Number(response.headers.get("Retry-After"));
    throw new ApiError({
      retryAfterSeconds: headerSeconds > 0 ? headerSeconds : data?.retryAfterSeconds,
      status: response.status,
      message: data?.message || `Request failed with status ${response.status}.`,
      details: data?.errors,
      serverCode: data?.code,
      serverData: data,
    });
  }
  return data;
}
