import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { adminService } from "../../services/adminService";

const OPEN_STATUSES = new Set(["submitted", "under_review", "assigned", "in_progress"]);

export default function AdminGrievances({ departments, onChanged }) {
  const [grievances, setGrievances] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function loadGrievances(term = appliedSearch) {
    setLoading(true);
    try {
      const result = await adminService.grievances({ limit: 100, search: term });
      setGrievances(result.grievances);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load grievances.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGrievances("");
  }, []);

  function updateAssignment(id, field, value) {
    setAssignments((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }

  async function assign(grievance) {
    const id = grievance._id;
    const assignment = assignments[id] || {};
    if (!assignment.departmentId) {
      setErrorMessage("Select a department before assigning this grievance.");
      return;
    }
    if (grievance.departmentId && !assignment.remarks?.trim()) {
      setErrorMessage("A reason is required when reassigning a grievance.");
      return;
    }

    setAssigningId(id);
    setErrorMessage("");
    setNotice("");
    try {
      await adminService.assignGrievance(id, {
        departmentId: assignment.departmentId,
        ...(assignment.remarks?.trim() ? { remarks: assignment.remarks.trim() } : {}),
      });
      setNotice(`${grievance.referenceNumber} assigned successfully.`);
      await loadGrievances();
      await onChanged();
      setAssignments((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      setErrorMessage(error.message || "Could not assign grievance.");
    } finally {
      setAssigningId("");
    }
  }

  return (
    <section className="admin-module" aria-labelledby="admin-grievances-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">Service delivery</p>
          <h1 className="admin-module__title" id="admin-grievances-title">Grievances</h1>
          <p className="admin-module__subtitle">Review incoming cases and assign open grievances to an active department.</p>
        </div>
        <form className="admin-search admin-grievance-search" onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search);
          loadGrievances(search);
        }}>
          <Search size={17} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="grievance-search">Search grievances</label>
          <input id="grievance-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference or title" />
          <Button type="submit" disabled={loading}>Search</Button>
        </form>
      </header>

      {errorMessage && <Alert title="Grievance management">{errorMessage}</Alert>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {loading ? (
        <div className="admin-panel"><p className="admin-empty">Loading grievances…</p></div>
      ) : grievances.length === 0 ? (
        <div className="admin-panel"><p className="admin-empty">No grievances found.</p></div>
      ) : (
        <div className="admin-panel admin-table-wrap">
          <table className="admin-table admin-grievance-table">
            <thead>
              <tr><th>Grievance</th><th>Status</th><th>Department</th><th>Assign / reassign</th></tr>
            </thead>
            <tbody>
              {grievances.map((grievance) => {
                const id = grievance._id;
                const current = assignments[id] || {};
                const currentDepartmentId = String(grievance.departmentId?._id || grievance.departmentId || "");
                const canAssign = Boolean(current.departmentId) &&
                  current.departmentId !== currentDepartmentId &&
                  (!currentDepartmentId || Boolean(current.remarks?.trim()));
                const isOpen = OPEN_STATUSES.has(grievance.status);
                return (
                  <tr key={id}>
                    <td>
                      <strong>{grievance.referenceNumber}</strong>
                      <span className="admin-table__sub">{grievance.title}</span>
                      <span className="admin-table__sub">{new Date(grievance.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td><span className="admin-status">{grievance.status.replaceAll("_", " ")}</span></td>
                    <td>{grievance.departmentId?.name || "Unassigned"}</td>
                    <td>
                      {isOpen ? (
                        <div className="admin-assignment-control">
                          <label className="visually-hidden" htmlFor={`assign-${id}`}>Department for {grievance.referenceNumber}</label>
                          <select id={`assign-${id}`} value={current.departmentId || ""}
                            onChange={(event) => updateAssignment(id, "departmentId", event.target.value)}>
                            <option value="">Select department</option>
                            {departments.filter((department) => department.isActive !== false).map((department) => (
                              <option key={department._id} value={department._id}>{department.name}</option>
                            ))}
                          </select>
                          {grievance.departmentId && (
                            <>
                              <label className="visually-hidden" htmlFor={`remark-${id}`}>Reassignment reason for {grievance.referenceNumber}</label>
                              <input id={`remark-${id}`} value={current.remarks || ""} maxLength={500}
                                placeholder="Reassignment reason"
                                onChange={(event) => updateAssignment(id, "remarks", event.target.value)} />
                            </>
                          )}
                          <Button type="button" disabled={assigningId === id || !canAssign || !departments.some((department) => department.isActive !== false)}
                            loading={assigningId === id} loadingText="Saving…" onClick={() => assign(grievance)}>
                            {grievance.departmentId ? "Reassign" : "Assign"}
                          </Button>
                        </div>
                      ) : <span className="admin-table__sub">Closed to assignment</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
