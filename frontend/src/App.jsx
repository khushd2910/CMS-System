import { Navigate, Route, Routes } from "react-router-dom";
import CitizenLogin from "./pages/CitizenLogin";
import CitizenRegister from "./pages/CitizenRegister";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminOtpVerification from "./pages/AdminOtpVerification";
import ManagerLogin from "./pages/ManagerLogin";
import VerifyEmail from "./pages/VerifyEmail";
import ManagerDashboard from "./pages/ManagerDashboard";
import CitizenDashboard from "./pages/CitizenDashboard";
import CitizenGrievanceHistory from "./pages/citizen/CitizenGrievanceHistory";
import CitizenGrievanceDetail from "./pages/citizen/CitizenGrievanceDetail";
import CitizenNewGrievance from "./pages/citizen/CitizenNewGrievance";
import CitizenNotifications from "./pages/citizen/CitizenNotifications";
import CitizenProfile from "./pages/citizen/CitizenProfile";
import CitizenTrackGrievance from "./pages/citizen/CitizenTrackGrievance";
import ComingSoon from "./pages/ComingSoon";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { ADMIN_LOGIN_PATH, ADMIN_PORTAL_ROLES, MANAGER_LOGIN_PATH, MANAGER_PORTAL_ROLES } from "./config/auth.config";

export default function App() {
  const { status } = useAuth();

  // Wait for the saved-token check so a signed-in person never sees a flash of the login form.
  if (status === "checking") return <p className="page-status" role="status">Loading…</p>;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<CitizenLogin />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route
        path="/citizen/dashboard"
        element={
          <ProtectedRoute roles={["citizen"]}>
            <CitizenDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/citizen/grievances/new"
        element={<ProtectedRoute roles={["citizen"]}><CitizenNewGrievance /></ProtectedRoute>}
      />
      <Route
        path="/citizen/grievances"
        element={<ProtectedRoute roles={["citizen"]}><CitizenGrievanceHistory /></ProtectedRoute>}
      />
      <Route
        path="/citizen/grievances/:id"
        element={<ProtectedRoute roles={["citizen"]}><CitizenGrievanceDetail /></ProtectedRoute>}
      />
      <Route
        path="/citizen/track"
        element={<ProtectedRoute roles={["citizen"]}><CitizenTrackGrievance /></ProtectedRoute>}
      />
      <Route
        path="/citizen/notifications"
        element={<ProtectedRoute roles={["citizen"]}><CitizenNotifications /></ProtectedRoute>}
      />
      <Route
        path="/citizen/profile"
        element={<ProtectedRoute roles={["citizen"]}><CitizenProfile /></ProtectedRoute>}
      />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/verify-otp" element={<AdminOtpVerification />} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={ADMIN_PORTAL_ROLES} loginPath={ADMIN_LOGIN_PATH}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/manager/login" element={<ManagerLogin />} />
      <Route
        path="/manager/dashboard"
        element={
          <ProtectedRoute roles={MANAGER_PORTAL_ROLES} loginPath={MANAGER_LOGIN_PATH}>
            <ManagerDashboard />
          </ProtectedRoute>
        }
      />

      {/* Later modules: kept as placeholders so every link works. */}
      <Route path="/register" element={<CitizenRegister />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/about" element={<ComingSoon title="About Us" />} />
      <Route path="/services" element={<ComingSoon title="Services" />} />
      <Route path="/policies" element={<ComingSoon title="Policies" />} />
      <Route path="/contact" element={<ComingSoon title="Contact Us" />} />
      <Route path="*" element={<ComingSoon title="Page Not Found" />} />
    </Routes>
  );
}
