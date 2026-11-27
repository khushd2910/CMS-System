import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import PasswordField from "../components/ui/PasswordField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { authService } from "../services/authService";
import { passwordStrength, validateConfirmPassword, validateNewPassword } from "../utils/validators";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Reset Password" }];
const EMPTY_FORM = { password: "", confirm: "" };
const NO_ERRORS = { password: "", confirm: "" };

function describeError(error) {
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 400) return error.message;
  return "The service is temporarily unavailable. Please try again in a few minutes.";
}

// POST /api/auth/reset-password/:token. The token comes from the link in the email (30 minutes, single use).
export default function ResetPassword() {
  const { token } = useParams();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [formError, setFormError] = useState("");
  const [linkProblem, setLinkProblem] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const strength = passwordStrength(form.password);

  function handleChange(event) {
    const { name, value } = event.target;
    const next = { ...form, [name]: value };
    setForm(next);
    if (formError) setFormError("");
    // Errors appear on submit; once shown, re-check them while the person fixes them.
    setErrors((current) => ({
      password: current.password ? validateNewPassword(next.password) : "",
      confirm: current.confirm ? validateConfirmPassword(next.password, next.confirm) : "",
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");

    const nextErrors = {
      password: validateNewPassword(form.password),
      confirm: validateConfirmPassword(form.password, form.confirm),
    };
    setErrors(nextErrors);
    if (nextErrors.password) return passwordRef.current?.focus();
    if (nextErrors.confirm) return confirmRef.current?.focus();

    setSubmitting(true);
    try {
      await authService.resetPassword({ token, password: form.password });
      setForm(EMPTY_FORM);
      setDone(true);
    } catch (error) {
      if (error.status === 400 && /token/i.test(error.message || "")) {
        setLinkProblem(true); // the link is invalid, expired or already used
      } else {
        setFormError(describeError(error));
        setForm(EMPTY_FORM); // never keep a password after a failure
      }
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <PortalLayout title="Password Reset" breadcrumb={BREADCRUMB}>
        <section className="card register-success" aria-labelledby="reset-heading">
          <CircleCheck className="register-success__icon" size={44} aria-hidden="true" />
          <h1 className="card__title" id="reset-heading" tabIndex={-1} ref={(node) => node?.focus()}>
            Password Changed
          </h1>
          <p className="card__subtitle" role="status">
            Your password has been reset. Sign in with your new password.
          </p>
          <p>
            <Link className="link" to="/login">Go to Citizen Login</Link>
          </p>
          <p className="register-note">
            Administrators sign in at <Link className="link" to="/admin/login">Admin Login</Link> and department
            managers at <Link className="link" to="/manager/login">Manager Login</Link>.
          </p>
        </section>
      </PortalLayout>
    );
  }

  if (linkProblem) {
    return (
      <PortalLayout title="Reset Password" breadcrumb={BREADCRUMB}>
        <section className="card register-success" aria-labelledby="reset-heading">
          <h1 className="card__title" id="reset-heading">Reset Password</h1>
          <Alert title="This reset link cannot be used">
            The link is invalid, has expired, or has already been used. Request a new one to continue.
          </Alert>
          <p>
            <Link className="link" to="/forgot-password">Request a new reset link</Link>
          </p>
        </section>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Reset Password" breadcrumb={BREADCRUMB}>
      <section className="card register-success" aria-labelledby="reset-heading">
        <h1 className="card__title" id="reset-heading">Reset Password</h1>
        <p className="card__subtitle">Choose a new password for your account.</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {formError && <Alert title="Could not reset password">{formError}</Alert>}

          <PasswordField
            id="password"
            name="password"
            ref={passwordRef}
            label="New Password"
            required
            autoComplete="new-password"
            placeholder="Enter new password"
            hint="At least 8 characters, with a letter, a number, and a symbol."
            value={form.password}
            onChange={handleChange}
            readOnly={submitting}
            error={errors.password}
          />
          {form.password && (
            <div className="strength" role="status" aria-live="polite">
              <div className={`strength__bar strength__bar--${strength.score}`} aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <span className="strength__label">Password strength: {strength.label}</span>
            </div>
          )}
          <PasswordField
            id="confirm"
            name="confirm"
            ref={confirmRef}
            label="Confirm New Password"
            required
            autoComplete="new-password"
            placeholder="Re-enter new password"
            value={form.confirm}
            onChange={handleChange}
            readOnly={submitting}
            error={errors.confirm}
          />

          <div className="login-form__actions">
            <Button type="submit" loading={submitting} loadingText="Saving…">
              Reset Password
            </Button>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
