import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "../lib/theme";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark");
  const isDark = theme === "dark";
  return <button type="button" role="switch" aria-label="Dark mode" aria-checked={isDark} title={`Switch to ${isDark ? "light" : "dark"} mode`} onClick={() => setTheme(isDark ? "light" : "dark")} className="relative inline-grid h-9 w-[5.5rem] shrink-0 grid-cols-2 items-center rounded-full border border-rule bg-canvas p-1">
    <span aria-hidden="true" className={`absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-accent-soft/70 transition-transform duration-200 ease-out ${isDark ? "translate-x-full" : "translate-x-0"}`} />
    <span className={`relative z-10 flex items-center justify-center ${!isDark ? "text-link" : "text-muted"}`}><Icon name="sun" width="14" height="14" /></span>
    <span className={`relative z-10 flex items-center justify-center ${isDark ? "text-link" : "text-muted"}`}><Icon name="moon" width="14" height="14" /></span>
  </button>;
}
