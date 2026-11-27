import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CircleCheck, Lock } from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import TextField from "../components/ui/TextField";
import PasswordField from "../components/ui/PasswordField";
import SelectField from "../components/ui/SelectField";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import { useAuth } from "../context/AuthContext";
import { CITIZEN_HOME_PATH, homePathForRole } from "../config/auth.config";
import { LOCATIONS } from "../data/locations";
import {
  passwordStrength,
  validateConfirmPassword,
  validateDob,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validatePin,
  validateRequired,
} from "../utils/validators";

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Citizen Registration" }];
const BENEFITS = [
  "Submit grievances online.",
  "Track grievance status.",
  "Receive department updates.",
  "Access your grievance history.",
];
const GENDERS = [
  { value: "male", text: "Male" },
  { value: "female", text: "Female" },
  { value: "other", text: "Other" },
  { value: "prefer_not_to_say", text: "Prefer not to say" },
];
const EMPTY_FORM = {
  name: "", dob: "", gender: "", email: "",
  password: "", confirm: "",
  state: "", district: "", city: "", village: "", address: "", landmark: "", pin: "",
  agree: false,
};

// Field order = order of focus when a submit fails.
const FIELD_ORDER = [
  "name", "dob", "email", "password", "confirm",
  "state", "district", "city", "address", "pin", "agree",
];

function validateField(name, form) {
  switch (name) {
    case "name": return validateFullName(form.name);
    case "dob": return validateDob(form.dob);
    case "email": return validateEmail(form.email);
    case "password": return validateNewPassword(form.password);
    case "confirm": return validateConfirmPassword(form.password, form.confirm);
    case "state": return validateRequired("Select your state")(form.state);
    case "district": return validateRequired("Select your district")(form.district);
    case "city": return validateRequired("Select your city or taluka")(form.city);
    case "address": return validateRequired("Enter your complete address")(form.address);
    case "pin": return validatePin(form.pin);
    case "agree": return form.agree ? "" : "You must accept the Terms and Conditions and Privacy Policy to register.";
    default: return "";
  }
}

function describeRegisterError(error) {
  if (error.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (error.status === 0) return "Could not reach the server. Check your internet connection and try again.";
  if (error.status === 409 && error.serverCode === "EMAIL_EXISTS") {
    return "An account with this email address already exists. Try signing in instead.";
  }
  if (error.status === 409) return "An account with these details already exists. Try signing in instead.";
  if (error.status === 503 && error.serverCode === "EMAIL_DELIVERY_FAILED") {
    return "Your account has not been created yet. A verification email could not be sent; continue to request a new code.";
  }
  if (error.status === 503) return "The email service is unavailable right now. Please try again later.";
  if (error.status === 400) return error.message;
  return "The service is temporarily unavailable. Please try again in a few minutes.";
}

export default function CitizenRegister() {
  const { status, user, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationDeliveryIssue, setVerificationDeliveryIssue] = useState(false);
  const firstFieldRef = useRef(null);

  const districts = useMemo(() => Object.keys(LOCATIONS[form.state] || {}), [form.state]);
  const cities = useMemo(() => LOCATIONS[form.state]?.[form.district] || [], [form.state, form.district]);
  const strength = passwordStrength(form.password);

  // Already signed in (and not just finished registering)? Go to the citizen area.
  if (status === "authenticated" && !done) return <Navigate to={homePathForRole(user?.role)} replace />;

  function update(changes) {
    const next = { ...form, ...changes };
    setForm(next);
    if (formError) setFormError("");
    // Errors appear on submit; once shown, re-check them while the person fixes them.
    setErrors((current) => {
      const updated = { ...current };
      Object.keys(current).forEach((key) => {
        if (current[key] || key === "confirm") updated[key] = validateField(key, next);
      });
      return updated;
    });
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    update({ [name]: type === "checkbox" ? checked : value });
  }

  function handleStateChange(event) {
    update({ state: event.target.value, district: "", city: "" });
  }

  function handleDistrictChange(event) {
    update({ district: event.target.value, city: "" });
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError("");
    firstFieldRef.current?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");

    const nextErrors = {};
    FIELD_ORDER.forEach((field) => {
      nextErrors[field] = validateField(field, form);
    });
    setErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        dateOfBirth: form.dob || undefined,
        gender: form.gender || undefined,
        termsAccepted: form.agree,
        address: {
          state: form.state,
          district: form.district,
          cityOrTaluka: form.city,
          villageOrWard: form.village.trim(),
          line: form.address.trim(),
          landmark: form.landmark.trim(),
          pinCode: form.pin.trim(),
        },
      });
      setNeedsVerification(Boolean(result?.requiresVerification));
      setDone(true);
    } catch (error) {
      if (error.serverCode === "EMAIL_DELIVERY_FAILED") {
        setNeedsVerification(true);
        setVerificationDeliveryIssue(true);
        setDone(true);
        setSubmitting(false);
        return;
      }
      setFormError(describeRegisterError(error));
      setForm((current) => ({ ...current, password: "", confirm: "" })); // never keep passwords after a failure
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (done) {
    return (
      <PortalLayout title="Registration Successful" breadcrumb={BREADCRUMB}>
        <section className="card register-success" aria-labelledby="success-heading">
          <CircleCheck className="register-success__icon" size={44} aria-hidden="true" />
          <h1 className="card__title" id="success-heading" tabIndex={-1} ref={(node) => node?.focus()}>
            {needsVerification ? "Verify Your Account" : "Registration Successful"}
          </h1>
          <p className="card__subtitle" role="status">
            {needsVerification
              ? verificationDeliveryIssue
                ? "Your account has not been created yet because the verification email could not be sent. Request a new code to continue."
                : "A verification code has been emailed to you. Your account will be created after you verify your email address."
              : "Your citizen account has been created and you are signed in. You can now submit grievances and track their progress."}
          </p>
          <div className="login-form__actions">
            {needsVerification ? (
              <Button
                type="button"
                onClick={() => navigate("/verify-email", {
                  state: {
                    email: form.email.trim().toLowerCase(),
                  },
                })}
              >
                Verify Account
              </Button>
            ) : (
              <Button type="button" onClick={() => navigate(CITIZEN_HOME_PATH, { replace: true })}>
                Go to Dashboard
              </Button>
            )}
          </div>
        </section>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Citizen Registration" breadcrumb={BREADCRUMB}>
      <div className="login-grid">
        <section className="card" aria-labelledby="register-heading">
          <h1 className="card__title" id="register-heading">
            Create Your Account
          </h1>
          <p className="card__subtitle">Register to submit grievances and track their progress.</p>
          <p className="register-note">
            Fields marked with <span className="field__required" aria-hidden="true">*</span>
            <span className="visually-hidden">an asterisk</span> are required.
          </p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {formError && <Alert title="Registration failed">{formError}</Alert>}

            <div className="register-cols">
              <div className="register-col">
                <fieldset className="panel">
                  <legend className="panel__title">Personal Information</legend>
                  <TextField
                    id="name" name="name" ref={firstFieldRef} label="Full Name" required
                    autoComplete="name" placeholder="Full Name"
                    value={form.name} onChange={handleChange} readOnly={submitting} error={errors.name}
                  />
                  <TextField
                    id="dob" name="dob" label="Date of Birth" type="date" autoComplete="bday"
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.dob} onChange={handleChange} readOnly={submitting} error={errors.dob}
                  />
                  <SelectField
                    id="gender" name="gender" label="Gender" placeholder="Select"
                    options={GENDERS} value={form.gender} onChange={handleChange} disabled={submitting}
                  />
                  <TextField
                    id="email" name="email" label="Email Address" required type="email" inputMode="email"
                    autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="example@mail.com"
                    value={form.email} onChange={handleChange} readOnly={submitting} error={errors.email}
                  />
                </fieldset>

                <fieldset className="panel">
                  <legend className="panel__title">Account Information</legend>
                  <PasswordField
                    id="password" name="password" label="Create Password" required
                    autoComplete="new-password" placeholder="Enter password"
                    hint="At least 8 characters, with a letter, a number, and a symbol."
                    value={form.password} onChange={handleChange} readOnly={submitting} error={errors.password}
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
                    id="confirm" name="confirm" label="Confirm Password" required
                    autoComplete="new-password" placeholder="Re-enter password"
                    value={form.confirm} onChange={handleChange} readOnly={submitting} error={errors.confirm}
                  />
                </fieldset>
              </div>

              <div className="register-col">
                <fieldset className="panel">
                  <legend className="panel__title">Address Information</legend>
                  <SelectField
                    id="state" name="state" label="State" required placeholder="Select State"
                    options={Object.keys(LOCATIONS)} value={form.state}
                    onChange={handleStateChange} disabled={submitting} error={errors.state}
                  />
                  <SelectField
                    id="district" name="district" label="District" required placeholder="Select District"
                    options={districts} value={form.district}
                    onChange={handleDistrictChange} disabled={submitting || !form.state} error={errors.district}
                  />
                  <SelectField
                    id="city" name="city" label="City / Taluka" required placeholder="Select City / Taluka"
                    options={cities} value={form.city}
                    onChange={handleChange} disabled={submitting || !form.district} error={errors.city}
                  />
                  <TextField
                    id="village" name="village" label="Village / Ward (optional)" autoComplete="off"
                    value={form.village} onChange={handleChange} readOnly={submitting}
                  />
                  <TextField
                    id="address" name="address" label="Complete Address" required
                    autoComplete="street-address" placeholder="Enter your address"
                    value={form.address} onChange={handleChange} readOnly={submitting} error={errors.address}
                  >
                    {({ id, ref, describedBy, invalid, required, inputProps }) => (
                      <textarea
                        id={id} ref={ref} className="field__input field__textarea" rows={4}
                        aria-invalid={invalid ? "true" : undefined}
                        aria-describedby={describedBy}
                        aria-required={required || undefined}
                        {...inputProps}
                      />
                    )}
                  </TextField>
                  <TextField
                    id="landmark" name="landmark" label="Landmark (optional)" autoComplete="off"
                    value={form.landmark} onChange={handleChange} readOnly={submitting}
                  />
                  <TextField
                    id="pin" name="pin" label="PIN Code" required inputMode="numeric" maxLength={6}
                    autoComplete="postal-code" placeholder="Enter PIN Code"
                    value={form.pin} onChange={handleChange} readOnly={submitting} error={errors.pin}
                  />
                </fieldset>
              </div>
            </div>

            <div className={`register-terms ${errors.agree ? "field--invalid" : ""}`}>
              <label className="checkbox">
                <input
                  id="agree" name="agree" type="checkbox"
                  checked={form.agree} onChange={handleChange} disabled={submitting}
                  aria-required="true"
                  aria-invalid={errors.agree ? "true" : undefined}
                  aria-describedby={errors.agree ? "agree-error" : undefined}
                />
                <span>
                  I agree to the <Link className="link" to="/policies">Terms and Conditions</Link> and{" "}
                  <Link className="link" to="/policies">Privacy Policy</Link>
                  <span className="field__required" aria-hidden="true"> *</span>
                </span>
              </label>
              {errors.agree && (
                <p className="field__error" id="agree-error">{errors.agree}</p>
              )}
            </div>

            <div className="login-form__actions">
              <Button type="submit" loading={submitting} loadingText="Registering…">
                Register
              </Button>
              <Button type="button" variant="secondary" disabled={submitting} onClick={handleReset}>
                Reset
              </Button>
            </div>

            <p className="login-form__register">
              Already have an account? <Link to="/login">Login here</Link>
            </p>
          </form>
        </section>

        <aside className="login-aside" aria-label="About registration">
          <section className="card card--soft">
            <h2 className="card__heading">Why Register?</h2>
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
            </div>
          </section>
        </aside>
      </div>
    </PortalLayout>
  );
}
