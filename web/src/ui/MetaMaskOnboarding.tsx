import { Button } from "./primitives";
import { Icon } from "./Icon";

export function MetaMaskOnboarding({ open, onClose, onRetry }: { open: boolean; onClose: () => void; onRetry: () => void }) {
  if (!open) return null;
  return <div role="presentation" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="metamask-title" className="w-full max-w-md rounded-2xl border border-rule bg-surface p-6 shadow-floating">
      <div className="flex items-start justify-between gap-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-link"><Icon name="wallet" width="23" height="23" /></span><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-accent-soft hover:text-ink"><Icon name="close" /></button></div>
      <h2 id="metamask-title" className="mt-5 text-xl font-semibold tracking-[-0.03em]">Set up MetaMask first</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">Fiducia cannot create your wallet or access its recovery phrase. Install MetaMask from its official site, create or import a wallet there, then return to verify ownership with a gasless signature.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">Open official MetaMask</a><Button variant="secondary" className="h-10" onClick={onRetry}>I installed it - retry</Button></div>
      <p className="mt-4 text-xs text-muted">Never enter a recovery phrase or private key into Fiducia.</p>
    </div>
  </div>;
}
