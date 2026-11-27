import { tokenStorage } from "./tokenStorage";

// "/api" in development (Vite proxy). Set VITE_API_BASE_URL for production.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

// The app registers one function here (AuthContext). It is called when the server says "401" to a request that
// carried a login token: the session has expired, or was ended (for example by a password reset).
let sessionEndedHandler = null;
export function onSessionEnded(handler) {
  sessionEndedHandler = handler;
  return () => {
    if (sessionEndedHandler === handler) sessionEndedHandler = null;
  };
}

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

// notifyOnExpiry: set to false for a call where a 401 is expected and means nothing (e.g. signing out).
export async function request(path, { method = "GET", body, auth = false, signal, notifyOnExpiry = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let sentToken = null;
  if (auth) {
    sentToken = tokenStorage.get();
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
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
    // A 401 on a request that sent a token = the login is no longer valid. Only react if it is still the SAME
    // token (the person may have signed in again while this request was running).
    if (response.status === 401 && sentToken && notifyOnExpiry && tokenStorage.get() === sentToken) {
      sessionEndedHandler?.();
    }
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
