import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock, Mail, Shield } from "lucide-react";
import PortalLayout from "../layout/PortalLayout";
import TextField from "../ui/TextField";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import CaptchaField, { useCaptcha } from "../ui/CaptchaField";
import { useAuth } from "../../context/AuthContext";
import { validateCaptchaAnswer, validatePassword } from "../../utils/validators";
import { redirectTarget } from "../../utils/redirect";

const EMPTY_FORM = { identifier: "", password: "", captchaAnswer: "" };
const NO_ERRORS = { identifier: "", password: "", captchaAnswer: "" };

// One generic sentence per failure. Backend wording is never shown, and the page never says
// whether an account exists or what role it has.
// "about 14 minutes", "less than a minute" ... from the number of seconds the server sent.
function waitText(seconds) {
  if (!seconds || seconds <= 0) return "a few minutes";
  if (seconds < 60) return "less than a minute";
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function describeLoginError(error, invalidMessage) {
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 400 && error.serverCode === "CAPTCHA_INVALID") return "CAPTCHA verification failed.";
  if (error.status === 401) return invalidMessage;
  if (error.status === 429) return `Too many failed attempts. Please try again in ${waitText(error.retryAfterSeconds)}.`;
  return "Unable to authenticate. Please try again.";
}

// Shared sign-in page for staff roles (admin, department manager).
// config: {
//   title, role, loginAction ("adminLogin" | "managerLogin"), homePath, pathPrefix,
//   identifierPlaceholder, validateIdentifier, invalidMessage,
//   securityLines: [string, ...], centerHeading, centerSecurity
// }
export default function StaffLoginPage({ config }) {
  const auth = useAuth();
  const { status, user } = auth;
  const signIn = auth[config.loginAction];
  const breadcrumb = [{ label: "Home", to: "/" }, { label: config.title }];
  const navigate = useNavigate();
  const location = useLocation();
  const { captcha, loading: captchaLoading, loadError, refresh: refreshCaptcha } = useCaptcha();

  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const captchaRef = useRef(null);

  // Only an already signed-in person with THIS role skips this page. A signed-in citizen still sees the form.
  // The same target is used for this automatic redirect (it fires the moment sign-in succeeds) and for the
  // navigate() after sign-in, so they can never disagree. See utils/redirect.js for what is allowed.
  const afterLogin = redirectTarget(location.state?.from, { prefix: config.pathPrefix, fallback: config.homePath });
  if (status === "authenticated" && user?.role === config.role) return <Navigate to={afterLogin} replace />;
  const sessionExpired = Boolean(location.state?.expired);

  const validators = {
    identifier: config.validateIdentifier,
    password: validatePassword,
    captchaAnswer: validateCaptchaAnswer,
  };

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (formError) setFormError("");
    if (errors[name]) setErrors((current) => ({ ...current, [name]: validators[name](value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");

    const nextErrors = {
      identifier: config.validateIdentifier(form.identifier),
      password: validatePassword(form.password),
      captchaAnswer: !captcha ? "The CAPTCHA is not loaded. Refresh it and try again." : validateCaptchaAnswer(form.captchaAnswer),
    };
    setErrors(nextErrors);
    if (nextErrors.identifier) return identifierRef.current?.focus();
    if (nextErrors.password) return passwordRef.current?.focus();
    if (nextErrors.captchaAnswer) return captchaRef.current?.focus();

    setSubmitting(true);
    try {
      await signIn({
        email: form.identifier.trim(),
        password: form.password,
        captchaId: captcha.id,
        captchaAnswer: form.captchaAnswer.trim(),
      });
      navigate(afterLogin, { replace: true });
    } catch (error) {
      setFormError(describeLoginError(error, config.invalidMessage));
      // A CAPTCHA works once, so a new one is always fetched; a wrong password is never kept.
      setForm((current) => ({ ...current, password: "", captchaAnswer: "" }));
      setShowPassword(false);
      setSubmitting(false);
      refreshCaptcha();
      (error.serverCode === "CAPTCHA_INVALID" ? captchaRef : passwordRef).current?.focus();
    }
  }

  return (
    <PortalLayout title={config.title} breadcrumb={breadcrumb}>
      <div className="login-grid admin-grid">
        <section className="card admin-card" aria-labelledby="staff-heading">
          <h1 className={`admin-card__title ${config.centerHeading ? "" : "admin-card__title--left"}`.trim()} id="staff-heading">
            {config.title}
          </h1>

          <form className="admin-form" onSubmit={handleSubmit} noValidate>
            {sessionExpired && !formError && <Alert title="Session expired">Your session has ended. Please sign in again to continue.</Alert>}
            {formError && <Alert title="Sign in failed">{formError}</Alert>}

            <TextField
              id="identifier"
              name="identifier"
              ref={identifierRef}
              label={config.identifierPlaceholder}
              hideLabel
              required
              error={errors.identifier}
              hint=""
              className="admin-field"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={config.identifierPlaceholder}
              value={form.identifier}
              onChange={handleChange}
              readOnly={submitting}
            >
              {({ id, ref, describedBy, invalid, required, inputProps }) => (
                <div className="icon-wrap">
                  <Mail className="icon-wrap__icon" size={22} aria-hidden="true" />
                  <input
                    id={id}
                    ref={ref}
                    className="field__input field__input--with-icon"
                    aria-invalid={invalid ? "true" : undefined}
                    aria-describedby={describedBy}
                    aria-required={required || undefined}
                    {...inputProps}
                  />
                </div>
              )}
            </TextField>

            <TextField
              id="password"
              name="password"
              ref={passwordRef}
              label="Password"
              hideLabel
              required
              error={errors.password}
              className="admin-field"
              autoComplete="current-password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              readOnly={submitting}
            >
              {({ id, ref, describedBy, invalid, required, inputProps }) => (
                <div className="icon-wrap">
                  <Lock className="icon-wrap__icon" size={22} aria-hidden="true" />
                  <input
                    id={id}
                    ref={ref}
                    className="field__input field__input--with-icon"
                    type={showPassword ? "text" : "password"}
                    aria-invalid={invalid ? "true" : undefined}
                    aria-describedby={describedBy}
                    aria-required={required || undefined}
                    {...inputProps}
                  />
                </div>
              )}
            </TextField>

            <label className="checkbox admin-form__show">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              <span>Show Password</span>
            </label>

            <CaptchaField
              captcha={captcha}
              loading={captchaLoading}
              loadError={loadError}
              onRefresh={() => {
                setForm((current) => ({ ...current, captchaAnswer: "" }));
                refreshCaptcha();
              }}
              inputId="captchaAnswer"
              value={form.captchaAnswer}
              onChange={handleChange}
              error={errors.captchaAnswer}
              readOnly={submitting}
              inputRef={captchaRef}
            />

            <p className="admin-form__forgot">
              <Link className="admin-form__forgot-link" to="/forgot-password" state={{ loginPath: `${config.pathPrefix}/login` }}>
                Forgot Password?
              </Link>
            </p>

            <Button type="submit" className="admin-form__submit" loading={submitting} loadingText="Signing in…">
              Login
            </Button>
          </form>
        </section>

        <aside className={`admin-security ${config.centerSecurity ? "admin-security--center" : ""}`.trim()} aria-labelledby="security-heading">
          <span className="admin-security__icon" aria-hidden="true">
            <Shield size={64} strokeWidth={1.75} />
            <Lock size={24} strokeWidth={2.5} className="admin-security__lock" />
          </span>
          <h2 id="security-heading" className="admin-security__heading">
            Security Information
          </h2>
          {config.securityLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </aside>
      </div>
    </PortalLayout>
  );
}
