import { Link, useLocation } from "react-router-dom";
import { CircleUserRound } from "lucide-react";
import PortalEmblem from "./PortalEmblem";

// The badge on the right names the part of the portal you are in. Citizen pages are the default.
const PORTALS = [
  { prefix: "/admin", label: "Admin Portal" },
  { prefix: "/manager", label: "Manager Portal" },
];

export default function PortalHeader() {
  const { pathname } = useLocation();
  const portalLabel =
    PORTALS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.label ?? "Citizen Portal";

  return (
    <header className="portal-header">
      <div className="container portal-header__inner">
        <Link to="/" className="portal-header__brand" aria-label="Grievance Redressal Portal, home">
          <span className="portal-header__emblem">
            <PortalEmblem size={36} />
          </span>
          <span className="portal-header__title">Grievance Redressal Portal</span>
        </Link>

        <div className="portal-header__meta">
          <a className="portal-header__helpline" href="tel:1947">
            Helpline : 1947
          </a>
          <span className="portal-header__divider" aria-hidden="true" />
          <span className="portal-header__badge">
            <span className="portal-header__badge-icon">
              <CircleUserRound size={22} aria-hidden="true" />
            </span>
            {portalLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
