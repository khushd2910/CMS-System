import { useCallback, useEffect, useState } from "react";

// Counts down once per second after start(seconds). Used to keep "send / resend" buttons
// from being pressed again and again.
export function useCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback((seconds) => setSecondsLeft(Math.max(0, Math.ceil(seconds))), []);
  return { secondsLeft, start };
}

// Short label for a button: "42s", "3 min".
export function formatWait(seconds) {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`;
}

// Sentence form: "less than a minute", "about 14 minutes".
export function waitSentence(seconds) {
  if (!seconds || seconds <= 0) return "a few minutes";
  if (seconds < 60) return "less than a minute";
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
