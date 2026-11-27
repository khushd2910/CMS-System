import { request } from "./apiClient";

const UPLOAD_TIMEOUT_MS = 60000; // a 10 MB file needs longer than a normal request

export const attachmentService = {
  list: (grievanceId) =>
    request(`/grievances/${encodeURIComponent(grievanceId)}/attachments?limit=100`, { auth: true }),
  // The server reads the file from a form field named "file".
  upload: (grievanceId, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/grievances/${encodeURIComponent(grievanceId)}/attachments`, {
      method: "POST",
      auth: true,
      body: form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },
  remove: (attachmentId) =>
    request(`/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE", auth: true }),
};
