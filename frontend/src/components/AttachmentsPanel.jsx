import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from "lucide-react";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { attachmentService } from "../services/attachmentService";
import { ACCEPT_ATTRIBUTE, checkAttachmentFile, formatFileSize, typeLabel } from "../utils/attachmentRules";

const formatDate = (value) => (value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

// Lists the files attached to a grievance and lets the person add or remove them.
//  - canUpload:       show the "add a file" form.
//  - canDeleteAny:    true for admins (they may delete any file). Everyone else can only delete their own.
//  - currentUserId:   used to decide which files are "their own".
// The BACKEND decides who may really see, add or delete files; these props only decide which buttons to show.
export default function AttachmentsPanel({ grievanceId, canUpload = false, canDeleteAny = false, currentUserId }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await attachmentService.list(grievanceId);
      setAttachments(result.attachments || []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Could not load attachments.");
    } finally {
      setLoading(false);
    }
  }, [grievanceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  function chooseFile(event) {
    const chosen = event.target.files?.[0] || null;
    setNotice("");
    const problem = chosen ? checkAttachmentFile(chosen) : "";
    if (problem) {
      setErrorMessage(problem);
      setFile(null);
      event.target.value = "";
      return;
    }
    setErrorMessage("");
    setFile(chosen);
  }

  async function upload() {
    const problem = checkAttachmentFile(file);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setUploading(true);
    setErrorMessage("");
    setNotice("");
    try {
      await attachmentService.upload(grievanceId, file);
      setNotice(`${file.name} was uploaded.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = ""; // clear the file box
      await load();
    } catch (error) {
      setErrorMessage(error.message || "The file could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(attachment) {
    if (!window.confirm(`Delete "${attachment.fileName}"? This cannot be undone.`)) return;
    setDeletingId(attachment._id);
    setErrorMessage("");
    setNotice("");
    try {
      await attachmentService.remove(attachment._id);
      setNotice(`${attachment.fileName} was deleted.`);
      await load();
    } catch (error) {
      setErrorMessage(error.message || "The file could not be deleted.");
    } finally {
      setDeletingId("");
    }
  }

  const canDelete = (attachment) =>
    canDeleteAny || (currentUserId && String(attachment.uploadedBy?._id) === String(currentUserId));

  return (
    <section className="attachments" aria-labelledby={`attachments-title-${grievanceId}`}>
      <h2 id={`attachments-title-${grievanceId}`}><Paperclip size={17} aria-hidden="true" /> Attachments</h2>
      {errorMessage && <Alert title="Attachments">{errorMessage}</Alert>}
      {notice && <p className="attachments__notice" role="status">{notice}</p>}

      {loading ? (
        <p className="attachments__empty" role="status">Loading attachments…</p>
      ) : attachments.length ? (
        <ul className="attachments__list">
          {attachments.map((attachment) => {
            const Icon = attachment.fileType?.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li key={attachment._id}>
                <Icon size={20} aria-hidden="true" className="attachments__icon" />
                <div className="attachments__info">
                  <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer">{attachment.fileName}</a>
                  <small>
                    {typeLabel(attachment.fileType)} · {attachment.uploadedBy?.name || "Portal user"}
                    {attachment.uploadedBy?.role ? ` (${attachment.uploadedBy.role})` : ""} · {formatDate(attachment.uploadedAt)}
                  </small>
                </div>
                {canDelete(attachment) && (
                  <button type="button" className="attachments__delete" onClick={() => remove(attachment)}
                    disabled={deletingId === attachment._id} aria-label={`Delete ${attachment.fileName}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="attachments__empty">No files have been attached yet.</p>
      )}

      {canUpload && (
        <div className="attachments__upload">
          <label htmlFor={`attachment-file-${grievanceId}`}>Add a photo or PDF</label>
          <input id={`attachment-file-${grievanceId}`} ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} onChange={chooseFile} disabled={uploading} />
          <small>JPG, PNG, WEBP or PDF, up to 10 MB.</small>
          <Button type="button" variant="secondary" loading={uploading} loadingText="Uploading…" disabled={!file} onClick={upload}>
            Upload file
          </Button>
        </div>
      )}
    </section>
  );
}
