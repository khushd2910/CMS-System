import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import PortalLayout from "../components/layout/PortalLayout";
import Alert from "../components/ui/Alert";
import AdminDepartments from "./admin/AdminDepartments";
import AdminGrievances from "./admin/AdminGrievances";
import AdminManagers from "./admin/AdminManagers";
import { useAuth } from "../context/AuthContext";
import { adminService } from "../services/adminService";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "grievances", label: "Grievances", icon: ClipboardList },
  { id: "departments", label: "Issue Departments", icon: Building2 },
  { id: "managers", label: "Department Managers", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

const NAV_ITEMS = [
  { key: "totalGrievances", label: "Total Grievances", icon: FileText, variant: "blue" },
  { key: "pendingGrievances", label: "Pending", icon: Clock3, variant: "gold" },
  { key: "inReviewGrievances", label: "In Review", icon: Activity, variant: "navy" },
  { key: "inProgressGrievances", label: "In Progress", icon: ClipboardList, variant: "teal" },
  { key: "resolvedGrievances", label: "Resolved", icon: CheckCircle2, variant: "green" },
  { key: "overdueGrievances", label: "Overdue", icon: AlertTriangle, variant: "red" },
];

const BREADCRUMB = [{ label: "Home", to: "/" }, { label: "Admin Dashboard" }];

function activityText(activity) {
  if (activity.details) return activity.details;
  if (activity.newStatus) return `Status changed to ${activity.newStatus.replaceAll("_", " ")}`;
  return activity.action?.replaceAll("_", " ") || "Grievance updated";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Overview({ summary, loading, onNavigate }) {
  const stats = summary?.stats;
  const departments = summary?.departmentSummary || [];
  const maxDepartmentCount = Math.max(1, ...departments.map((department) => department.grievanceCount || 0));
  const activity = summary?.recentActivity || [];
  const alerts = summary?.escalationAlerts || [];

  return (
    <>
      <div className="admin-welcome">
        <span className="admin-welcome__avatar" aria-hidden="true"><Users size={24} /></span>
        <div>
          <h1>Welcome back, Administrator.</h1>
          <p>Here is the current service delivery overview for {summary?.generatedAt
            ? new Date(summary.generatedAt).toLocaleDateString()
            : "today"}.</p>
        </div>
        {loading && <span className="admin-welcome__loading" role="status">Updating…</span>}
      </div>

      <section className="admin-metric-grid" aria-label="Grievance statistics">
        {NAV_ITEMS.map(({ key, label, icon: Icon, variant }) => (
          <article className={`admin-metric admin-metric--${variant}`} key={key}>
            <span className="admin-metric__icon"><Icon size={20} aria-hidden="true" /></span>
            <strong className="admin-metric__value">{stats?.[key] ?? "—"}</strong>
            <span className="admin-metric__label">{label}</span>
          </article>
        ))}
      </section>

      <section className="admin-people-summary" aria-label="Portal totals">
        <div><Users size={18} aria-hidden="true" /><strong>{stats?.citizens ?? "—"}</strong><span>Citizens</span></div>
        <div><Building2 size={18} aria-hidden="true" /><strong>{stats?.departments ?? "—"}</strong><span>Departments</span></div>
        <div><Users size={18} aria-hidden="true" /><strong>{stats?.managers ?? "—"}</strong><span>Department Managers</span></div>
        <div><Clock3 size={18} aria-hidden="true" /><span>Overdue means open for {summary?.overdueThresholdDays ?? 7}+ days</span></div>
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel admin-chart-panel" aria-labelledby="department-chart-title">
          <div className="admin-panel__heading">
            <div>
              <p className="admin-eyebrow">Workload</p>
              <h2 id="department-chart-title">Department-wise Grievance Summary</h2>
            </div>
            <button type="button" className="admin-text-button" onClick={() => onNavigate("departments")}>Manage departments</button>
          </div>
          {departments.length ? (
            <div className="admin-bar-chart" role="img" aria-label="Grievance totals by department">
              {departments.slice(0, 7).map((department) => {
                const count = department.grievanceCount || 0;
                return (
                  <div className="admin-bar-chart__item" key={department._id}>
                    <span className="admin-bar-chart__count">{count}</span>
                    <div className="admin-bar-chart__track">
                      <span style={{ height: `${Math.max(count ? 8 : 2, (count / maxDepartmentCount) * 100)}%` }} />
                    </div>
                    <span className="admin-bar-chart__label" title={department.name}>{department.name}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="admin-empty">No department data is available yet.</p>}
        </section>

        <section className="admin-panel admin-activity-panel" aria-labelledby="recent-activity-title">
          <div className="admin-panel__heading">
            <div>
              <p className="admin-eyebrow">Latest updates</p>
              <h2 id="recent-activity-title">Recent Grievance Activity</h2>
            </div>
            <button type="button" className="admin-text-button" onClick={() => onNavigate("grievances")}>View all</button>
          </div>
          {activity.length ? (
            <ul className="admin-activity-list">
              {activity.map((item) => (
                <li key={item._id}>
                  <span className="admin-activity-list__dot" aria-hidden="true" />
                  <div>
                    <strong>{item.grievanceId?.referenceNumber || "Grievance"}</strong>
                    <p>{activityText(item)}</p>
                    <span>{item.changedBy?.name || "Portal user"} · {formatDate(item.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="admin-empty">Activity will appear when grievances are updated.</p>}
        </section>
      </div>

      <div className="admin-overview-bottom">
        <section className={`admin-alert-strip ${alerts.length ? "admin-alert-strip--urgent" : ""}`} aria-live="polite">
          <AlertTriangle size={20} aria-hidden="true" />
          <p><strong>Escalation Alerts:</strong> {stats?.escalationAlerts ?? 0} urgent open grievance(s) require attention.</p>
          <button type="button" className="admin-text-button" onClick={() => onNavigate("grievances")}>Review queue</button>
        </section>
        <section className="admin-panel admin-quick-actions" aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title">Quick Actions</h2>
          <button type="button" onClick={() => onNavigate("grievances")}><ClipboardList size={18} /> View / assign grievances</button>
          <button type="button" onClick={() => onNavigate("departments")}><Building2 size={18} /> Manage departments</button>
          <button type="button" onClick={() => onNavigate("managers")}><Users size={18} /> Manage department managers</button>
          <button type="button" onClick={() => onNavigate("reports")}><BarChart3 size={18} /> View reports</button>
        </section>
        {alerts.length > 0 && (
          <section className="admin-panel admin-alert-list" aria-labelledby="urgent-list-title">
            <h2 id="urgent-list-title">Urgent open cases</h2>
            {alerts.map((item) => (
              <button type="button" key={item._id} onClick={() => onNavigate("grievances")}>
                <strong>{item.referenceNumber}</strong>
                <span>{item.title}</span>
                <small>{item.departmentId?.name || "Unassigned"} · {item.status.replaceAll("_", " ")}</small>
              </button>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

function Reports({ summary }) {
  const stats = summary?.stats || {};
  const rows = [
    ["Pending", stats.pendingGrievances],
    ["In review", stats.inReviewGrievances],
    ["In progress", stats.inProgressGrievances],
    ["Resolved / closed", stats.resolvedGrievances],
    ["Overdue", stats.overdueGrievances],
  ];
  return (
    <section className="admin-module" aria-labelledby="admin-reports-title">
      <header className="admin-module__header">
        <div>
          <p className="admin-eyebrow">Performance</p>
          <h1 className="admin-module__title" id="admin-reports-title">Portal Reports</h1>
          <p className="admin-module__subtitle">Live status totals and workload across active departments.</p>
        </div>
      </header>
      <div className="admin-reports-grid">
        <section className="admin-panel">
          <h2>Grievance status totals</h2>
          {rows.map(([label, count]) => (
            <div className="admin-report-row" key={label}>
              <span>{label}</span><strong>{count ?? "—"}</strong>
            </div>
          ))}
        </section>
        <section className="admin-panel">
          <h2>Department workload</h2>
          {(summary?.departmentSummary || []).map((department) => (
            <div className="admin-report-row" key={department._id}>
              <span>{department.name}</span><strong>{department.grievanceCount} grievances</strong>
            </div>
          ))}
          {!summary?.departmentSummary?.length && <p className="admin-empty">No departments are configured.</p>}
        </section>
      </div>
    </section>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await adminService.dashboard());
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <PortalLayout title="Admin Dashboard" breadcrumb={BREADCRUMB}>
      <div className="admin-dashboard">
        <aside className="admin-sidebar" aria-label="Administrator menu">
          <div className="admin-sidebar__identity">
            <span className="admin-sidebar__avatar" aria-hidden="true"><Users size={23} /></span>
            <div><strong>{user?.name || "Administrator"}</strong><span>System Administrator</span></div>
          </div>
          <nav className="admin-sidebar__nav" aria-label="Dashboard sections">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className={activeSection === id ? "is-active" : ""}
                aria-current={activeSection === id ? "page" : undefined} onClick={() => setActiveSection(id)}>
                <Icon size={18} aria-hidden="true" /> <span>{label}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="admin-sidebar__logout" onClick={logout}>
            <LogOut size={18} aria-hidden="true" /> Sign out
          </button>
        </aside>

        <main className="admin-dashboard__main">
          {errorMessage && <Alert title="Dashboard unavailable">{errorMessage}</Alert>}
          {activeSection === "overview" && (
            <Overview summary={summary} loading={loading} onNavigate={setActiveSection} />
          )}
          {activeSection === "grievances" && (
            <AdminGrievances
              departments={summary?.departmentSummary || []}
              onChanged={loadDashboard}
            />
          )}
          {activeSection === "departments" && <AdminDepartments />}
          {activeSection === "managers" && <AdminManagers />}
          {activeSection === "reports" && <Reports summary={summary} />}
          <div className="admin-dashboard__footer-note">National Grievance Redressal Portal · Administrative workspace</div>
        </main>
      </div>
    </PortalLayout>
  );
}
