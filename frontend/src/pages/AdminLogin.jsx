import StaffLoginPage from "../components/auth/StaffLoginPage";
import { ADMIN_HOME_PATH } from "../config/auth.config";
import { validateAdminIdentifier } from "../utils/validators";

const CONFIG = {
  title: "Admin Login",
  role: "admin",
  loginAction: "adminLogin",
  homePath: ADMIN_HOME_PATH,
  pathPrefix: "/admin",
  identifierPlaceholder: "Admin Email / ID",
  validateIdentifier: validateAdminIdentifier,
  invalidMessage: "Invalid Admin ID or Password.",
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
