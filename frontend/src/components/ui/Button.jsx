import { LoaderCircle } from "lucide-react";

// variant: "primary" (filled navy) or "secondary" (navy outline).
// While loading we use aria-disabled instead of "disabled" so keyboard focus
// is not lost in the middle of a submit.
export default function Button({
  variant = "primary",
  loading = false,
  loadingText,
  disabled = false,
  children,
  className = "",
  onClick,
  ...rest
}) {
  const blocked = loading || disabled;
  return (
    <button
      className={`btn btn--${variant} ${className}`.trim()}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {loading && <LoaderCircle className="btn__spinner" size={18} aria-hidden="true" />}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}
