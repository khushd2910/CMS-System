import { useEffect, useMemo, useState } from "react";
import { Pencil, RotateCcw, Search, UserPlus } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextField from "../../components/ui/TextField";
import { adminService } from "../../services/adminService";

const EMPTY_FORM = {
  name: "",
  email: "",
  contactNumber: "",
  password: "",
  confirmPassword: "",
  departmentId: "",
  isActive: true,
};

function managerForm(manager) {
  return {
    name: manager.name || "",
    email: manager.email || "",
    contactNumber: manager.contactNumber || "",
    password: "",
    confirmPassword: "",
    departmentId: manager.departmentId?._id || manager.departmentId || "",
    isActive: manager.isActive !== false,
  };
}

export default function AdminManagers() {
  const [managers, setManagers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [managerResult, departmentResult] = await Promise.all([
        adminService.managers({ limit: 100 }),
        adminService.departments({ limit: 100 }),
      ]);
      setManagers(managerResult.managers);
      setDepartments(departmentResult.departments);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load manager data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.isActive !== false),
    [departments]
  );
  const visibleManagers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return managers.filter((manager) => {
      const matchesSearch = !term || [manager.name, manager.email, manager.departmentId?.name]
        .some((value) => value?.toLowerCase().includes(term));
      const matchesDepartment = !departmentFilter ||
        String(manager.departmentId?._id || manager.departmentId) === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [managers, search, departmentFilter]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setErrorMessage("");
    setNotice("");
  }

  function editManager(manager) {
    setForm(managerForm(manager));
    setEditingId(manager.id || manager._id);
    setErrorMessage("");
    setNotice("");
    document.getElementById("manager-name")?.focus();
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (!editingId && !form.password) {
      setErrorMessage("Create a password for this manager.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        contactNumber: form.contactNumber,
        departmentId: form.departmentId,
        isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}),
      };
      if (editingId) {
        await adminService.updateManager(editingId, payload);
        setNotice("Manager details updated.");
      } else {
        await adminService.createManager(payload);
        setNotice("Department manager created.");
      }
      resetForm();
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || "Could not save manager.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(manager) {
    const id = manager.id || manager._id;
    try {
      await adminService.updateManager(id, { isActive: manager.isActive === false });
      setNotice(`${manager.name} ${manager.isActive === false ? "activated" : "deactivated"}.`);
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update manager status.");
    }
  }

  return (
    <section className="admin-module" aria-labelledby="manager-management-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">People and permissions</p>
          <h1 className="admin-module__title" id="manager-management-title">Department Managers</h1>
          <p className="admin-module__subtitle">Create and manage staff accounts. Managers cannot register themselves or change their assigned department.</p>
        </div>
        <Button type="button" variant="secondary" onClick={loadData} disabled={loading}>
          <RotateCcw size={16} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {errorMessage && <Alert title="Manager management">{errorMessage}</Alert>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-module__grid">
        <form className="admin-panel admin-management-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit manager" : "Create manager account"}</h2>
          <TextField id="manager-name" name="name" label="Full name" required minLength={2}
            value={form.name} onChange={updateField} readOnly={saving} />
          <TextField id="manager-email" name="email" label="Email address" type="email" required
            autoComplete="email" value={form.email} onChange={updateField} readOnly={saving} />
          <TextField id="manager-contact-number" name="contactNumber" label="Work contact number" type="tel"
            autoComplete="work tel" value={form.contactNumber} onChange={updateField} readOnly={saving} />
          <label className="admin-native-field" htmlFor="manager-department">
            <span>Assigned department <b aria-hidden="true">*</b></span>
            <select id="manager-department" name="departmentId" value={form.departmentId}
              onChange={updateField} disabled={saving} required>
              <option value="">Select an active department</option>
              {activeDepartments.map((department) => (
                <option key={department._id} value={department._id}>{department.name}</option>
              ))}
            </select>
          </label>
          <TextField id="manager-password" name="password" label={editingId ? "New password (optional)" : "Password"}
            type="password" autoComplete="new-password" required={!editingId}
            hint="At least 8 characters, including a letter, number, and symbol."
            value={form.password} onChange={updateField} readOnly={saving} />
          <TextField id="manager-confirm-password" name="confirmPassword" label={editingId ? "Confirm new password" : "Confirm password"}
            type="password" autoComplete="new-password" required={!editingId && Boolean(form.password)}
            value={form.confirmPassword} onChange={updateField} readOnly={saving} />
          <label className="admin-check-field">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={updateField} disabled={saving} />
            <span>Account is active</span>
          </label>
          <div className="admin-form-actions">
            <Button type="submit" loading={saving} loadingText="Saving…">
              <UserPlus size={17} aria-hidden="true" /> {editingId ? "Save changes" : "Create manager"}
            </Button>
            {editingId && <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>

        <section className="admin-panel" aria-labelledby="manager-list-title">
          <div className="admin-list-toolbar admin-list-toolbar--wrap">
            <h2 id="manager-list-title">All managers</h2>
            <div className="admin-list-filters">
              <label className="admin-search">
                <Search size={17} aria-hidden="true" />
                <span className="visually-hidden">Search managers</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search managers" />
              </label>
              <label className="visually-hidden" htmlFor="manager-filter">Filter by department</label>
              <select id="manager-filter" className="admin-filter" value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}>
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department._id} value={department._id}>{department.name}</option>
                ))}
              </select>
            </div>
          </div>
          {loading ? (
            <p className="admin-empty">Loading managers…</p>
          ) : visibleManagers.length === 0 ? (
            <p className="admin-empty">No managers match these filters.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Manager</th><th>Department</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  {visibleManagers.map((manager) => {
                    const id = manager.id || manager._id;
                    return (
                      <tr key={id}>
                        <td>
                          <strong>{manager.name}</strong>
                          <span className="admin-table__sub">{manager.email}{manager.contactNumber ? ` · ${manager.contactNumber}` : ""}</span>
                        </td>
                        <td>{manager.departmentId?.name || "Unassigned"}</td>
                        <td><span className={`admin-status ${manager.isActive === false ? "admin-status--inactive" : ""}`}>
                          {manager.isActive === false ? "Inactive" : "Active"}
                        </span></td>
                        <td>
                          <div className="admin-row-actions">
                            <button type="button" className="admin-icon-button" onClick={() => editManager(manager)} aria-label={`Edit ${manager.name}`}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="admin-text-button" onClick={() => toggleActive(manager)}>
                              {manager.isActive === false ? "Activate" : "Deactivate"}
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
