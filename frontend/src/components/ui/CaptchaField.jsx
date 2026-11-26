import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { authService } from "../../services/authService";

// One request at a time. In development React runs every effect twice on purpose (StrictMode); both
// runs share this single request, so the page asks the server for ONE CAPTCHA, not two.
let pendingRequest = null;
function requestCaptcha() {
  if (!pendingRequest) {
    pendingRequest = authService.captcha().finally(() => {
      pendingRequest = null;
    });
  }
  return pendingRequest;
}

// Loads a CAPTCHA from the backend (GET /api/auth/captcha) and lets the page refresh it.
// Returns { captcha: {id, image} | null, loading, loadError, refresh }.
export function useCaptcha() {
  const [captcha, setCaptcha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const thisRequest = (latestRequest.current += 1);
    setLoading(true);
    setLoadError(false);
    // A CAPTCHA works only once, so the old one is dropped at once: it can never be submitted again
    // while the new one is on its way.
    setCaptcha(null);
    try {
      const data = await requestCaptcha();
      if (thisRequest === latestRequest.current) setCaptcha({ id: data.id, image: data.image });
    } catch {
      if (thisRequest === latestRequest.current) setLoadError(true);
    } finally {
      if (thisRequest === latestRequest.current) setLoading(false);
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
