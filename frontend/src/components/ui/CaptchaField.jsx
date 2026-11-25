import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { authService } from "../../services/authService";

// Loads a CAPTCHA from the backend (GET /api/auth/captcha) and lets the page refresh it.
// Returns { captcha: {id, image} | null, loading, loadError, refresh }.
export function useCaptcha() {
  const [captcha, setCaptcha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await authService.captcha();
      setCaptcha({ id: data.id, image: data.image });
    } catch {
      setCaptcha(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { captcha, loading, loadError, refresh };
}

// Layout from the wireframe: image | refresh button | answer box.
export default function CaptchaField({ captcha, loading, loadError, onRefresh, inputId, value, onChange, error, readOnly, inputRef }) {
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={`captcha ${error ? "field--invalid" : ""}`}>
      <div className="captcha__row">
        <div className="captcha__image" aria-live="polite">
          {captcha ? (
            <img src={captcha.image} alt="CAPTCHA image. Type the characters shown." width="150" height="56" />
          ) : (
            <span className="captcha__placeholder">{loading ? "Loading…" : "Unavailable"}</span>
          )}
        </div>
        <button
          type="button"
          className="captcha__refresh"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Get a new CAPTCHA"
          title="Get a new CAPTCHA"
        >
          <RefreshCw size={22} aria-hidden="true" className={loading ? "captcha__spin" : undefined} />
        </button>
        <div className="captcha__answer">
          <label className="visually-hidden" htmlFor={inputId}>
            Enter CAPTCHA
          </label>
          <input
            id={inputId}
            ref={inputRef}
            name="captchaAnswer"
            className="field__input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            placeholder="Enter CAPTCHA"
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            aria-required="true"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={errorId}
          />
        </div>
      </div>
      {loadError && (
        <p className="field__error" role="alert">
          The CAPTCHA could not be loaded. Use the refresh button to try again.
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
