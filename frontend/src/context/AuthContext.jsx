import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { tokenStorage } from "../services/tokenStorage";
import { ADMIN_PORTAL_ROLES, CITIZEN_PORTAL_ROLES, MANAGER_PORTAL_ROLES } from "../config/auth.config";

const AuthContext = createContext(null);

// status: "checking"      -> we are asking the server whether the saved token is still valid
//         "authenticated" -> signed in
//         "anonymous"     -> signed out
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStorage.get() ? "checking" : "anonymous"));

  // On first load: if a token was saved earlier, confirm it with GET /api/auth/me.
  useEffect(() => {
    if (!tokenStorage.get()) return undefined;

    const controller = new AbortController();
    authService
      .me({ signal: controller.signal })
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // Only throw the token away when the server says it is no longer valid.
        // If the server is just unreachable, keep it for the next attempt.
        if (error.status === 401) tokenStorage.clear();
        setStatus("anonymous");
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async ({ identifier, password, remember }) => {
    const { user: loggedInUser, token } = await authService.login({ identifier, password });

    // This page is the *citizen* login. A staff account is rejected before
    // anything is saved, so no session is created for it.
    if (!CITIZEN_PORTAL_ROLES.includes(loggedInUser.role)) {
      // Same outcome as a wrong password, so nothing reveals what kind of account this is.
      const error = new Error("Invalid credentials.");
      error.status = 401;
      throw error;
    }

    tokenStorage.set(token, remember);
    setUser(loggedInUser);
    setStatus("authenticated");
    return loggedInUser;
  }, []);

  // Admin and department-manager sign-in. The backend already refuses other roles; the role is checked
  // again here so a wrong-role token is never saved by these pages. The token goes in sessionStorage only
  // (cleared when the tab closes): there is no "remember me" for staff accounts.
  const staffSignIn = useCallback(async (request, allowedRoles) => {
    const { user: staffUser, token } = await request;
    if (!allowedRoles.includes(staffUser.role)) {
      const error = new Error("Wrong account type.");
      error.status = 401;
      throw error;
    }
    tokenStorage.set(token, false);
    setUser(staffUser);
    setStatus("authenticated");
    return staffUser;
  }, []);

  const adminLogin = useCallback(
    (credentials) => staffSignIn(authService.adminLogin(credentials), ADMIN_PORTAL_ROLES),
    [staffSignIn]
  );
  const managerLogin = useCallback(
    (credentials) => staffSignIn(authService.managerLogin(credentials), MANAGER_PORTAL_ROLES),
    [staffSignIn]
  );

  // The backend signs a new citizen in as part of registration, so we keep that
  // behaviour: save the token for this browser session and mark the person as signed in.
  const register = useCallback(async (payload) => {
    const result = await authService.register(payload);
    // With email verification switched on, the backend sends no token: the citizen must verify first.
    if (result.requiresVerification) return { requiresVerification: true };
    tokenStorage.set(result.token, false);
    setUser(result.user);
    setStatus("authenticated");
    return { requiresVerification: false };
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout(); // the server just acknowledges; the token is stateless
    } catch {
      // Even if this fails we still sign the person out on this device.
    }
    tokenStorage.clear();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ user, status, login, adminLogin, managerLogin, register, logout }),
    [user, status, login, adminLogin, managerLogin, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
