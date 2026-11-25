import { Link } from "react-router-dom";
import { CircleUserRound } from "lucide-react";
import PortalEmblem from "./PortalEmblem";

export default function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="container portal-header__inner">
        <Link to="/" className="portal-header__brand" aria-label="National Grievance Redressal Portal, home">
          <span className="portal-header__emblem">
            <PortalEmblem size={36} />
          </span>
          <span className="portal-header__title">National Grievance Redressal Portal</span>
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
            Citizen Portal
          </span>
        </div>
      </div>
    </header>
  );
}
