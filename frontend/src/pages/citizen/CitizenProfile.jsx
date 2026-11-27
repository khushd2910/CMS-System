import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";

const EMPTY_ADDRESS = {
  state: "",
  district: "",
  cityOrTaluka: "",
  villageOrWard: "",
  line: "",
  landmark: "",
  pinCode: "",
};

export default function CitizenProfile() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    authService.me()
      .then(({ user: profile }) => {
        if (!active) return;
        setName(profile.name || "");
        setAddress({ ...EMPTY_ADDRESS, ...(profile.address || {}) });
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "Could not load your profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function updateAddress(event) {
    const { name: field, value } = event.target;
    setAddress((current) => ({ ...current, [field]: value }));
    setErrorMessage("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (name.trim().length < 2) {
      setErrorMessage("Name must be at least 2 characters.");
      return;
    }
    if (!/^[1-9]\d{5}$/.test(address.pinCode.trim())) {
      setErrorMessage("PIN code must be 6 digits.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      await updateProfile({ name: name.trim(), address });
      setNotice("Your profile has been updated.");
    } catch (error) {
      setErrorMessage(error.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalLayout title="Update Profile" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Citizen Dashboard", to: "/citizen/dashboard" },
      { label: "Update Profile" },
    ]}>
      <section className="citizen-page citizen-profile" aria-labelledby="citizen-profile-title">
        <header className="citizen-page__header">
          <div>
            <p className="citizen-eyebrow">Your account</p>
            <h1 id="citizen-profile-title">Update Profile</h1>
            <p>Keep your name and contact address current for grievance updates.</p>
          </div>
        </header>
        {errorMessage && <Alert title="Profile">{errorMessage}</Alert>}
        {notice && <p className="citizen-notice" role="status">{notice}</p>}
        {loading ? (
          <p className="citizen-empty" role="status">Loading your profile…</p>
        ) : (
          <form className="citizen-form" onSubmit={handleSubmit}>
            <label>
              <span>Full name <b aria-hidden="true">*</b></span>
              <input value={name} onChange={(event) => { setName(event.target.value); setErrorMessage(""); setNotice(""); }} minLength={2} maxLength={120} required />
            </label>
            <label>
              <span>Verified email address</span>
              <input value={user?.email || ""} readOnly aria-describedby="citizen-profile-email-note" />
              <small id="citizen-profile-email-note">Email is verified and cannot be changed here.</small>
            </label>
            <fieldset className="citizen-form__fieldset">
              <legend>Address</legend>
              <div className="citizen-form__grid">
                <label><span>State <b aria-hidden="true">*</b></span><input name="state" value={address.state} onChange={updateAddress} required maxLength={100} /></label>
                <label><span>District <b aria-hidden="true">*</b></span><input name="district" value={address.district} onChange={updateAddress} required maxLength={100} /></label>
                <label><span>City or taluka <b aria-hidden="true">*</b></span><input name="cityOrTaluka" value={address.cityOrTaluka} onChange={updateAddress} required maxLength={100} /></label>
                <label><span>Village or ward</span><input name="villageOrWard" value={address.villageOrWard} onChange={updateAddress} maxLength={100} /></label>
                <label className="citizen-form__wide"><span>Address line <b aria-hidden="true">*</b></span><input name="line" value={address.line} onChange={updateAddress} required maxLength={250} /></label>
                <label><span>Landmark</span><input name="landmark" value={address.landmark} onChange={updateAddress} maxLength={250} /></label>
                <label><span>PIN code <b aria-hidden="true">*</b></span><input name="pinCode" value={address.pinCode} onChange={updateAddress} inputMode="numeric" maxLength={6} required /></label>
              </div>
            </fieldset>
            <div className="citizen-form__actions">
              <Button type="submit" loading={saving} loadingText="Saving changes…">Save Profile</Button>
              <Link to="/citizen/dashboard">Cancel</Link>
            </div>
          </form>
        )}
      </section>
    </PortalLayout>
  );
}
