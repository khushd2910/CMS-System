import { useCallback, useState } from "react";
import { authService } from "../services/authService";
import { useCooldown, waitSentence } from "./useCooldown";

const COOLDOWN_SECONDS = 60;
const FALLBACK_LIMIT_SECONDS = 15 * 60; // the backend allows 5 requests per 15 minutes

const normalize = (value) => value.trim().toLowerCase();

// Shared by the sign-in page and the Verify Email page.
// state: "idle" | "sending" | "sent" | "limited" | "failed"
// message: the sentence to show under the button ("" while idle / sending).
// secondsLeftFor(email): seconds before this email may be sent a code again (0 = allowed now).
export function useResendCode() {
  const { secondsLeft, start } = useCooldown();
  const [cooldownEmail, setCooldownEmail] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  const send = useCallback(
    async (identifier) => {
      const email = normalize(identifier);
      setState("sending");
      setMessage("");
      try {
        await authService.resendVerification({ identifier: email });
        setCooldownEmail(email);
        start(COOLDOWN_SECONDS);
        setState("sent");
        setMessage(
          "If this account is waiting for verification, a new email code has been sent. It can take a minute to arrive; check your spam folder too."
        );
      } catch (error) {
        if (error.status === 429) {
          // The server refused because too many codes were already requested for this email.
          const wait = error.retryAfterSeconds || FALLBACK_LIMIT_SECONDS;
          setCooldownEmail(email);
          start(wait);
          setState("limited");
          setMessage(`Too many code requests for this email. Please try again in ${waitSentence(wait)}.`);
          return;
        }
        setState("failed");
        if (error.code === "TIMEOUT") setMessage("The server took too long to respond. Please try again.");
        else if (error.status === 0) setMessage("Could not reach the server. Check your connection and try again.");
        else setMessage("Could not send the email code. Please try again in a few minutes.");
      }
    },
    [start]
  );

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  const secondsLeftFor = (identifier) => (normalize(identifier) === cooldownEmail ? secondsLeft : 0);

  return { state, message, sending: state === "sending", send, reset, secondsLeftFor };
}
