import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import PortalLayout from "../../components/layout/PortalLayout";
import { citizenService } from "../../services/citizenService";

const formatDate = (value) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "—";

export default function CitizenNotifications() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await citizenService.notifications({ page, limit: 20 }));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  async function markAllRead() {
    setUpdating(true);
    setErrorMessage("");
    try {
      await citizenService.markAllNotificationsRead();
      await loadNotifications();
    } catch (error) {
      setErrorMessage(error.message || "Could not mark notifications as read.");
    } finally {
      setUpdating(false);
    }
  }

  async function openNotification(notification) {
    if (!notification.isRead) {
      try {
        await citizenService.markNotificationRead(notification._id);
      } catch (error) {
        setErrorMessage(error.message || "Could not update this notification.");
        return;
      }
    }
    if (notification.grievanceId?._id) navigate(`/citizen/grievances/${notification.grievanceId._id}`);
  }

  const notifications = result?.notifications || [];
  const pagination = result?.pagination;

  return (
    <PortalLayout title="Notifications" breadcrumb={[
      { label: "Home", to: "/citizen/dashboard" },
      { label: "Citizen Dashboard", to: "/citizen/dashboard" },
      { label: "Notifications" },
    ]}>
      <section className="citizen-page" aria-labelledby="citizen-notifications-title">
        <header className="citizen-page__header">
          <div>
            <p className="citizen-eyebrow">Updates and reminders</p>
            <h1 id="citizen-notifications-title">Notifications</h1>
            <p>{result?.unreadCount || 0} unread notification{result?.unreadCount === 1 ? "" : "s"}.</p>
          </div>
          <Button type="button" variant="secondary" disabled={!result?.unreadCount || updating} loading={updating} onClick={markAllRead}>
            Mark all as read
          </Button>
        </header>
        {errorMessage && <Alert title="Notifications">{errorMessage}</Alert>}
        {loading ? (
          <p className="citizen-empty" role="status">Loading notifications…</p>
        ) : notifications.length ? (
          <>
            <ul className="citizen-notifications-page">
              {notifications.map((notification) => (
                <li className={notification.isRead ? "" : "is-unread"} key={notification._id}>
                  <span className="citizen-notifications-page__dot" aria-hidden="true" />
                  <div>
                    <p>{notification.message}</p>
                    <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
                    {notification.grievanceId?.referenceNumber && (
                      <small>{notification.grievanceId.referenceNumber} · {notification.grievanceId.title}</small>
                    )}
                  </div>
                  {notification.grievanceId?._id ? (
                    <button type="button" className="citizen-inline-link" onClick={() => openNotification(notification)}>View grievance</button>
                  ) : !notification.isRead ? (
                    <button type="button" className="citizen-inline-link" onClick={() => citizenService.markNotificationRead(notification._id).then(loadNotifications).catch((error) => setErrorMessage(error.message))}>
                      Mark as read
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="citizen-pagination">
              <span>{pagination?.total || 0} notification(s)</span>
              <div>
                <Button type="button" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <span>Page {pagination?.page || page} of {Math.max(1, pagination?.totalPages || 1)}</span>
                <Button type="button" variant="secondary" disabled={page >= (pagination?.totalPages || 1) || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="citizen-empty citizen-empty--panel">
            <p>You do not have any notifications yet.</p>
            <Link to="/citizen/dashboard">Return to your dashboard</Link>
          </div>
        )}
      </section>
    </PortalLayout>
  );
}
