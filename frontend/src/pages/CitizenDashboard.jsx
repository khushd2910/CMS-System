import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  History,
  Search,
  UserRound,
} from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { citizenService } from "../services/citizenService";

const BREADCRUMB = [{ label: "Home", to: "/citizen/dashboard" }, { label: "Citizen Dashboard" }];
const METRICS = [
  { key: "total", label: "Total Grievances", icon: FileText, color: "blue" },
  { key: "pending", label: "Pending", icon: Clock3, color: "red" },
  { key: "inProgress", label: "In Progress", icon: Search, color: "orange" },
  { key: "resolved", label: "Resolved", icon: CheckCircle2, color: "green" },
];
const QUICK_SERVICES = [
  { label: "File New Grievance", description: "Tell us about a civic issue", to: "/citizen/grievances/new", icon: FilePlus2 },
  { label: "Track Grievance", description: "Look up a reference number", to: "/citizen/track", icon: Search },
  { label: "View Grievance History", description: "Review all your submissions", to: "/citizen/grievances", icon: History },
  { label: "Update Profile", description: "Keep your details up to date", to: "/citizen/profile", icon: UserRound },
];

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
  : "—";

const statusClass = (status) => `citizen-status citizen-status--${String(status || "submitted").replaceAll("_", "-")}`;
const statusLabel = (status) => String(status || "submitted").replaceAll("_", " ");

function NotificationItem({ notification, onOpen }) {
  const grievance = notification.grievanceId;
  return (
    <li className={`citizen-notification ${notification.isRead ? "" : "citizen-notification--unread"}`}>
      <span className="citizen-notification__marker" aria-hidden="true" />
      <button type="button" className="citizen-notification__open" onClick={() => onOpen(notification)}>
        <span>{notification.message}</span>
        <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
        {grievance?.referenceNumber && <small>{grievance.referenceNumber}</small>}
      </button>
    </li>
  );
}

export default function CitizenDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await citizenService.dashboard());
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function openNotification(notification) {
    if (!notification.isRead) {
      try {
        await citizenService.markNotificationRead(notification._id);
        setDashboard((current) => current && ({
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
          recentNotifications: current.recentNotifications.map((item) =>
            item._id === notification._id ? { ...item, isRead: true } : item
          ),
        }));
      } catch (error) {
        setErrorMessage(error.message || "Could not update the notification.");
      }
    }
    if (notification.grievanceId?._id) navigate(`/citizen/grievances/${notification.grievanceId._id}`);
    else navigate("/citizen/notifications");
  }

  const grievances = dashboard?.recentGrievances || [];
  const notifications = dashboard?.recentNotifications || [];

  return (
    <PortalLayout title="Citizen Dashboard" breadcrumb={BREADCRUMB}>
      <div className="citizen-dashboard">
        {errorMessage && (
          <div className="citizen-dashboard__error" role="alert">
            <p>{errorMessage}</p>
            <button type="button" onClick={loadDashboard}>Try again</button>
          </div>
        )}

        <section className="citizen-welcome" aria-labelledby="citizen-welcome-title">
          <span className="citizen-welcome__avatar" aria-hidden="true"><UserRound size={27} /></span>
          <div className="citizen-welcome__text">
            <h1 id="citizen-welcome-title">Welcome back, {user?.name || "Citizen"}</h1>
            <p>Manage your grievances, track their progress and receive updates from government departments.</p>
          </div>
          <Link className="citizen-primary-link" to="/citizen/grievances/new">
            <FilePlus2 size={17} aria-hidden="true" /> File New Grievance
          </Link>
        </section>

        <section className="citizen-metrics" aria-label="Your grievance totals" aria-busy={loading}>
          {METRICS.map(({ key, label, icon: Icon, color }) => (
            <article className={`citizen-metric citizen-metric--${color}`} key={key}>
              <span className="citizen-metric__icon"><Icon size={20} aria-hidden="true" /></span>
              <strong>{loading && !dashboard ? "—" : dashboard?.stats?.[key] ?? 0}</strong>
              <span>{label}</span>
            </article>
          ))}
        </section>

        <div className="citizen-dashboard__columns">
          <section className="citizen-panel citizen-recent" aria-labelledby="recent-grievances-title">
            <div className="citizen-panel__heading">
              <div>
                <h2 id="recent-grievances-title">My Recent Grievances</h2>
                <p>Latest updates on the issues you have reported.</p>
              </div>
              <Link to="/citizen/grievances">View All Grievances <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            {loading && !dashboard ? (
              <p className="citizen-empty" role="status">Loading your grievances…</p>
            ) : grievances.length ? (
              <div className="citizen-table-wrap">
                <table className="citizen-table">
                  <thead>
                    <tr><th>Reference</th><th>Title</th><th>Department</th><th>Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {grievances.map((grievance) => (
                      <tr key={grievance._id}>
                        <td><Link to={`/citizen/grievances/${grievance._id}`}>{grievance.referenceNumber}</Link></td>
                        <td>{grievance.title}</td>
                        <td>{grievance.departmentId?.name || "Awaiting assignment"}</td>
                        <td>{formatDate(grievance.createdAt)}</td>
                        <td><span className={statusClass(grievance.status)}>{statusLabel(grievance.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="citizen-empty">
                <p>You have not filed a grievance yet.</p>
                <Link to="/citizen/grievances/new">File your first grievance</Link>
              </div>
            )}
          </section>

          <section className="citizen-panel citizen-recent-notifications" aria-labelledby="recent-notifications-title">
            <div className="citizen-panel__heading">
              <div>
                <h2 id="recent-notifications-title">Recent Notifications</h2>
                {dashboard?.unreadCount > 0 && <p>{dashboard.unreadCount} unread notification{dashboard.unreadCount === 1 ? "" : "s"}</p>}
              </div>
              <Link to="/citizen/notifications">View All Notifications <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            {loading && !dashboard ? (
              <p className="citizen-empty" role="status">Loading notifications…</p>
            ) : notifications.length ? (
              <ul className="citizen-notification-list">
                {notifications.map((notification) => (
                  <NotificationItem key={notification._id} notification={notification} onOpen={openNotification} />
                ))}
              </ul>
            ) : (
              <div className="citizen-empty"><Bell size={22} aria-hidden="true" /><p>No notifications yet.</p></div>
            )}
          </section>
        </div>

        <section className="citizen-quick-services" aria-labelledby="quick-services-title">
          <h2 id="quick-services-title">Quick Services</h2>
          <div className="citizen-quick-services__grid">
            {QUICK_SERVICES.map(({ label, description, to, icon: Icon }) => (
              <Link className="citizen-service-card" to={to} key={to}>
                <span className="citizen-service-card__icon"><Icon size={21} aria-hidden="true" /></span>
                <span className="citizen-service-card__copy"><strong>{label}</strong><small>{description}</small></span>
                <ArrowRight className="citizen-service-card__arrow" size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <div className="citizen-dashboard__signout">
          <span>Signed in as {user?.email}</span>
          <Button variant="secondary" onClick={logout}>Sign out</Button>
        </div>
      </div>
    </PortalLayout>
  );
}
