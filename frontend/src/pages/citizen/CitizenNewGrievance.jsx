import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { attachmentService } from "../../services/attachmentService";
import { citizenService } from "../../services/citizenService";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES_ON_NEW_GRIEVANCE,
  checkAttachmentFile,
  formatFileSize,
} from "../../utils/attachmentRules";

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
  const [files, setFiles] = useState([]); // optional attachments, uploaded right after the grievance is saved
  const [submitStage, setSubmitStage] = useState("");

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

  function handleFiles(event) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = ""; // lets the same file be chosen again later
    if (!chosen.length) return;
    const next = [...files];
    for (const file of chosen) {
      const problem = checkAttachmentFile(file);
      if (problem) {
        setErrorMessage(problem);
        continue;
      }
      if (next.length >= MAX_FILES_ON_NEW_GRIEVANCE) {
        setErrorMessage(`You can attach up to ${MAX_FILES_ON_NEW_GRIEVANCE} files here. You can add more later from the grievance page.`);
        break;
      }
      if (next.some((item) => item.name === file.name && item.size === file.size)) continue; // same file twice
      next.push(file);
      setErrorMessage("");
    }
    setFiles(next);
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
    setSubmitStage("");
    try {
      const { grievance } = await citizenService.createGrievance(payload);
      // The grievance is saved. Now upload the files one by one. If a file fails we do NOT undo the grievance:
      // we remember the name and tell the person on the next page, where they can try that file again.
      const uploadFailures = [];
      for (const [index, file] of files.entries()) {
        setSubmitStage(`Uploading file ${index + 1} of ${files.length}…`);
        try {
          await attachmentService.upload(grievance._id, file);
        } catch {
          uploadFailures.push(file.name);
        }
      }
      navigate(`/citizen/grievances/${grievance._id}`, { replace: true, state: { created: true, uploadFailures } });
    } catch (error) {
      setErrorMessage(error.message || "Could not submit your grievance. Please try again.");
      setSubmitting(false);
      setSubmitStage("");
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
            <div className="citizen-form__wide attachment-picker">
              <label htmlFor="grievance-files"><span>Photos or documents (optional)</span></label>
              <input id="grievance-files" type="file" multiple accept={ACCEPT_ATTRIBUTE}
                onChange={handleFiles} disabled={submitting} />
              <small>JPG, PNG, WEBP or PDF, up to 10 MB each, at most {MAX_FILES_ON_NEW_GRIEVANCE} files.</small>
              {files.length > 0 && (
                <ul className="attachment-picker__list" aria-label="Files to upload">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.size}`}>
                      <span>{file.name} ({formatFileSize(file.size)})</span>
                      <button type="button" disabled={submitting} onClick={() => setFiles(files.filter((_, i) => i !== index))}
                        aria-label={`Remove ${file.name}`}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="citizen-form__actions">
            <Button type="submit" loading={submitting} loadingText={submitStage || "Submitting grievance…"}>Submit Grievance</Button>
            <Link to="/citizen/dashboard">Cancel</Link>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
