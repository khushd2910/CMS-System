import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { citizenService } from "../../services/citizenService";

const STATUSES = ["", "submitted", "under_review", "assigned", "in_progress", "resolved", "rejected", "closed"];
const statusClass = (status) => `citizen-status citizen-status--${String(status || "").replaceAll("_", "-")}`;
const statusLabel = (status) => String(status || "").replaceAll("_", " ");
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "—";

export default function CitizenGrievanceHistory() {
  const [query, setQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    citizenService.grievances({ page, limit: 20, search: appliedSearch, status })
      .then((data) => {
        if (!active) return;
        setResult(data);
        setErrorMessage("");
      })
      .catch((error) => {
        if (active) setErrorMessage(error.message || "Could not load your grievance history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [appliedSearch, page, status]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(query.trim());
  }

  const grievances = result?.grievances || [];
  const pagination = result?.pagination;

  return (
    <PortalLayout title="Grievance History" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Citizen Dashboard", to: "/citizen/dashboard" },
      { label: "Grievance History" },
    ]}>
      <section className="citizen-page" aria-labelledby="citizen-history-title">
        <header className="citizen-page__header">
          <div>
            <p className="citizen-eyebrow">Your submissions</p>
            <h1 id="citizen-history-title">Grievance History</h1>
            <p>Search and review the grievances you have filed.</p>
          </div>
          <Link className="citizen-primary-link" to="/citizen/grievances/new">File New Grievance</Link>
        </header>

        <form className="citizen-filter-bar" onSubmit={applyFilters}>
          <label className="citizen-filter-bar__search">
            <span>Search reference or title</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. GRV-20261127-ABC123" />
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              {STATUSES.map((value) => (
                <option key={value || "all"} value={value}>{value ? statusLabel(value) : "All statuses"}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={loading}>Search</Button>
        </form>

        {errorMessage && <Alert title="History unavailable">{errorMessage}</Alert>}
        {loading ? (
          <p className="citizen-empty" role="status">Loading your grievances…</p>
        ) : grievances.length ? (
          <>
            <div className="citizen-table-wrap citizen-history-table-wrap">
              <table className="citizen-table">
                <thead>
                  <tr><th>Reference</th><th>Grievance</th><th>Department</th><th>Filed</th><th>Last updated</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {grievances.map((grievance) => (
                    <tr key={grievance._id}>
                      <td><Link to={`/citizen/grievances/${grievance._id}`}>{grievance.referenceNumber}</Link></td>
                      <td>{grievance.title}</td>
                      <td>{grievance.departmentId?.name || "Awaiting assignment"}</td>
                      <td>{formatDate(grievance.createdAt)}</td>
                      <td>{formatDate(grievance.updatedAt)}</td>
                      <td><span className={statusClass(grievance.status)}>{statusLabel(grievance.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="citizen-pagination">
              <span>{pagination?.total || 0} grievance(s)</span>
              <div>
                <Button variant="secondary" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <span>Page {pagination?.page || page} of {Math.max(1, pagination?.totalPages || 1)}</span>
                <Button variant="secondary" type="button" disabled={page >= (pagination?.totalPages || 1) || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="citizen-empty citizen-empty--panel">
            <p>{appliedSearch || status ? "No grievances match these filters." : "You have not filed any grievances yet."}</p>
            {!appliedSearch && !status && <Link to="/citizen/grievances/new">File your first grievance</Link>}
          </div>
        )}
      </section>
    </PortalLayout>
  );
}
