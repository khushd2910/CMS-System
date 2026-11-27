const STORAGE_KEY = "adminOtpChallenge";

export function saveAdminOtpChallenge(challenge) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(challenge));
    return true;
  } catch {
    return false;
  }
}

export function readAdminOtpChallenge() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const challenge = JSON.parse(raw);
    if (typeof challenge?.challengeId !== "string" || !challenge.challengeId) {
      clearAdminOtpChallenge();
      return null;
    }
    return challenge;
  } catch {
    clearAdminOtpChallenge();
    return null;
  }
}

export function clearAdminOtpChallenge() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return false;
  }
  return true;
}
