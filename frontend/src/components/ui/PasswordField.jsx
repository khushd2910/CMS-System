import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import TextField from "./TextField";

// Password input with a Show / Hide toggle.
const PasswordField = forwardRef(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField ref={ref} {...props}>
      {({ id, ref: inputRef, describedBy, invalid, required, inputProps }) => (
        <div className="password-wrap">
          <input
            id={id}
            ref={inputRef}
            className="field__input field__input--with-action"
            type={visible ? "text" : "password"}
            aria-invalid={invalid ? "true" : undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            {...inputProps}
          />
          <button
            type="button"
            className="password-wrap__toggle"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </div>
      )}
    </TextField>
  );
});

export default PasswordField;
