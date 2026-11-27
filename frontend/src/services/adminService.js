import { request } from "./apiClient";

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

export const adminService = {
  dashboard: () => request("/admin/dashboard", { auth: true }),
  departments: (params) => request(`/admin/departments${queryString(params)}`, { auth: true }),
  createDepartment: (payload) => request("/departments", { method: "POST", auth: true, body: payload }),
  updateDepartment: (id, payload) =>
    request(`/departments/${encodeURIComponent(id)}`, { method: "PATCH", auth: true, body: payload }),
  managers: (params) => request(`/admin/managers${queryString(params)}`, { auth: true }),
  createManager: (payload) => request("/admin/managers", { method: "POST", auth: true, body: payload }),
  updateManager: (id, payload) =>
    request(`/admin/managers/${encodeURIComponent(id)}`, { method: "PATCH", auth: true, body: payload }),
  grievances: (params) => request(`/grievances${queryString(params)}`, { auth: true }),
  assignGrievance: (id, payload) =>
    request(`/grievances/${encodeURIComponent(id)}/assign-department`, {
      method: "PATCH",
      auth: true,
      body: payload,
    }),
};
