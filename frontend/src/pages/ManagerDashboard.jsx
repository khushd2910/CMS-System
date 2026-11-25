import PortalLayout from "../components/layout/PortalLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";

// TEMPORARY landing page so a successful manager login has somewhere to go.
// The real Department Manager dashboard is a later module. It is wrapped in <ProtectedRoute roles={["manager"]}>.
// A manager only ever sees grievances of their own department; the backend enforces that on every request.
export default function ManagerDashboard() {
  const { user, logout } = useAuth();

  return (
    <PortalLayout title="Department Manager Dashboard" breadcrumb={[{ label: "Home", to: "/" }, { label: "Manager Dashboard" }]}>
      <section className="card" aria-labelledby="manager-dash-heading">
        <h1 className="card__title" id="manager-dash-heading">
          Welcome, {user?.name}
        </h1>
        <p className="card__subtitle">You are signed in as a department manager ({user?.email}).</p>
        <p className="card__subtitle">The department manager dashboard will be added in a later module.</p>
        <div className="login-form__actions">
          <Button variant="secondary" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </section>
    </PortalLayout>
  );
}
