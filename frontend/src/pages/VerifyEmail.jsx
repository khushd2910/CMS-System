import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { CITIZEN_HOME_PATH } from "../config/auth.config";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services/authService";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Verify Email" }];

export default function VerifyEmail() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const [email, setEmail] = useState(location.state?.email || "");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(token ? "verifying-link" : "ready");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendState, setResendState] = useState("idle");

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    authService
      .verifyEmailLink(token, { signal: controller.signal })
      .then(() => !controller.signal.aborted && setStatus("success"))
      .catch(() => !controller.signal.aborted && setStatus("failed-link"));
    return () => controller.abort();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setFormError("Enter the six-digit code from your email.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyEmail({ email: normalizedEmail, code });
      if (result.token) {
        navigate(CITIZEN_HOME_PATH, { replace: true });
        return;
      }
      setStatus("success");
    } catch (error) {
      setFormError(error.status === 0
        ? "Could not reach the server. Check your connection and try again."
        : error.status === 400
          ? "That email code is invalid, expired, or has reached its attempt limit. Request a new code and try again."
          : error.status === 409
            ? "An account with this email already exists. Sign in instead."
            : "Email verification is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFormError("Enter the email address you used to register.");
      return;
    }
    setFormError("");
    setResendState("sending");
    try {
      await authService.resendVerification({ identifier: normalizedEmail });
      setResendState("sent");
    } catch {
      setResendState("failed");
    }
  }

  if (token) {
    return (
      <PortalLayout title="Verify Email" breadcrumb={BREADCRUMB}>
        <section className="card register-success" aria-labelledby="verify-heading" aria-live="polite">
          {status === "verifying-link" && <LoaderCircle className="btn__spinner" size={44} aria-hidden="true" />}
          {status === "success" && <CircleCheck className="register-success__icon" size={44} aria-hidden="true" />}
          {status === "failed-link" && <CircleAlert className="register-success__failed" size={44} aria-hidden="true" />}
          <h1 className="card__title" id="verify-heading">
            {status === "verifying-link" ? "Verifying your email…" : status === "success" ? "Email Verified" : "Verification Failed"}
          </h1>
          <p className="card__subtitle">
            {status === "verifying-link" && "Please wait a moment."}
            {status === "success" && "Your email address has been verified. You can now sign in."}
            {status === "failed-link" && "This verification link is invalid or has expired. Use the verification code instead."}
          </p>
          {status !== "verifying-link" && <p><Link className="link" to="/login">Go to Citizen Login</Link></p>}
        </section>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Verify Email" breadcrumb={BREADCRUMB}>
      <section className="card register-success" aria-labelledby="verify-heading" aria-live="polite">
        <h1 className="card__title" id="verify-heading">Verify Your Email</h1>
        <p className="card__subtitle">
          Enter the six-digit code sent to your email. Your account is created only after verification.
        </p>
        {formError && <Alert title="Verification failed">{formError}</Alert>}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <TextField
            id="verification-email"
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={submitting}
          />
          <TextField
            id="verification-code"
            label="Email verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            readOnly={submitting}
          />
          <div className="login-form__actions">
            <Button type="submit" loading={submitting} loadingText="Verifying…">Verify Email</Button>
            <Button
              type="button"
              variant="secondary"
              loading={resendState === "sending"}
              loadingText="Sending…"
              onClick={handleResend}
            >
              Resend Email Code
            </Button>
          </div>
          {resendState === "sent" && <p role="status">If this registration is waiting for verification, a new email code has been sent.</p>}
          {resendState === "failed" && <p role="alert">Could not send the email code. Please try again later.</p>}
        </form>
      </section>
    </PortalLayout>
  );
}
