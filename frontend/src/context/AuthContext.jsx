import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { tokenStorage } from "../services/tokenStorage";
import { onSessionEnded } from "../services/apiClient";
import { tokenExpiryMs } from "../utils/jwt";
import { ADMIN_PORTAL_ROLES, CITIZEN_PORTAL_ROLES, MANAGER_PORTAL_ROLES } from "../config/auth.config";

const AuthContext = createContext(null);

// status: "checking"      -> we are asking the server whether the saved token is still valid
//         "authenticated" -> signed in
//         "anonymous"     -> signed out
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStorage.get() ? "checking" : "anonymous"));
  // true after a saved login stopped working (expired, or ended by a password reset). Login pages show a notice.
  const [sessionExpired, setSessionExpired] = useState(false);

  // Signs the person out on screen WITHOUT calling the server (the server already said the token is dead).
  const endSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus("anonymous");
    setSessionExpired(true);
  }, []);

  // 1) Any API call that comes back 401 ends the session.
  useEffect(() => onSessionEnded(endSession), [endSession]);

  // 2) Even if the person never clicks anything, sign them out the moment the token expires
  //    (and re-check when they come back to a tab that was asleep: timers pause in background tabs).
  useEffect(() => {
    if (status !== "authenticated") return undefined;
    const check = () => {
      const expiresAt = tokenExpiryMs(tokenStorage.get());
      if (expiresAt !== null && Date.now() >= expiresAt) endSession();
    };
    const expiresAt = tokenExpiryMs(tokenStorage.get());
    // setTimeout cannot wait longer than about 24.8 days; longer waits are simply re-checked on return to the tab.
    const timer = expiresAt === null ? null : setTimeout(check, Math.min(Math.max(expiresAt - Date.now(), 0) + 500, 2 ** 31 - 1));
    document.addEventListener("visibilitychange", check);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [status, endSession]);

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
        // (A 401 also reaches endSession() through the API client, which clears the token and flags the expiry.)
        if (error.status === 401) tokenStorage.clear();
        setStatus("anonymous");
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async ({ identifier, password, remember, captchaId, captchaAnswer }) => {
    const { user: loggedInUser, token } = await authService.login({
      identifier,
      password,
      captchaId,
      captchaAnswer,
    });

    // This page is the *citizen* login. A staff account is rejected before
    // anything is saved, so no session is created for it.
    if (!CITIZEN_PORTAL_ROLES.includes(loggedInUser.role)) {
      // Same outcome as a wrong password, so nothing reveals what kind of account this is.
      const error = new Error("Invalid credentials.");
      error.status = 401;
      throw error;
    }

    tokenStorage.set(token, remember);
    setSessionExpired(false);
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
    setSessionExpired(false);
    setUser(staffUser);
    setStatus("authenticated");
    return staffUser;
  }, []);

  const adminLogin = useCallback((credentials) => authService.adminLogin(credentials), []);
  const verifyAdminOtp = useCallback(async (payload) => {
    const result = await authService.verifyAdminLoginOtp(payload);
    if (!result.token || !ADMIN_PORTAL_ROLES.includes(result.user?.role)) {
      const error = new Error("Verification did not return a valid administrator session.");
      error.status = 500;
      throw error;
    }
    tokenStorage.set(result.token, false);
    setSessionExpired(false);
    setUser(result.user);
    setStatus("authenticated");
    return result.user;
  }, []);
  const resendAdminOtp = useCallback(
    (challengeId) => authService.resendAdminLoginOtp({ challengeId }),
    []
  );
  const updateProfile = useCallback(async (payload) => {
    const result = await authService.updateProfile(payload);
    setUser(result.user);
    return result;
  }, []);
  const managerLogin = useCallback(
    (credentials) => staffSignIn(authService.managerLogin(credentials), MANAGER_PORTAL_ROLES),
    [staffSignIn]
  );

  // Registration remains pending until the email verification code is accepted.
  const register = useCallback(async (payload) => {
    const result = await authService.register(payload);
    if (result.requiresVerification) {
      return { requiresVerification: true };
    }
    throw new Error("Registration completed without email verification.");
  }, []);

  const acceptVerifiedCitizenSession = useCallback(({ user: verifiedUser, token }) => {
    if (!token) return;
    if (!CITIZEN_PORTAL_ROLES.includes(verifiedUser?.role)) {
      const error = new Error("Verification did not return a valid citizen session.");
      error.status = 500;
      throw error;
    }

    tokenStorage.set(token, false);
    setSessionExpired(false);
    setUser(verifiedUser);
    setStatus("authenticated");
  }, []);

  const verifyEmail = useCallback(async (payload) => {
    const result = await authService.verifyEmail(payload);
    acceptVerifiedCitizenSession(result);
    return result;
  }, [acceptVerifiedCitizenSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout(); // the server just acknowledges; the token is stateless
    } catch {
      // Even if this fails we still sign the person out on this device.
    }
    tokenStorage.clear();
    setSessionExpired(false); // signing out on purpose is not an expiry
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({
    user, status, sessionExpired, login, adminLogin, verifyAdminOtp, resendAdminOtp, managerLogin, register, verifyEmail, updateProfile, logout,
  }), [user, status, sessionExpired, login, adminLogin, verifyAdminOtp, resendAdminOtp, managerLogin, register, verifyEmail, updateProfile, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
