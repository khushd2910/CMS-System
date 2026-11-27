import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "../config/auth.config";
import { useAuth } from "../context/AuthContext";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Admin Login", to: ADMIN_LOGIN_PATH }, { label: "Verify Identity" }];

function describeError(error) {
  if (error.status === 0) return "Could not reach the server. Check your connection and try again.";
  if (error.status === 400) return "The code is incorrect, expired, or has reached its attempt limit.";
  if (error.status === 429 && error.serverCode === "ADMIN_OTP_COOLDOWN") {
    return "Please wait for the resend countdown before requesting another code.";
  }
  if (error.status === 429 && error.serverCode === "ADMIN_OTP_RESEND_LIMIT") {
    return "The resend limit was reached. Start again from the Admin Login page.";
  }
  if (error.status === 503) return "Email delivery is temporarily unavailable. Please try again later.";
  return "Verification is temporarily unavailable. Please try again.";
}

export default function AdminOtpVerification() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyAdminOtp, resendAdminOtp } = useAuth();
  const challengeId = location.state?.challengeId;
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(location.state?.resendAfterSeconds || 60);
  const [resendLimitReached, setResendLimitReached] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  if (!challengeId) {
    return <Navigate to={ADMIN_LOGIN_PATH} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setErrorMessage("");
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("Enter the six-digit code sent to your registered email address.");
      return;
    }

    setSubmitting(true);
    try {
      await verifyAdminOtp({ challengeId, code });
      navigate(location.state?.returnTo || ADMIN_HOME_PATH, { replace: true });
    } catch (error) {
      setErrorMessage(describeError(error));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || secondsLeft > 0 || resendLimitReached) return;
    setErrorMessage("");
    setResending(true);
    try {
      const result = await resendAdminOtp(challengeId);
      setSecondsLeft(result.resendAfterSeconds || 60);
      setCode("");
    } catch (error) {
      if (error.status === 429 && error.serverCode === "ADMIN_OTP_RESEND_LIMIT") {
        setResendLimitReached(true);
      }
      if (error.retryAfterSeconds) setSecondsLeft(error.retryAfterSeconds);
      setErrorMessage(describeError(error));
    } finally {
      setResending(false);
    }
  }

  return (
    <PortalLayout title="Verify Your Identity" breadcrumb={BREADCRUMB}>
      <div className="login-grid admin-grid">
        <section className="card admin-card admin-otp-card" aria-labelledby="admin-otp-heading">
          <span className="admin-otp-card__icon" aria-hidden="true"><LockKeyhole size={38} /></span>
          <h1 className="admin-card__title" id="admin-otp-heading">Verify Your Identity</h1>
          <p className="card__subtitle">
            Enter the 6-digit verification code sent to your registered email address.
          </p>
          {errorMessage && <Alert title="Verification failed">{errorMessage}</Alert>}
          <form className="admin-form" onSubmit={handleSubmit} noValidate>
            <TextField
              id="admin-otp-code"
              name="code"
              label="Six-digit verification code"
              hideLabel
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter 6-digit code"
              className="admin-field"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              readOnly={submitting}
            />
            <Button type="submit" className="admin-form__submit" loading={submitting} loadingText="Verifying…">
              Verify OTP
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="admin-otp-card__resend"
              disabled={secondsLeft > 0 || resendLimitReached}
              loading={resending}
              loadingText="Sending…"
              onClick={handleResend}
            >
              {resendLimitReached
                ? "Resend limit reached"
                : secondsLeft > 0
                  ? `Resend code in ${secondsLeft}s`
                  : "Resend OTP"}
            </Button>
            <p className="admin-otp-card__back">
              <Link className="admin-form__forgot-link" to={ADMIN_LOGIN_PATH}>Back to Login</Link>
            </p>
          </form>
        </section>

        <aside className="admin-security admin-security--center" aria-label="Administrator sign-in security">
          <span className="admin-security__icon" aria-hidden="true"><LockKeyhole size={64} /></span>
          <h2 className="admin-security__heading">Secure Administrator Access</h2>
          <p>Your password is accepted, but access is granted only after this one-time code is verified.</p>
        </aside>
      </div>
    </PortalLayout>
  );
}
