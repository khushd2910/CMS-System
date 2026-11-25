import { Link } from "react-router-dom";
import PortalLayout from "../components/layout/PortalLayout";

// Stand-in for pages that belong to later modules (register, forgot password...).
// It keeps every link on the login page working without building those modules yet.
export default function ComingSoon({ title }) {
  return (
    <PortalLayout title={title} breadcrumb={[{ label: "Home", to: "/" }, { label: title }]}>
      <section className="card" aria-labelledby="soon-heading">
        <h1 className="card__title" id="soon-heading">
          {title}
        </h1>
        <p className="card__subtitle">This page is not available yet. It will be added in a later module.</p>
        <p>
          <Link className="link" to="/login">
            Back to Citizen Login
          </Link>
        </p>
      </section>
    </PortalLayout>
  );
}
