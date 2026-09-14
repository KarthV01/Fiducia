import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "border border-white/10 bg-accent text-white shadow-sm hover:bg-accent-hover disabled:opacity-40",
    secondary: "border border-rule bg-surface text-ink hover:border-muted/50 hover:bg-accent-soft disabled:opacity-40",
    ghost: "border border-transparent bg-transparent text-muted hover:bg-accent-soft hover:text-ink disabled:opacity-40",
  }[variant];

  return (
    <button
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: "primary" | "secondary";
  className?: string;
  children: ReactNode;
}) {
  const styles = {
    primary: "border border-white/10 bg-accent text-white shadow-sm hover:bg-accent-hover",
    secondary: "border border-rule bg-surface text-ink hover:border-muted/50 hover:bg-accent-soft",
  }[variant];

  return (
    <Link
      to={to}
      className={`inline-flex h-9 items-center justify-center rounded-[6px] px-3.5 text-sm font-medium transition-colors ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-rule bg-canvas/50 px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-link ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 w-full rounded-lg border border-rule bg-surface px-3 text-sm text-ink outline-none focus:border-link ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-rule bg-canvas/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-link ${className}`}
      {...props}
    />
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
      <span className="mb-1.5 block text-sm text-ink">
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      {children}
      {showRequiredError ? <span className="mt-1 block text-xs text-danger">Required</span> : null}
      {hint && !showRequiredError ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
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
      : "border-ink/25 bg-accent-soft text-ink";

  return <div className={`rounded-[8px] border px-4 py-3 text-sm ${styles}`}>{children}</div>;
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
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.05em] ${/active|completed|accepted|approved/.test(status) ? "border-success-rule bg-success-soft text-success" : /pending|review|invited/.test(status) ? "border-warning-rule bg-warning-soft text-warning" : "border-rule bg-canvas text-muted"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function CopyText({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-[6px] border-2 border-transparent px-2 py-1 font-mono text-[12px] text-ink transition-colors hover:border-ink/25 hover:bg-accent-soft"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span>{label ?? value}</span>
      <span className="text-muted">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-rule px-6 py-12 text-center text-sm text-muted">{children}</p>;
}
