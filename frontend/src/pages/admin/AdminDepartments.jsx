import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Pencil, RotateCcw, Search } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextField from "../../components/ui/TextField";
import { adminService } from "../../services/adminService";

const EMPTY_FORM = {
  name: "",
  code: "",
  description: "",
  contactEmail: "",
  contactNumber: "",
  isActive: true,
};

function departmentForm(department) {
  return {
    name: department.name || "",
    code: department.code || "",
    description: department.description || "",
    contactEmail: department.contactEmail || "",
    contactNumber: department.contactNumber || "",
    isActive: department.isActive !== false,
  };
}

export default function AdminDepartments() {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function loadDepartments() {
    setLoading(true);
    try {
      const result = await adminService.departments({ limit: 100 });
      setDepartments(result.departments);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load departments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  const visibleDepartments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return departments;
    return departments.filter((department) =>
      [department.name, department.code, department.contactEmail]
        .some((value) => value?.toLowerCase().includes(term))
    );
  }, [departments, search]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setErrorMessage("");
    setNotice("");
  }

  function editDepartment(department) {
    setForm(departmentForm(department));
    setEditingId(department.id || department._id);
    setErrorMessage("");
    setNotice("");
    document.getElementById("department-name")?.focus();
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
    setErrorMessage("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const message = editingId ? "Department details updated." : "Department created.";
      if (editingId) {
        await adminService.updateDepartment(editingId, form);
      } else {
        await adminService.createDepartment(form);
      }
      resetForm();
      await loadDepartments();
      setNotice(message);
    } catch (error) {
      setErrorMessage(error.message || "Could not save department.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(department) {
    const id = department.id || department._id;
    try {
      await adminService.updateDepartment(id, { isActive: department.isActive === false });
      setNotice(`${department.name} ${department.isActive === false ? "activated" : "deactivated"}.`);
      await loadDepartments();
    } catch (error) {
      setErrorMessage(error.message || "Could not update department status.");
    }
  }

  return (
    <section className="admin-module" aria-labelledby="department-management-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">Organization setup</p>
          <h1 className="admin-module__title" id="department-management-title">Issue Departments</h1>
          <p className="admin-module__subtitle">Create departments and monitor their managers and grievance workload.</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadDepartments} disabled={loading}>
          <RotateCcw size={16} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {errorMessage && <Alert title="Department management">{errorMessage}</Alert>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-module__grid">
        <form className="admin-panel admin-management-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit department" : "Add a department"}</h2>
          <TextField id="department-name" name="name" label="Department name" required maxLength={100}
            value={form.name} onChange={updateField} readOnly={saving} />
          <TextField id="department-code" name="code" label="Department code" required maxLength={20}
            hint="2–20 letters, numbers, hyphens, or underscores."
            value={form.code} onChange={updateField} readOnly={saving} />
          <TextField id="department-email" name="contactEmail" label="Contact email" type="email"
            value={form.contactEmail} onChange={updateField} readOnly={saving} />
          <TextField id="department-number" name="contactNumber" label="Office contact number" type="tel"
            autoComplete="work tel" value={form.contactNumber} onChange={updateField} readOnly={saving} />
          <label className="admin-textarea-field" htmlFor="department-description">
            <span>Description</span>
            <textarea id="department-description" name="description" rows={3} maxLength={1000}
              value={form.description} onChange={updateField} readOnly={saving} />
          </label>
          <label className="admin-check-field">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={updateField} disabled={saving} />
            <span>Department is active</span>
          </label>
          <div className="admin-form-actions">
            <Button type="submit" loading={saving} loadingText="Saving…">
              <CirclePlus size={17} aria-hidden="true" /> {editingId ? "Save changes" : "Create department"}
            </Button>
            {editingId && <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>

        <section className="admin-panel" aria-labelledby="departments-list-title">
          <div className="admin-list-toolbar">
            <h2 id="departments-list-title">All departments</h2>
            <label className="admin-search">
              <Search size={17} aria-hidden="true" />
              <span className="visually-hidden">Search departments</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search departments" />
            </label>
          </div>
          {loading ? (
            <p className="admin-empty">Loading departments…</p>
          ) : visibleDepartments.length === 0 ? (
            <p className="admin-empty">No departments match this search.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Department</th><th>Managers</th><th>Grievances</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  {visibleDepartments.map((department) => {
                    const id = department.id || department._id;
                    return (
                      <tr key={id}>
                        <td>
                          <strong>{department.name}</strong>
                          <span className="admin-table__sub">{department.code || "No code"}{department.contactEmail ? ` · ${department.contactEmail}` : ""}</span>
                        </td>
                        <td>{department.managerCount ?? 0}</td>
                        <td>{department.grievanceCount ?? 0}</td>
                        <td><span className={`admin-status ${department.isActive === false ? "admin-status--inactive" : ""}`}>
                          {department.isActive === false ? "Inactive" : "Active"}
                        </span></td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-icon-button" onClick={() => editDepartment(department)} aria-label={`Edit ${department.name}`}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="admin-text-button" onClick={() => toggleActive(department)}>
                              {department.isActive === false ? "Activate" : "Deactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
