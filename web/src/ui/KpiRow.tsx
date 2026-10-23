import { formatUsdc } from "../lib/money";

export type Kpi = {
  label: string;
  value: string;
  money?: boolean;
};

export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule shadow-card sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-5 py-4">
          <div className="text-[13px] font-medium text-muted">{item.label}</div>
          <div className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.03em] text-ink tabular-nums">
            {item.money ? formatUsdc(item.value) : item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
