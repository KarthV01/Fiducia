import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/api";
import { clearSession } from "../lib/session";
import { Banner, Button } from "./primitives";
import { ThemeToggle } from "./ThemeToggle";

export function PublicLayout({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try { await api.logout(); clearSession(); navigate("/login", { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-screen flex-col bg-canvas text-ink">
    <header className="border-b border-rule"><div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
      <Link to={signedIn ? "/accounts" : "/"} aria-label="Payouts home" className="text-xl font-semibold tracking-[-0.05em]">payouts<span className="text-link">.</span></Link>
      <nav aria-label="Main navigation" className="ml-auto flex items-center gap-3 sm:gap-6">{signedIn ? <><Link className="hidden text-sm text-muted hover:text-ink sm:inline" to="/accounts">Your accounts</Link><Button variant="ghost" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</Button></> : <><a href="/#how-it-works" className="hidden text-sm text-muted hover:text-ink sm:block">How it works</a><Link to="/login" className="text-sm font-medium text-ink hover:text-link">Sign in</Link></>}</nav>
      <ThemeToggle />
    </div></header>
    {error ? <div className="mx-auto mt-4 w-full max-w-3xl px-5"><Banner>{error}</Banner></div> : null}
    <main className="flex-1">{children}</main>
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 border-t border-rule px-5 py-6 text-xs text-muted sm:px-8"><span>payouts · A workspace for creator partnerships.</span><span>© {new Date().getFullYear()} Payouts</span></footer>
  </div>;
}
