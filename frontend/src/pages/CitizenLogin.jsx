import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { CircleCheck, Lock } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import PasswordField from "../components/ui/PasswordField";
import CaptchaField, { useCaptcha } from "../components/ui/CaptchaField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { useAuth } from "../context/AuthContext";
import { CITIZEN_HOME_PATH, homePathForRole } from "../config/auth.config";
import { formatWait } from "../hooks/useCooldown";
import { redirectTarget } from "../utils/redirect";
import { useResendCode } from "../hooks/useResendCode";
import { validateCaptchaAnswer, validateIdentifier, validatePassword } from "../utils/validators";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Citizen Login" }];
const BENEFITS = [
  "Submit grievances online.",
  "Track grievance status.",
  "Receive department updates.",
  "Access your grievance history.",
];

const EMPTY_FORM = { identifier: "", password: "", captchaAnswer: "" };
const NO_ERRORS = { identifier: "", password: "", captchaAnswer: "" };

// Turns whatever went wrong into one clear sentence for the citizen.
function describeLoginError(error) {
  if (error.status === 403 && error.serverCode === "EMAIL_NOT_VERIFIED") {
    return "Your email address has not been verified yet. Enter the six-digit code we emailed you, or request a new one below.";
  }
  if (error.status === 400 && error.serverCode === "CAPTCHA_INVALID") {
    return "The security code was incorrect or expired. Please enter the new code.";
  }
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 401) return "Invalid email or password. Check your details and try again.";
  if (error.status === 429) return `Too many failed sign-in attempts. Please try again in ${formatWait(error.retryAfterSeconds || 900)}.`;
  if (error.status === 400) return error.message;
  return "The service is temporarily unavailable. Please try again in a few minutes.";
}

export default function CitizenLogin() {
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { captcha, loading: captchaLoading, loadError, refresh: refreshCaptcha } = useCaptcha();

  const [form, setForm] = useState(EMPTY_FORM);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const resend = useResendCode();

  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const captchaRef = useRef(null);

  // Already signed in? Go to the landing page for THIS person's role (a citizen, admin or manager
  // each has their own), not always the citizen area.
  //
  // ONE place decides where a citizen goes next, and both the automatic redirect below (it fires the moment
  // signing in succeeds) and the navigate() after login use it. Before, they disagreed: the first one always
  // sent people to the dashboard, so "return to the page you wanted" only worked by luck of timing.
  const afterLogin = redirectTarget(location.state?.from, { prefix: "/citizen", fallback: CITIZEN_HOME_PATH });
  if (status === "authenticated") return <Navigate to={user?.role === "citizen" ? afterLogin : homePathForRole(user?.role)} replace />;
  const sessionExpired = Boolean(location.state?.expired);

  const resendWait = resend.secondsLeftFor(form.identifier);

  const validators = {
    identifier: validateIdentifier,
    password: validatePassword,
    captchaAnswer: validateCaptchaAnswer,
  };

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (formError) setFormError("");
    // Errors are only created on submit (checking on blur moves the layout while
    // someone is clicking a link). Once an error shows, re-check it as they fix it.
    if (errors[name]) setErrors((current) => ({ ...current, [name]: validators[name](value) }));
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setRemember(false);
    setErrors(NO_ERRORS);
    setFormError("");
    setNeedsVerification(false);
    resend.reset();
    identifierRef.current?.focus();
  }

  function handleResend() {
    return resend.send(form.identifier);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    setFormError("");
    setNeedsVerification(false);
    resend.reset();

    const nextErrors = {
      identifier: validateIdentifier(form.identifier),
      password: validatePassword(form.password),
      captchaAnswer: !captcha
        ? "The security code is not loaded. Refresh it and try again."
        : validateCaptchaAnswer(form.captchaAnswer),
    };
    setErrors(nextErrors);
    if (nextErrors.identifier) return identifierRef.current?.focus();
    if (nextErrors.password) return passwordRef.current?.focus();
    if (nextErrors.captchaAnswer) return captchaRef.current?.focus();

    setSubmitting(true);
    try {
      await login({
        identifier: form.identifier.trim(),
        password: form.password,
        remember,
        captchaId: captcha.id,
        captchaAnswer: form.captchaAnswer.trim(),
      });
      // Send the person back to the page they originally wanted, if any.
      navigate(afterLogin, { replace: true });
    } catch (error) {
      setFormError(describeLoginError(error));
      const emailNotVerified = error.status === 403 && error.serverCode === "EMAIL_NOT_VERIFIED";
      setNeedsVerification(emailNotVerified);
      setForm((current) => ({ ...current, password: "", captchaAnswer: "" })); // never keep a wrong password
      setSubmitting(false);
      refreshCaptcha();
      (error.serverCode === "CAPTCHA_INVALID" ? captchaRef : passwordRef).current?.focus();
    }
  }

  return (
    <PortalLayout title="Citizen Login" breadcrumb={BREADCRUMB}>
      <div className="login-grid">
        <section className="card" aria-labelledby="login-heading">
          <h1 className="card__title" id="login-heading">
            Citizen Login
          </h1>
          <p className="card__subtitle">Sign in to submit grievances and track their progress.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {sessionExpired && !formError && <Alert title="Session expired">Your session has ended. Please sign in again to continue.</Alert>}
            {formError && <Alert title="Sign in failed">{formError}</Alert>}
            {needsVerification && (
              <div className="info-line">
                <Button
                  type="button"
                  variant="secondary"
                  loading={resend.sending}
                  loadingText="Sending…"
                  disabled={resendWait > 0}
                  onClick={handleResend}
                >
                  {resendWait > 0 ? `Resend in ${formatWait(resendWait)}` : "Resend email code"}
                </Button>
                {resend.message && (
                  <p role={resend.state === "sent" ? "status" : "alert"}>{resend.message}</p>
                )}
                <Link
                  className="link"
                  to="/verify-email"
                  state={{
                    email: form.identifier.trim().toLowerCase(),
                  }}
                >
                  Enter verification code
                </Link>
              </div>
            )}

            <fieldset className="panel">
              <legend className="panel__title">Sign-in details</legend>

              <TextField
                id="identifier"
                name="identifier"
                ref={identifierRef}
                label="Email Address"
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your email address"
                value={form.identifier}
                onChange={handleChange}
                readOnly={submitting}
                error={errors.identifier}
              />

              <PasswordField
                id="password"
                name="password"
                ref={passwordRef}
                label="Password"
                required
                autoComplete="current-password"
                placeholder="Enter password"
                value={form.password}
                onChange={handleChange}
                readOnly={submitting}
                error={errors.password}
              />

              <div className="login-form__options">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <Link className="link" to="/forgot-password">
                  Forgot Password?
                </Link>
              </div>
            </fieldset>

            <fieldset className="panel">
              <legend className="panel__title">Security Verification</legend>
              <CaptchaField
                captcha={captcha}
                loading={captchaLoading}
                loadError={loadError}
                onRefresh={() => {
                  setForm((current) => ({ ...current, captchaAnswer: "" }));
                  setErrors((current) => ({ ...current, captchaAnswer: "" }));
                  refreshCaptcha();
                }}
                inputId="captchaAnswer"
                value={form.captchaAnswer}
                onChange={handleChange}
                error={errors.captchaAnswer}
                readOnly={submitting}
                inputRef={captchaRef}
              />
            </fieldset>

            <div className="login-form__actions">
              <Button type="submit" loading={submitting} loadingText="Signing in…">
                Sign In
              </Button>
              <Button type="button" variant="secondary" disabled={submitting} onClick={handleReset}>
                Reset
              </Button>
            </div>

            <p className="login-form__register">
              New to the portal? <Link to="/register">Register as a citizen</Link>
            </p>
          </form>
        </section>

        <aside className="login-aside" aria-label="About signing in">
          <section className="card card--soft">
            <h2 className="card__heading">After you sign in</h2>
            <ul className="check-list">
              {BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <CircleCheck size={20} aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="notice">
            <Lock className="notice__icon" size={22} aria-hidden="true" />
            <div>
              <p>
                <strong>Your information is protected.</strong> Please do not share your login credentials with
                anyone.
              </p>
              <p>Use “Remember me” only on your own device, and sign out when you finish on a shared computer.</p>
            </div>
          </section>
        </aside>
      </div>
    </PortalLayout>
  );
}
