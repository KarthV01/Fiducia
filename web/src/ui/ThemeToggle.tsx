import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "../lib/theme";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark");
  return <button type="button" role="switch" aria-label="Dark mode" aria-checked={theme === "dark"} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-rule bg-canvas p-1">
    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${theme === "light" ? "bg-accent-soft text-link" : "text-muted"}`}><Icon name="sun" width="14" height="14" /></span>
    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${theme === "dark" ? "bg-accent-soft text-link" : "text-muted"}`}><Icon name="moon" width="14" height="14" /></span>
  </button>;
}
