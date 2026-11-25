import PortalHeader from "./PortalHeader";
import NavBar from "./NavBar";
import Breadcrumb from "./Breadcrumb";
import PortalFooter from "./PortalFooter";

// The shared page frame used by every page: header, navigation bar,
// breadcrumb, the page content, and the footer.
export default function PortalLayout({ title, breadcrumb, children }) {
  return (
    <div className="portal">
      <title>{`${title} | National Grievance Redressal Portal`}</title>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <PortalHeader />
      <NavBar />
      <div className="container">
        <Breadcrumb items={breadcrumb} />
      </div>
      <main id="main-content" className="portal__main" tabIndex={-1}>
        <div className="container">{children}</div>
      </main>
      <PortalFooter />
    </div>
  );
}
