import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "../lib/theme";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");
  const isDark = theme === "dark";
  return <button type="button" role="switch" aria-label="Dark mode" aria-checked={isDark} title={`Switch to ${isDark ? "light" : "dark"} mode`} onClick={() => setTheme(isDark ? "light" : "dark")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rule bg-surface text-muted shadow-card transition-colors hover:bg-canvas hover:text-ink">
    <Icon name={isDark ? "moon" : "sun"} width="16" height="16" />
  </button>;
}
