import { forwardRef } from "react";

// A labelled text input with an error message that screen readers announce
// together with the field (aria-describedby).
const TextField = forwardRef(function TextField(
  { id, label, required = false, hideLabel = false, error = "", hint = "", children, className = "", ...inputProps },
  ref
) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${error ? "field--invalid" : ""} ${className}`.trim()}>
      <label className={`field__label ${hideLabel ? "visually-hidden" : ""}`.trim()} htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {" "}*
          </span>
        )}
      </label>
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {/* "children" lets PasswordField wrap the input with its Show/Hide button */}
      {children ? (
        children({ id, ref, describedBy, invalid: Boolean(error), required, inputProps })
      ) : (
        <input
          id={id}
          ref={ref}
          className="field__input"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          {...inputProps}
        />
      )}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
});

export default TextField;
