import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { citizenService } from "../../services/citizenService";

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "—";

export default function CitizenTrackGrievance() {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [grievance, setGrievance] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const reference = referenceNumber.trim().toUpperCase();
    if (!reference) {
      setErrorMessage("Enter the grievance reference number.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    setGrievance(null);
    setSearched(true);
    try {
      const result = await citizenService.grievances({ search: reference, limit: 100 });
      setGrievance(result.grievances.find((item) => item.referenceNumber.toUpperCase() === reference) || null);
    } catch (error) {
      setErrorMessage(error.message || "Could not search for that grievance.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalLayout title="Track Grievance" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Citizen Dashboard", to: "/citizen/dashboard" },
      { label: "Track Grievance" },
    ]}>
      <section className="citizen-page citizen-track" aria-labelledby="citizen-track-title">
        <header className="citizen-page__header">
          <div>
            <p className="citizen-eyebrow">Status lookup</p>
            <h1 id="citizen-track-title">Track Grievance</h1>
            <p>Enter the reference number from your confirmation to see the latest status.</p>
          </div>
        </header>
        <form className="citizen-track__form" onSubmit={handleSubmit}>
          <label className="citizen-filter-bar__search">
            <span>Grievance reference number</span>
            <input
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
              placeholder="e.g. GRV-20261127-ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              required
            />
          </label>
          <Button type="submit" loading={loading} loadingText="Searching…"><Search size={17} /> Track</Button>
        </form>
        <p className="citizen-form__privacy">For privacy, you can only look up grievances filed from your account.</p>
        {errorMessage && <Alert title="Unable to track grievance">{errorMessage}</Alert>}
        {searched && !loading && !errorMessage && !grievance && (
          <div className="citizen-empty citizen-empty--panel" role="status">
            No grievance with that reference number was found in your account. Check the number and try again.
          </div>
        )}
        {grievance && (
          <article className="citizen-track-result">
            <div>
              <span className="citizen-track-result__reference">{grievance.referenceNumber}</span>
              <h2>{grievance.title}</h2>
              <p>{grievance.departmentId?.name || "Awaiting department assignment"} · Filed {formatDate(grievance.createdAt)}</p>
            </div>
            <span className={`citizen-status citizen-status--${grievance.status.replaceAll("_", "-")}`}>
              {grievance.status.replaceAll("_", " ")}
            </span>
            <Link to={`/citizen/grievances/${grievance._id}`}>View details and history</Link>
          </article>
        )}
      </section>
    </PortalLayout>
  );
}
