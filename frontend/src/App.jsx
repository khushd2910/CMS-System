import { Navigate, Route, Routes } from "react-router-dom";
import CitizenLogin from "./pages/CitizenLogin";
import CitizenRegister from "./pages/CitizenRegister";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import CitizenDashboard from "./pages/CitizenDashboard";
import ComingSoon from "./pages/ComingSoon";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { ADMIN_LOGIN_PATH, ADMIN_PORTAL_ROLES } from "./config/auth.config";

export default function App() {
  const { status } = useAuth();

  // Wait for the saved-token check so a signed-in person never sees a flash of the login form.
  if (status === "checking") return <p className="page-status" role="status">Loading…</p>;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<CitizenLogin />} />
      <Route
        path="/citizen/dashboard"
        element={
          <ProtectedRoute>
            <CitizenDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={ADMIN_PORTAL_ROLES} loginPath={ADMIN_LOGIN_PATH}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Later modules: kept as placeholders so every link works. */}
      <Route path="/register" element={<CitizenRegister />} />
      <Route path="/forgot-password" element={<ComingSoon title="Forgot Password" />} />
      <Route path="/reset-password/:token" element={<ComingSoon title="Reset Password" />} />
      <Route path="/about" element={<ComingSoon title="About Us" />} />
      <Route path="/services" element={<ComingSoon title="Services" />} />
      <Route path="/policies" element={<ComingSoon title="Policies" />} />
      <Route path="/contact" element={<ComingSoon title="Contact Us" />} />
      <Route path="*" element={<ComingSoon title="Page Not Found" />} />
    </Routes>
  );
}
