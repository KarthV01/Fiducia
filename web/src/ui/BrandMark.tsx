export function BrandMark({ size = "md", withName = false }: { size?: "sm" | "md" | "lg"; withName?: boolean }) {
  const dimensions = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return <span className="inline-flex items-center gap-3" aria-label={withName ? "Fiducia" : undefined}>
    <span className={`inline-flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-accent text-white shadow-sm`} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-full w-full" fill="none">
        <path d="M10 7.5h13v4H14.5v3.4h7.2v3.8h-7.2v6H10V7.5Z" fill="currentColor" />
        <path d="M23 7.5h-4.2l4.2 4.2V7.5Z" fill="white" fillOpacity=".42" />
      </svg>
    </span>
    {withName ? <span className="text-lg font-semibold tracking-[-0.04em] text-ink">Fiducia</span> : null}
  </span>;
}
