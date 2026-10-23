export function BrandMark({ size = "md", withName = false }: { size?: "sm" | "md" | "lg"; withName?: boolean }) {
  const dimensions = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return <span className="inline-flex items-center gap-2.5" aria-label={withName ? "Fiducia" : undefined}>
    <span className={`inline-flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-[26%] bg-ink text-canvas shadow-card`} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-full w-full" fill="none">
        <path d="M10 8h12v3.5h-8.5v3h7v3.5h-7V24H10V8Z" fill="currentColor" />
        <rect x="19.5" y="20.5" width="3.5" height="3.5" rx="1" className="fill-accent" />
      </svg>
    </span>
    {withName ? <span className="text-[17px] font-semibold tracking-[-0.03em] text-ink">Fiducia</span> : null}
  </span>;
}
