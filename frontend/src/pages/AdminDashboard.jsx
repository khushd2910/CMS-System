import PortalLayout from "../components/layout/PortalLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";

// TEMPORARY landing page so a successful admin login has somewhere to go.
// The real Admin Dashboard is a later module. It is wrapped in <ProtectedRoute roles={["admin"]}>.
export default function AdminDashboard() {
  const { user, logout } = useAuth();

  return (
    <PortalLayout title="Admin Dashboard" breadcrumb={[{ label: "Home", to: "/" }, { label: "Admin Dashboard" }]}>
      <section className="card" aria-labelledby="admin-dash-heading">
        <h1 className="card__title" id="admin-dash-heading">
          Welcome, {user?.name}
        </h1>
        <p className="card__subtitle">You are signed in as an administrator ({user?.email}).</p>
        <p className="card__subtitle">The admin dashboard will be added in a later module.</p>
        <div className="login-form__actions">
          <Button variant="secondary" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </section>
    </PortalLayout>
  );
}
