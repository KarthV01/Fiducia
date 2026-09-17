const KEY = "fiducia.session";

export type Session =
  | { role: "sponsor"; id: string }
  | { role: "creator"; id: string };

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Session;
    if ((parsed.role === "sponsor" || parsed.role === "creator") && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
