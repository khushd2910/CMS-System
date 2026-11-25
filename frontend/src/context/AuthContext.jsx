import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { tokenStorage } from "../services/tokenStorage";
import { ADMIN_PORTAL_ROLES, CITIZEN_PORTAL_ROLES } from "../config/auth.config";

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

  const login = useCallback(async ({ email, password, remember }) => {
    const { user: loggedInUser, token } = await authService.login({ email, password });

    // This page is the *citizen* login. A staff account is rejected before
    // anything is saved, so no session is created for it.
    if (!CITIZEN_PORTAL_ROLES.includes(loggedInUser.role)) {
      const error = new Error("This page is for citizens only.");
      error.code = "NOT_CITIZEN";
      throw error;
    }

    tokenStorage.set(token, remember);
    setUser(loggedInUser);
    setStatus("authenticated");
    return loggedInUser;
  }, []);

  // Admin sign-in. The backend already refuses non-admin accounts; the role is checked again here
  // so a staff or citizen token is never saved by this page. The token goes in sessionStorage only
  // (cleared when the tab closes): there is no "remember me" for administrators.
  const adminLogin = useCallback(async (credentials) => {
    const { user: adminUser, token } = await authService.adminLogin(credentials);
    if (!ADMIN_PORTAL_ROLES.includes(adminUser.role)) {
      const error = new Error("Not an administrator.");
      error.status = 401;
      throw error;
    }
    tokenStorage.set(token, false);
    setUser(adminUser);
    setStatus("authenticated");
    return adminUser;
  }, []);

  // The backend signs a new citizen in as part of registration, so we keep that
  // behaviour: save the token for this browser session and mark the person as signed in.
  const register = useCallback(async (payload) => {
    const { user: newUser, token } = await authService.register(payload);
    tokenStorage.set(token, false);
    setUser(newUser);
    setStatus("authenticated");
    return newUser;
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

  const value = useMemo(() => ({ user, status, login, adminLogin, register, logout }), [user, status, login, adminLogin, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
