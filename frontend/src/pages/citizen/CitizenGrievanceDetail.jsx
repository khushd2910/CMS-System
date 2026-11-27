import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import PortalLayout from "../../components/layout/PortalLayout";
import { citizenService } from "../../services/citizenService";

const formatDate = (value) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "—";
const statusLabel = (status) => String(status || "").replaceAll("_", " ");

export default function CitizenGrievanceDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    citizenService.grievance(id)
      .then((data) => {
        if (active) {
          setResult(data);
          setErrorMessage("");
        }
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "Could not load this grievance.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const grievance = result?.grievance;

  return (
    <PortalLayout title="Grievance Details" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Grievance History", to: "/citizen/grievances" },
      { label: "Details" },
    ]}>
      <section className="citizen-page citizen-detail" aria-labelledby="citizen-detail-title">
        <p className="citizen-eyebrow">Track your submission</p>
        <div className="citizen-detail__heading">
          <div>
            <h1 id="citizen-detail-title">{grievance?.title || "Grievance Details"}</h1>
            {grievance && <p>{grievance.referenceNumber} · Filed {formatDate(grievance.createdAt)}</p>}
          </div>
          {grievance && (
            <span className={`citizen-status citizen-status--${grievance.status.replaceAll("_", "-")}`}>
              {statusLabel(grievance.status)}
            </span>
          )}
        </div>
        {location.state?.created && grievance && (
          <p className="citizen-notice" role="status">
            Your grievance has been submitted. Save this reference number: <strong>{grievance.referenceNumber}</strong>
          </p>
        )}
        {errorMessage && <Alert title="Grievance unavailable">{errorMessage}</Alert>}
        {loading ? (
          <p className="citizen-empty" role="status">Loading grievance details…</p>
        ) : grievance ? (
          <>
            <div className="citizen-detail__grid">
              <section className="citizen-panel">
                <h2>Grievance information</h2>
                <dl className="citizen-detail-list">
                  <div><dt>Category</dt><dd>{grievance.category}</dd></div>
                  <div><dt>Department</dt><dd>{grievance.departmentId?.name || "Awaiting assignment"}</dd></div>
                  <div><dt>Location</dt><dd>{[
                    grievance.location?.address,
                    grievance.location?.city,
                    grievance.location?.state,
                    grievance.location?.postalCode,
                  ].filter(Boolean).join(", ") || "Not provided"}</dd></div>
                  <div><dt>Last updated</dt><dd>{formatDate(grievance.updatedAt)}</dd></div>
                </dl>
                <h3>Description</h3>
                <p className="citizen-detail__description">{grievance.description}</p>
              </section>
              <section className="citizen-panel" aria-labelledby="citizen-timeline-title">
                <h2 id="citizen-timeline-title">Status History</h2>
                {result.history?.length ? (
                  <ol className="citizen-timeline">
                    {result.history.map((item) => (
                      <li key={item._id}>
                        <span className="citizen-timeline__dot" aria-hidden="true" />
                        <div>
                          <strong>{item.action === "department_assigned"
                            ? "Department assignment updated"
                            : item.action === "priority_changed"
                              ? "Priority updated"
                              : statusLabel(item.newStatus)}</strong>
                          <p>{item.details || item.remarks || `Status: ${statusLabel(item.oldStatus)} → ${statusLabel(item.newStatus)}`}</p>
                          <small>{item.changedBy?.name || "Portal staff"} · {formatDate(item.createdAt)}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="citizen-empty">No status updates have been recorded yet.</p>}
              </section>
            </div>
            <div className="citizen-page__actions">
              <Link to="/citizen/grievances">Back to grievance history</Link>
              <Link to="/citizen/dashboard">Dashboard</Link>
            </div>
          </>
        ) : null}
      </section>
    </PortalLayout>
  );
}
