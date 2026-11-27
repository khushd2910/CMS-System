import StaffLoginPage from "../components/auth/StaffLoginPage";
import { ADMIN_HOME_PATH, SUPPORTS_ADMIN_ID_LOGIN } from "../config/auth.config";
import { validateAdminIdentifier } from "../utils/validators";

const CONFIG = {
  title: "Admin Login",
  role: "admin",
  loginAction: "adminLogin",
  homePath: ADMIN_HOME_PATH,
  pathPrefix: "/admin",
  // Only mention an ID when the backend can really sign someone in with one (see config/auth.config.js).
  identifierPlaceholder: SUPPORTS_ADMIN_ID_LOGIN ? "Admin Email / ID" : "Admin Email",
  validateIdentifier: validateAdminIdentifier,
  invalidMessage: SUPPORTS_ADMIN_ID_LOGIN ? "Invalid Admin ID or Password." : "Invalid email or password.",
  securityLines: [
    "This portal is for authorised government officials only.",
    "All activities are monitored and logged for security purposes.",
  ],
  centerHeading: true,
  centerSecurity: false,
};

export default function AdminLogin() {
  return <StaffLoginPage config={CONFIG} />;
}
