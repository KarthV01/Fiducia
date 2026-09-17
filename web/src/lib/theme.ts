export type Theme = "dark" | "light";
export const THEME_KEY = "fiducia.theme";
const THEME_EVENT = "fiducia:theme-changed";

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Still works when storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "light" ? "light" : "dark";
    notify();
  };
  window.addEventListener(THEME_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(THEME_EVENT, notify); window.removeEventListener("storage", onStorage); };
}
