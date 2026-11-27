import { request } from "./apiClient";

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

export const citizenService = {
  dashboard: () => request("/grievances/dashboard", { auth: true }),
  grievances: (params) => request(`/grievances${queryString(params)}`, { auth: true }),
  grievance: (id) => request(`/grievances/${encodeURIComponent(id)}`, { auth: true }),
  createGrievance: (payload) => request("/grievances", { method: "POST", auth: true, body: payload }),
  departments: () => request("/departments?active=true&limit=100"),
  notifications: (params) => request(`/notifications${queryString(params)}`, { auth: true }),
  markNotificationRead: (id) =>
    request(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH", auth: true }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST", auth: true }),
};
