import PortalLayout from "../components/layout/PortalLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";

// TEMPORARY landing page so a successful login has somewhere to go.
// The real Citizen Dashboard is a later module.
export default function CitizenDashboard() {
  const { user, logout } = useAuth();

  return (
    <PortalLayout title="Citizen Dashboard" breadcrumb={[{ label: "Home", to: "/" }, { label: "Citizen Dashboard" }]}>
      <section className="card" aria-labelledby="dash-heading">
        <h1 className="card__title" id="dash-heading">
          Welcome, {user?.name}
        </h1>
        <p className="card__subtitle">You are signed in as {user?.email}.</p>
        <p className="card__subtitle">The citizen dashboard will be added in a later module.</p>
        <div className="login-form__actions">
          <Button variant="secondary" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </section>
    </PortalLayout>
  );
}
