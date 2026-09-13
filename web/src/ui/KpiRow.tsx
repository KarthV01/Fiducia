import { formatUsdc } from "../lib/money";

export type Kpi = {
  label: string;
  value: string;
  money?: boolean;
};

export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-rule bg-surface px-5 py-5"
        >
          <div className="text-xs text-muted">{item.label}</div>
          <div className="mt-3 text-[28px] font-medium tracking-[-0.04em] text-ink tabular-nums">
            {item.money ? formatUsdc(item.value) : item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
