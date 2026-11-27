import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { citizenService } from "../../services/citizenService";

const INITIAL_FORM = {
  title: "",
  category: "",
  description: "",
  departmentId: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
};

const CATEGORIES = [
  "Roads and Infrastructure",
  "Water Supply",
  "Electricity",
  "Sanitation",
  "Public Health",
  "Other",
];

export default function CitizenNewGrievance() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    citizenService.departments()
      .then(({ departments: rows }) => {
        if (active) setDepartments(rows.filter((item) => item.isActive !== false));
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "Department suggestions could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingDepartments(false);
      });
    return () => { active = false; };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (errorMessage) setErrorMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (form.title.trim().length < 5) {
      setErrorMessage("Title must be at least 5 characters.");
      return;
    }
    if (!form.category) {
      setErrorMessage("Select a category for this grievance.");
      return;
    }
    if (form.description.trim().length < 20) {
      setErrorMessage("Please describe the issue in at least 20 characters.");
      return;
    }

    const location = {
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
    };
    const payload = {
      title: form.title.trim(),
      category: form.category,
      description: form.description.trim(),
      ...(form.departmentId ? { requestedDepartmentId: form.departmentId } : {}),
      ...(Object.values(location).some(Boolean) ? { location } : {}),
    };

    setSubmitting(true);
    setErrorMessage("");
    try {
      const { grievance } = await citizenService.createGrievance(payload);
      navigate(`/citizen/grievances/${grievance._id}`, { replace: true, state: { created: true } });
    } catch (error) {
      setErrorMessage(error.message || "Could not submit your grievance. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout title="File New Grievance" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Citizen Dashboard", to: "/citizen/dashboard" },
      { label: "File New Grievance" },
    ]}>
      <section className="citizen-page citizen-create" aria-labelledby="citizen-create-title">
        <header className="citizen-page__header">
          <div>
            <p className="citizen-eyebrow">We are here to help</p>
            <h1 id="citizen-create-title">File a New Grievance</h1>
            <p>Provide clear details so the relevant department can review your issue.</p>
          </div>
        </header>
        {errorMessage && <Alert title="Grievance not submitted">{errorMessage}</Alert>}
        <form className="citizen-form" onSubmit={handleSubmit}>
          <div className="citizen-form__grid">
            <label>
              <span>Grievance title <b aria-hidden="true">*</b></span>
              <input name="title" value={form.title} onChange={handleChange} minLength={5} maxLength={120} required placeholder="Briefly summarize the issue" />
            </label>
            <label>
              <span>Category <b aria-hidden="true">*</b></span>
              <select name="category" value={form.category} onChange={handleChange} required>
                <option value="">Select a category</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="citizen-form__wide">
              <span>Describe the issue <b aria-hidden="true">*</b></span>
              <textarea name="description" value={form.description} onChange={handleChange} minLength={20} maxLength={5000} required rows={6} placeholder="Include what happened, where it happened and any steps already taken." />
              <small>{form.description.length}/5000 characters</small>
            </label>
            <label>
              <span>Suggested department</span>
              <select name="departmentId" value={form.departmentId} onChange={handleChange} disabled={loadingDepartments}>
                <option value="">{loadingDepartments ? "Loading departments…" : "Let the portal route it"}</option>
                {departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
              </select>
              <small>This is only a suggestion; staff will confirm the assigned department.</small>
            </label>
            <label>
              <span>Issue location / address</span>
              <input name="address" value={form.address} onChange={handleChange} maxLength={250} placeholder="Street, landmark or area" />
            </label>
            <label>
              <span>City or town</span>
              <input name="city" value={form.city} onChange={handleChange} maxLength={100} />
            </label>
            <label>
              <span>State</span>
              <input name="state" value={form.state} onChange={handleChange} maxLength={100} />
            </label>
            <label>
              <span>Postal code</span>
              <input name="postalCode" value={form.postalCode} onChange={handleChange} maxLength={12} inputMode="numeric" />
            </label>
          </div>
          <div className="citizen-form__actions">
            <Button type="submit" loading={submitting} loadingText="Submitting grievance…">Submit Grievance</Button>
            <Link to="/citizen/dashboard">Cancel</Link>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
