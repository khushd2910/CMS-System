import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { useCooldown, formatWait } from "../hooks/useCooldown";
import { authService } from "../services/authService";
import { validateEmail } from "../utils/validators";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Forgot Password" }];
const COOLDOWN_SECONDS = 60;

function describeError(error) {
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 429) return "Too many requests. Please try again in a few minutes.";
  return "The service is temporarily unavailable. Please try again in a few minutes.";
}

// POST /api/auth/forgot-password. The answer is the same whether or not the account exists, so this page
// never says whether an email is registered.
export default function ForgotPassword() {
  const location = useLocation();
  // The admin and manager login pages pass their own path so "Back to login" returns to the right place.
  const loginPath = location.state?.loginPath || "/login";

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const { secondsLeft, start } = useCooldown();
  const emailRef = useRef(null);

  const normalizedEmail = email.trim().toLowerCase();
  // The wait only applies to the address the link was sent to, so a mistyped address can be corrected at once.
  const wait = normalizedEmail === sentTo ? secondsLeft : 0;

  function handleChange(event) {
    setEmail(event.target.value);
    if (formError) setFormError("");
    if (error) setError(validateEmail(event.target.value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || wait > 0) return;
    setFormError("");

    const problem = validateEmail(email);
    setError(problem);
    if (problem) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await authService.forgotPassword({ email: normalizedEmail });
      setSentTo(normalizedEmail);
      start(COOLDOWN_SECONDS);
    } catch (requestError) {
      setFormError(describeError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout title="Forgot Password" breadcrumb={BREADCRUMB}>
      <section className="card register-success" aria-labelledby="forgot-heading">
        <h1 className="card__title" id="forgot-heading">Forgot Password</h1>
        <p className="card__subtitle">
          Enter the email address of your account. We will email you a link to choose a new password.
        </p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {formError && <Alert title="Could not send the link">{formError}</Alert>}

          <TextField
            id="email"
            name="email"
            ref={emailRef}
            label="Email Address"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter your email address"
            value={email}
            onChange={handleChange}
            readOnly={submitting}
            error={error}
          />

          {sentTo && (
            <div className="info-line">
              <p role="status">
                If an account exists for <strong>{sentTo}</strong>, password reset instructions have been sent.
                The link works for 30 minutes. Check your spam folder too.
              </p>
            </div>
          )}

          <div className="login-form__actions">
            <Button type="submit" loading={submitting} loadingText="Sending…" disabled={wait > 0}>
              {wait > 0 ? `Send again in ${formatWait(wait)}` : sentTo ? "Send Again" : "Send Reset Link"}
            </Button>
          </div>

          <p className="login-form__register">
            Remembered it? <Link to={loginPath}>Back to login</Link>
          </p>
        </form>
      </section>
    </PortalLayout>
  );
}
