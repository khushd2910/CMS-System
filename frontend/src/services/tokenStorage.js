// Keeps the JWT between page reloads.
//  - "Remember me" ticked   -> localStorage   (survives closing the browser)
//  - "Remember me" unticked -> sessionStorage (cleared when the tab closes)
// Only the token is stored. The password is never stored anywhere.

const KEY = "ngrp.auth.token";

function safe(action, fallback = null) {
  try {
    return action();
  } catch {
    // Storage can be blocked (private mode, strict browser settings).
    return fallback;
  }
}

export const tokenStorage = {
  get() {
    return safe(() => window.sessionStorage.getItem(KEY) || window.localStorage.getItem(KEY));
  },
  set(token, remember) {
    this.clear();
    safe(() => (remember ? window.localStorage : window.sessionStorage).setItem(KEY, token));
  },
  clear() {
    safe(() => window.sessionStorage.removeItem(KEY));
    safe(() => window.localStorage.removeItem(KEY));
  },
};
