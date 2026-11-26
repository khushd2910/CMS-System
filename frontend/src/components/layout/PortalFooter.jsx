import { Link } from "react-router-dom";

const FOOTER_LINKS = [
  { to: "/about", label: "About Portal" },
  { to: "/services", label: "Quick Links" },
  { to: "/policies", label: "Policies" },
  { to: "/contact", label: "Contact Us" },
];

export default function PortalFooter() {
  return (
    <footer className="portal-footer">
      <div className="container">
        <ul className="portal-footer__links">
          {FOOTER_LINKS.map((link) => (
            <li key={link.label}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
        <p className="portal-footer__legal">
          © {new Date().getFullYear()} Grievance Redressal Portal. For help, call the helpline: 1947.
        </p>
      </div>
    </footer>
  );
}
