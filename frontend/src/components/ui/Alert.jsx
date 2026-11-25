import { CircleAlert } from "lucide-react";

// An error box. role="alert" makes screen readers announce it immediately.
export default function Alert({ title, children, id }) {
  return (
    <div className="alert" role="alert" id={id}>
      <CircleAlert className="alert__icon" size={22} aria-hidden="true" />
      <div>
        {title && <p className="alert__title">{title}</p>}
        <p className="alert__text">{children}</p>
      </div>
    </div>
  );
}
