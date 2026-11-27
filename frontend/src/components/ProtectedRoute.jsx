import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Wrap any page that needs a signed-in user.
//  - roles:     optional list of roles allowed on this page (the BACKEND still enforces roles on every
//               API call; this only stops the wrong person from seeing an empty admin screen).
//  - loginPath: where to send people who are not allowed in.
export default function ProtectedRoute({ children, roles, loginPath = "/login" }) {
  const { status, user, sessionExpired } = useAuth();
  const location = useLocation();

  if (status === "checking") return <p className="page-status" role="status">Checking your session…</p>;
  if (status !== "authenticated") return <Navigate to={loginPath} replace state={{ from: location, expired: sessionExpired }} />;
  if (roles && !roles.includes(user?.role)) return <Navigate to={loginPath} replace />;
  return children;
}
