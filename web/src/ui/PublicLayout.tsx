import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/api";
import { clearSession } from "../lib/session";
import { Banner, Button } from "./primitives";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./BrandMark";

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
    <header className="sticky top-0 z-30 border-b border-rule bg-canvas/85 backdrop-blur-md"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
      <Link to={signedIn ? "/accounts" : "/"} aria-label="Fiducia home" className="rounded-lg"><BrandMark size="sm" withName /></Link>
      <nav aria-label="Main navigation" className="ml-auto flex items-center gap-1 sm:gap-2">{signedIn ? <><Link className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink sm:inline-flex" to="/accounts">Your accounts</Link><Button variant="ghost" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</Button></> : <><a href="/#how-it-works" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink sm:inline-flex">How it works</a><Link to="/login" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.04]">Sign in</Link></>}</nav>
      <ThemeToggle />
    </div></header>
    {error ? <div className="mx-auto mt-4 w-full max-w-3xl px-5"><Banner>{error}</Banner></div> : null}
    <main className="flex-1">{children}</main>
    <footer className="border-t border-rule"><div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted sm:px-8"><span className="flex items-center gap-2.5"><BrandMark size="sm" /> Fiducia · The workspace for creator partnerships</span><span>© {new Date().getFullYear()} Fiducia</span></div></footer>
  </div>;
}
