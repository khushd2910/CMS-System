import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock, Mail, Shield } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import CaptchaField, { useCaptcha } from "../components/ui/CaptchaField";
import { useAuth } from "../context/AuthContext";
import { ADMIN_HOME_PATH, SUPPORTS_ADMIN_ID_LOGIN } from "../config/auth.config";
import { validateAdminIdentifier, validateCaptchaAnswer, validatePassword } from "../utils/validators";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Admin Login" }];
const EMPTY_FORM = { identifier: "", password: "", captchaAnswer: "" };
const NO_ERRORS = { identifier: "", password: "", captchaAnswer: "" };

// One generic sentence per failure. Backend wording is never shown, and the page never says
// whether an account exists or what role it has.
function describeLoginError(error) {
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 400 && error.serverCode === "CAPTCHA_INVALID") return "CAPTCHA verification failed.";
  if (error.status === 401) return "Invalid Admin ID or Password.";
  if (error.status === 429) return "Too many failed attempts. Please wait a few minutes before trying again.";
  return "Unable to authenticate. Please try again.";
}

export default function AdminLogin() {
  const { status, user, adminLogin } = useAuth();
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

  // Only an already signed-in ADMIN skips this page. A signed-in citizen still sees the form.
  if (status === "authenticated" && user?.role === "admin") return <Navigate to={ADMIN_HOME_PATH} replace />;

  const validators = {
    identifier: validateAdminIdentifier,
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
      identifier: validateAdminIdentifier(form.identifier),
      password: validatePassword(form.password),
      captchaAnswer: !captcha ? "The CAPTCHA is not loaded. Refresh it and try again." : validateCaptchaAnswer(form.captchaAnswer),
    };
    setErrors(nextErrors);
    if (nextErrors.identifier) return identifierRef.current?.focus();
    if (nextErrors.password) return passwordRef.current?.focus();
    if (nextErrors.captchaAnswer) return captchaRef.current?.focus();

    setSubmitting(true);
    try {
      await adminLogin({
        email: form.identifier.trim(),
        password: form.password,
        captchaId: captcha.id,
        captchaAnswer: form.captchaAnswer.trim(),
      });
      navigate(location.state?.from?.pathname?.startsWith("/admin") ? location.state.from.pathname : ADMIN_HOME_PATH, {
        replace: true,
      });
    } catch (error) {
      setFormError(describeLoginError(error));
      // A CAPTCHA works once, so a new one is always fetched; a wrong password is never kept.
      setForm((current) => ({ ...current, password: "", captchaAnswer: "" }));
      setShowPassword(false);
      setSubmitting(false);
      refreshCaptcha();
      (error.serverCode === "CAPTCHA_INVALID" ? captchaRef : passwordRef).current?.focus();
    }
  }

  return (
    <PortalLayout title="Admin Login" breadcrumb={BREADCRUMB}>
      <div className="login-grid admin-grid">
        <section className="card admin-card" aria-labelledby="admin-heading">
          <h1 className="admin-card__title" id="admin-heading">
            Admin Login
          </h1>

          <form className="admin-form" onSubmit={handleSubmit} noValidate>
            {formError && <Alert title="Sign in failed">{formError}</Alert>}

            <TextField
              id="identifier"
              name="identifier"
              ref={identifierRef}
              label="Admin Email / ID"
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
              placeholder="Admin Email / ID"
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
              <Link className="admin-form__forgot-link" to="/forgot-password">
                Forgot Password?
              </Link>
            </p>

            <Button type="submit" className="admin-form__submit" loading={submitting} loadingText="Signing in…">
              Login
            </Button>
          </form>
        </section>

        <aside className="admin-security" aria-labelledby="security-heading">
          <span className="admin-security__icon" aria-hidden="true">
            <Shield size={64} strokeWidth={1.75} />
            <Lock size={24} strokeWidth={2.5} className="admin-security__lock" />
          </span>
          <h2 id="security-heading" className="admin-security__heading">
            Security Information
          </h2>
          <p>This portal is for authorised government officials only.</p>
          <p>All activities are monitored and logged for security purposes.</p>
        </aside>
      </div>
    </PortalLayout>
  );
}
