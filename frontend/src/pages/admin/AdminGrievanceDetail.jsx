import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import AttachmentsPanel from "../../components/AttachmentsPanel";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { adminService } from "../../services/adminService";
import {
  ASSIGNABLE_STATUSES,
  PRIORITIES,
  PRIORITY_EDITABLE_STATUSES,
  remarksRequired,
  statusLabel,
  statusSlug,
} from "../../utils/grievanceRules";

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "—");

// The text on each status button. The same target status can mean different things
// (e.g. "in progress" from "resolved" means "send it back"), so we look at where it comes from too.
function statusAction(from, to) {
  if (from === "resolved" && to === "in_progress") return { label: "Send back for more work", variant: "secondary" };
  if (to === "under_review") return { label: "Mark as under review", variant: "primary" };
  if (to === "rejected") return { label: "Reject grievance", variant: "secondary" };
  if (to === "closed") return { label: "Close grievance", variant: "primary" };
  return { label: `Change to ${statusLabel(to)}`, variant: "primary" };
}

function historyTitle(item) {
  if (item.action === "department_assigned") return "Department assignment";
  if (item.action === "priority_changed") return "Priority changed";
  return statusLabel(item.newStatus);
}

export default function AdminGrievanceDetail({ id, departments = [], onBack, onChanged }) {
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(""); // which action is saving right now ("" = none)
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const [statusRemarks, setStatusRemarks] = useState("");
  const [priorityChoice, setPriorityChoice] = useState(""); // "" = keep the current priority
  const [priorityRemarks, setPriorityRemarks] = useState("");
  const [assignDepartmentId, setAssignDepartmentId] = useState("");
  const [assignRemarks, setAssignRemarks] = useState("");

  const load = useCallback(async () => {
    try {
      setResult(await adminService.grievance(id));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load this grievance.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const grievance = result?.grievance;
  const history = result?.history || [];
  const allowedTransitions = result?.allowedTransitions || [];

  // Runs one save, then reloads the grievance (so history and buttons are fresh)
  // and tells the dashboard to refresh its counts.
  async function runAction(key, action, successMessage, resetForm) {
    if (busy) return;
    setBusy(key);
    setErrorMessage("");
    setNotice("");
    try {
      await action();
      resetForm?.();
      setNotice(successMessage);
      await load();
      await onChanged?.();
    } catch (error) {
      setErrorMessage(error.message || "That change could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function changeStatus(next) {
    const remarks = statusRemarks.trim();
    if (remarksRequired(grievance.status, next) && !remarks) {
      setErrorMessage("Please write remarks before rejecting a grievance or sending it back for more work.");
      return;
    }
    runAction(
      `status:${next}`,
      () => adminService.updateGrievanceStatus(id, { status: next, ...(remarks ? { remarks } : {}) }),
      `Status changed to ${statusLabel(next)}.`,
      () => setStatusRemarks("")
    );
  }

  function changePriority() {
    runAction(
      "priority",
      () => adminService.updateGrievancePriority(id, {
        priority: priorityChoice,
        ...(priorityRemarks.trim() ? { remarks: priorityRemarks.trim() } : {}),
      }),
      `Priority changed to ${priorityChoice}.`,
      () => {
        setPriorityChoice("");
        setPriorityRemarks("");
      }
    );
  }

  function assignDepartment() {
    const isReassignment = Boolean(grievance.departmentId);
    if (!assignDepartmentId) {
      setErrorMessage("Select a department first.");
      return;
    }
    if (isReassignment && !assignRemarks.trim()) {
      setErrorMessage("A reason is required when reassigning a grievance.");
      return;
    }
    runAction(
      "assign",
      () => adminService.assignGrievance(id, {
        departmentId: assignDepartmentId,
        ...(assignRemarks.trim() ? { remarks: assignRemarks.trim() } : {}),
      }),
      isReassignment ? "Grievance reassigned." : "Grievance assigned.",
      () => {
        setAssignDepartmentId("");
        setAssignRemarks("");
      }
    );
  }

  const backButton = (
    <Button type="button" variant="secondary" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden="true" /> Back to grievances
    </Button>
  );

  if (loading) {
    return (
      <section className="admin-module" aria-busy="true">
        <div className="admin-panel"><p className="admin-empty" role="status">Loading grievance…</p></div>
      </section>
    );
  }

  if (!grievance) {
    return (
      <section className="admin-module">
        {errorMessage && <Alert title="Grievance unavailable">{errorMessage}</Alert>}
        <div className="admin-form-actions">{backButton}</div>
      </section>
    );
  }

  const currentDepartmentId = String(grievance.departmentId?._id || grievance.departmentId || "");
  const isReassignment = Boolean(currentDepartmentId);
  const canAssign = ASSIGNABLE_STATUSES.includes(grievance.status);
  const canChangePriority = PRIORITY_EDITABLE_STATUSES.includes(grievance.status);
  const departmentChoices = departments.filter(
    (department) => department.isActive !== false && String(department._id) !== currentDepartmentId
  );
  const selectedPriority = priorityChoice || grievance.priority;
  const location = [
    grievance.location?.address,
    grievance.location?.city,
    grievance.location?.state,
    grievance.location?.postalCode,
  ].filter(Boolean).join(", ");

  return (
    <section className="admin-module" aria-labelledby="admin-detail-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">{grievance.referenceNumber}</p>
          <h1 className="admin-module__title" id="admin-detail-title">{grievance.title}</h1>
          <div className="admin-detail__badges">
            <span className={`admin-status admin-status--${statusSlug(grievance.status)}`}>{statusLabel(grievance.status)}</span>
            <span className={`admin-priority admin-priority--${grievance.priority}`}>{grievance.priority} priority</span>
          </div>
        </div>
        {backButton}
      </header>

      {errorMessage && <Alert title="Grievance management">{errorMessage}</Alert>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-detail__grid">
        <div className="admin-detail__stack">
          <section className="admin-panel" aria-labelledby="admin-detail-info-title">
            <h2 id="admin-detail-info-title">Grievance information</h2>
            <dl className="admin-detail-list">
              <div><dt>Citizen</dt><dd>{grievance.citizenId?.name || "—"}{grievance.citizenId?.email ? ` (${grievance.citizenId.email})` : ""}</dd></div>
              <div><dt>Category</dt><dd>{grievance.category}</dd></div>
              <div><dt>Assigned department</dt><dd>{grievance.departmentId?.name || "Not assigned yet"}</dd></div>
              <div><dt>Citizen suggested</dt><dd>{grievance.requestedDepartmentId?.name || "No suggestion"}</dd></div>
              <div><dt>Location</dt><dd>{location || "Not provided"}</dd></div>
              <div><dt>Filed</dt><dd>{formatDate(grievance.createdAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(grievance.updatedAt)}</dd></div>
              {grievance.resolvedAt && <div><dt>Resolved</dt><dd>{formatDate(grievance.resolvedAt)}</dd></div>}
            </dl>
            <h2 className="admin-detail__subheading">Description</h2>
            <p className="admin-detail__description">{grievance.description}</p>
          </section>

          <AttachmentsPanel grievanceId={grievance._id} canUpload canDeleteAny currentUserId={user?.id} />

          <section className="admin-panel" aria-labelledby="admin-detail-history-title">
            <h2 id="admin-detail-history-title">History</h2>
            {history.length ? (
              <ol className="admin-timeline">
                {history.map((item) => (
                  <li key={item._id}>
                    <span className="admin-timeline__dot" aria-hidden="true" />
                    <div>
                      <strong>{historyTitle(item)}</strong>
                      <p>{item.details || `Status: ${statusLabel(item.oldStatus)} → ${statusLabel(item.newStatus)}`}</p>
                      {item.remarks && <p className="admin-timeline__remarks">Remarks: {item.remarks}</p>}
                      <small>{item.changedBy?.name || "Portal user"}{item.changedBy?.role ? ` (${item.changedBy.role})` : ""} · {formatDate(item.createdAt)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="admin-empty">No updates have been recorded yet.</p>}
          </section>
        </div>

        <div className="admin-detail__stack">
          <section className="admin-panel" aria-labelledby="admin-detail-status-title">
            <h2 id="admin-detail-status-title">Update status</h2>
            {allowedTransitions.length ? (
              <div className="admin-action-form">
                <label className="admin-textarea-field" htmlFor="status-remarks">
                  <span>Remarks</span>
                  <textarea id="status-remarks" rows={3} maxLength={500} value={statusRemarks}
                    onChange={(event) => setStatusRemarks(event.target.value)}
                    placeholder="Required to reject, or to send a resolved grievance back." />
                </label>
                <div className="admin-form-actions">
                  {allowedTransitions.map((next) => {
                    const { label, variant } = statusAction(grievance.status, next);
                    return (
                      <Button key={next} type="button" variant={variant} loading={busy === `status:${next}`}
                        loadingText="Saving…" disabled={Boolean(busy)} onClick={() => changeStatus(next)}>
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="admin-detail__hint">
                {grievance.status === "assigned" || grievance.status === "in_progress"
                  ? "The department manager moves this grievance forward from here, so there is nothing for the admin to change."
                  : `No status changes are possible for a ${statusLabel(grievance.status)} grievance.`}
              </p>
            )}
          </section>

          <section className="admin-panel" aria-labelledby="admin-detail-priority-title">
            <h2 id="admin-detail-priority-title">Priority</h2>
            {canChangePriority ? (
              <div className="admin-action-form">
                <label className="admin-native-field" htmlFor="priority-select">
                  <span>Priority level</span>
                  <select id="priority-select" value={selectedPriority} onChange={(event) => setPriorityChoice(event.target.value)}>
                    {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="admin-native-field" htmlFor="priority-remarks">
                  <span>Reason (optional)</span>
                  <input id="priority-remarks" value={priorityRemarks} maxLength={500}
                    onChange={(event) => setPriorityRemarks(event.target.value)} />
                </label>
                <div className="admin-form-actions">
                  <Button type="button" loading={busy === "priority"} loadingText="Saving…"
                    disabled={Boolean(busy) || selectedPriority === grievance.priority} onClick={changePriority}>
                    Update priority
                  </Button>
                </div>
                <p className="admin-detail__hint">Urgent grievances that are still open appear under Escalation Alerts on the overview.</p>
              </div>
            ) : (
              <p className="admin-detail__hint">Priority can no longer be changed on a {statusLabel(grievance.status)} grievance.</p>
            )}
          </section>

          <section className="admin-panel" aria-labelledby="admin-detail-assign-title">
            <h2 id="admin-detail-assign-title">{isReassignment ? "Reassign department" : "Assign department"}</h2>
            {canAssign ? (
              <div className="admin-action-form">
                <label className="admin-native-field" htmlFor="assign-department">
                  <span>Department</span>
                  <select id="assign-department" value={assignDepartmentId} onChange={(event) => setAssignDepartmentId(event.target.value)}>
                    <option value="">Select department</option>
                    {departmentChoices.map((department) => (
                      <option key={department._id} value={department._id}>{department.name}</option>
                    ))}
                  </select>
                </label>
                {isReassignment && (
                  <label className="admin-native-field" htmlFor="assign-remarks">
                    <span>Reason for reassigning</span>
                    <input id="assign-remarks" value={assignRemarks} maxLength={500}
                      onChange={(event) => setAssignRemarks(event.target.value)} />
                  </label>
                )}
                <div className="admin-form-actions">
                  <Button type="button" loading={busy === "assign"} loadingText="Saving…"
                    disabled={Boolean(busy) || !assignDepartmentId} onClick={assignDepartment}>
                    {isReassignment ? "Reassign" : "Assign"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="admin-detail__hint">A {statusLabel(grievance.status)} grievance can no longer be assigned to a department.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
