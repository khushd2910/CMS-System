import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/services", label: "Services" },
  { to: "/contact", label: "Contact Us" },
];

export default function NavBar() {
  return (
    <nav className="nav-bar" aria-label="Main">
      <ul className="container nav-bar__list">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className="nav-bar__link">
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
