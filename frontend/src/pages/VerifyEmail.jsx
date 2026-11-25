import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import { authService } from "../services/authService";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Verify Email" }];

// Opened from the link in the verification email: /verify-email/:token
export default function VerifyEmail() {
  const { token } = useParams();
  const [state, setState] = useState("verifying"); // verifying | success | failed

  useEffect(() => {
    const controller = new AbortController();
    authService
      .verifyEmail(token)
      .then(() => !controller.signal.aborted && setState("success"))
      .catch(() => !controller.signal.aborted && setState("failed"));
    return () => controller.abort();
  }, [token]);

  return (
    <PortalLayout title="Verify Email" breadcrumb={BREADCRUMB}>
      <section className="card register-success" aria-labelledby="verify-heading" aria-live="polite">
        {state === "verifying" && <LoaderCircle className="btn__spinner" size={44} aria-hidden="true" />}
        {state === "success" && <CircleCheck className="register-success__icon" size={44} aria-hidden="true" />}
        {state === "failed" && <CircleAlert className="register-success__failed" size={44} aria-hidden="true" />}

        <h1 className="card__title" id="verify-heading">
          {state === "verifying" && "Verifying your email…"}
          {state === "success" && "Email Verified"}
          {state === "failed" && "Verification Failed"}
        </h1>
        <p className="card__subtitle">
          {state === "verifying" && "Please wait a moment."}
          {state === "success" && "Your email address has been verified. You can now sign in."}
          {state === "failed" &&
            "This verification link is invalid or has expired. Sign in to request a new verification email."}
        </p>
        {state !== "verifying" && (
          <p>
            <Link className="link" to="/login">
              Go to Citizen Login
            </Link>
          </p>
        )}
      </section>
    </PortalLayout>
  );
}
