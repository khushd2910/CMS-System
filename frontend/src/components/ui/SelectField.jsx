import { forwardRef } from "react";

// A labelled dropdown that follows the same label / error pattern as TextField.
const SelectField = forwardRef(function SelectField(
  { id, label, required = false, error = "", options, placeholder, className = "", ...selectProps },
  ref
) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`field ${error ? "field--invalid" : ""} ${className}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {" "}*
          </span>
        )}
      </label>
      <select
        id={id}
        ref={ref}
        className="field__input field__select"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId}
        aria-required={required || undefined}
        {...selectProps}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const { value, text } = typeof option === "string" ? { value: option, text: option } : option;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
});

export default SelectField;
