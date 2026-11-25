import StaffLoginPage from "../components/auth/StaffLoginPage";
import { MANAGER_HOME_PATH } from "../config/auth.config";
import { validateManagerIdentifier } from "../utils/validators";

const CONFIG = {
  title: "Department Manager Login",
  role: "manager",
  loginAction: "managerLogin",
  homePath: MANAGER_HOME_PATH,
  pathPrefix: "/manager",
  identifierPlaceholder: "Registered Email / Manager ID",
  validateIdentifier: validateManagerIdentifier,
  invalidMessage: "Invalid Manager ID or Password.",
  securityLines: [
    "This portal is for authorised department officials only. Access is restricted to department managers.",
  ],
  centerHeading: false, // the wireframe left-aligns this heading
  centerSecurity: true,
};

export default function ManagerLogin() {
  return <StaffLoginPage config={CONFIG} />;
}
