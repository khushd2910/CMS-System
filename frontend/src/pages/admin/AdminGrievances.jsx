import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { adminService } from "../../services/adminService";
import { ASSIGNABLE_STATUSES, PRIORITIES, STATUSES, statusLabel, statusSlug } from "../../utils/grievanceRules";
import AdminGrievanceDetail from "./AdminGrievanceDetail";

const PAGE_SIZE = 20;

export default function AdminGrievances({ departments, onChanged }) {
  const [grievances, setGrievances] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0); // change it to make the list load again
  const [selectedId, setSelectedId] = useState(""); // the grievance whose detail page is open
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  // Loads one page of grievances whenever the page, search, filters, or refreshKey change.
  // While a detail page is open the list is hidden, so nothing is loaded; closing it loads the list again.
  useEffect(() => {
    if (selectedId) return undefined;
    let active = true; // stops an old, slow request from overwriting a newer one
    setLoading(true);
    adminService.grievances({ page, limit: PAGE_SIZE, search: appliedSearch, status, priority })
      .then((result) => {
        if (!active) return;
        setGrievances(result.grievances);
        setPagination(result.pagination);
        setErrorMessage("");
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "Could not load grievances.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, appliedSearch, status, priority, refreshKey, selectedId]);

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
      setRefreshKey((value) => value + 1);
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

  function openDetail(id) {
    setErrorMessage("");
    setNotice("");
    setSelectedId(id);
  }

  if (selectedId) {
    return (
      <AdminGrievanceDetail
        id={selectedId}
        departments={departments}
        onBack={() => setSelectedId("")}
        onChanged={onChanged}
      />
    );
  }

  const total = pagination?.total || 0;
  const totalPages = Math.max(1, pagination?.totalPages || 1);
  const firstShown = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(total, page * PAGE_SIZE);
  const hasFilters = Boolean(appliedSearch || status || priority);

  return (
    <section className="admin-module" aria-labelledby="admin-grievances-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">Service delivery</p>
          <h1 className="admin-module__title" id="admin-grievances-title">Grievances</h1>
          <p className="admin-module__subtitle">Open a grievance to read it, change its status or priority, or assign it to an active department.</p>
        </div>
        <form className="admin-search admin-grievance-search" onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}>
          <Search size={17} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="grievance-search">Search grievances</label>
          <input id="grievance-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference or title" />
          <Button type="submit" disabled={loading}>Search</Button>
        </form>
      </header>

      <div className="admin-list-filters">
        <label className="visually-hidden" htmlFor="grievance-status-filter">Filter by status</label>
        <select id="grievance-status-filter" className="admin-filter" value={status}
          onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select>
        <label className="visually-hidden" htmlFor="grievance-priority-filter">Filter by priority</label>
        <select id="grievance-priority-filter" className="admin-filter" value={priority}
          onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
          <option value="">All priorities</option>
          {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {hasFilters && (
          <button type="button" className="admin-text-button" onClick={() => {
            setSearch("");
            setAppliedSearch("");
            setStatus("");
            setPriority("");
            setPage(1);
          }}>Clear filters</button>
        )}
      </div>

      {errorMessage && <Alert title="Grievance management">{errorMessage}</Alert>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {loading ? (
        <div className="admin-panel"><p className="admin-empty" role="status">Loading grievances…</p></div>
      ) : grievances.length === 0 ? (
        <div className="admin-panel"><p className="admin-empty">{hasFilters ? "No grievances match these filters." : "No grievances found."}</p></div>
      ) : (
        <div className="admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table admin-grievance-table">
              <thead>
                <tr><th>Grievance</th><th>Priority</th><th>Status</th><th>Department</th><th>Assign / reassign</th></tr>
              </thead>
              <tbody>
                {grievances.map((grievance) => {
                  const id = grievance._id;
                  const current = assignments[id] || {};
                  const currentDepartmentId = String(grievance.departmentId?._id || grievance.departmentId || "");
                  const canAssign = Boolean(current.departmentId) &&
                    current.departmentId !== currentDepartmentId &&
                    (!currentDepartmentId || Boolean(current.remarks?.trim()));
                  const isOpen = ASSIGNABLE_STATUSES.includes(grievance.status);
                  return (
                    <tr key={id}>
                      <td>
                        <strong>{grievance.referenceNumber}</strong>
                        <span className="admin-table__sub">{grievance.title}</span>
                        <span className="admin-table__sub">{new Date(grievance.createdAt).toLocaleDateString()}</span>
                        <button type="button" className="admin-text-button admin-view-button" onClick={() => openDetail(id)}
                          aria-label={`View details of ${grievance.referenceNumber}`}>
                          View details
                        </button>
                      </td>
                      <td><span className={`admin-priority admin-priority--${grievance.priority}`}>{grievance.priority}</span></td>
                      <td><span className={`admin-status admin-status--${statusSlug(grievance.status)}`}>{statusLabel(grievance.status)}</span></td>
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
          <div className="admin-pagination">
            <span>Showing {firstShown}–{lastShown} of {total} grievance{total === 1 ? "" : "s"}</span>
            <div className="admin-pagination__controls">
              <Button type="button" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <span>Page {page} of {totalPages}</span>
              <Button type="button" variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
