// What the server accepts for an attachment (see backend/controller/attachment.controller.js).
// The server checks again; checking here just saves the person a slow upload that would be refused.

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_ON_NEW_GRIEVANCE = 5;

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns a message when the file cannot be uploaded, or "" when it is fine.
export function checkAttachmentFile(file) {
  if (!file) return "Choose a file first.";
  if (!ALLOWED_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG, WEBP and PDF files are allowed.`;
  if (file.size > MAX_BYTES) return `${file.name}: the file is larger than 10 MB.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return "";
}

export const typeLabel = (fileType) => (fileType === "application/pdf" ? "PDF" : fileType?.startsWith("image/") ? "Image" : "File");
