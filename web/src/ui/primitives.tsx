import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-45";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent text-white shadow-card hover:border-accent-hover hover:bg-accent-hover",
  secondary: "border border-rule bg-surface text-ink shadow-card hover:bg-canvas",
  ghost: "border border-transparent bg-transparent text-muted hover:bg-ink/[0.05] hover:text-ink",
  danger: "border border-danger-rule bg-surface text-danger shadow-card hover:bg-danger-soft",
};

export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return `${buttonBase} ${buttonVariants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

const controlClass =
  "w-full rounded-lg border border-rule bg-surface text-sm text-ink shadow-card outline-none transition-[border-color,box-shadow] placeholder:text-muted/80 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-9 px-3 ${controlClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-9 px-2.5 ${controlClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`px-3 py-2.5 ${controlClass} ${className}`} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-rule bg-surface shadow-card ${className}`}>{children}</div>;
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const requiredMarkClass = "ml-0.5 text-danger";
const requiredControlClass =
  "[&_input]:border-danger [&_input]:focus:border-danger [&_textarea]:border-danger [&_textarea]:focus:border-danger [&_select]:border-danger [&_select]:focus:border-danger";

export function RequiredMark() {
  return (
    <span className={requiredMarkClass} aria-hidden="true">
      *
    </span>
  );
}

export function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const [showRequiredError, setShowRequiredError] = useState(false);
  const startedRef = useRef(false);

  return (
    <label
      className={`block ${showRequiredError ? requiredControlClass : ""}`}
      onInput={(event) => {
        if (!required) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
          return;
        }
        if (target.value.length > 0) {
          startedRef.current = true;
        }
        if (target.value.trim()) {
          setShowRequiredError(false);
        }
      }}
      onBlur={(event) => {
        if (!required) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
          return;
        }
        if (startedRef.current && !target.value.trim()) {
          setShowRequiredError(true);
        }
      }}
    >
      <span className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      {children}
      {showRequiredError ? <span className="mt-1.5 block text-xs text-danger">Required</span> : null}
      {hint && !showRequiredError ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Banner({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-danger-rule bg-danger-soft text-danger"
      : "border-accent-rule bg-accent-soft text-ink";

  return <div role={tone === "error" ? "alert" : undefined} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = /active|completed|accepted|approved|connected|verified/.test(status)
    ? "border-success-rule bg-success-soft text-success"
    : /pending|review|invited|draft_ready|awaiting/.test(status)
      ? "border-warning-rule bg-warning-soft text-warning"
      : /rejected|failed|cancel|expired|revoked|disputed/.test(status)
        ? "border-danger-rule bg-danger-soft text-danger"
        : "border-rule bg-canvas text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      <span className="inline-block first-letter:uppercase">{status.replaceAll("_", " ")}</span>
    </span>
  );
}

export function CopyText({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1 font-mono text-xs text-ink transition-colors hover:border-rule hover:bg-canvas"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span>{label ?? value}</span>
      <span className="font-sans text-muted">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-rule bg-surface/60 px-6 py-12 text-center text-sm text-muted">{children}</p>;
}
