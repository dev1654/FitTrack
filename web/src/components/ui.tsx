import { forwardRef, useId } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "md" | "sm";
  busy?: boolean;
};

const variants = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-50",
  secondary: "bg-panel text-ink border border-rule hover:border-ink-3 disabled:opacity-50",
  quiet: "text-ink-2 hover:text-ink hover:bg-sunken disabled:opacity-50",
  danger: "text-danger hover:bg-sunken disabled:opacity-50",
};

export function buttonClass(variant: keyof typeof variants = "secondary", size: "md" | "sm" = "md") {
  const sizing = size === "md" ? "h-11 px-4 text-[15px]" : "h-9 px-3 text-sm";
  return `inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors ${sizing} ${variants[variant]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  busy,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${buttonClass(variant, size)} ${className}`}
    >
      {busy ? <Spinner small /> : null}
      {children}
    </button>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  return (
    <label htmlFor={inputId} className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? hintId : undefined}
        className="h-11 w-full rounded-md border border-rule bg-panel px-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        {...rest}
      />
      {error ? (
        <span id={hintId} className="mt-1.5 block text-sm text-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="mt-1.5 block text-sm text-ink-3">
          {hint}
        </span>
      ) : null}
    </label>
  );
});

export function Spinner({ small, label = "Loading" }: { small?: boolean; label?: string }) {
  const size = small ? "h-4 w-4" : "h-6 w-6";
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <span
        className={`${size} animate-spin rounded-full border-2 border-current border-r-transparent opacity-70`}
      />
    </span>
  );
}

export function PageLoading() {
  return (
    <div className="flex justify-center py-24 text-ink-3">
      <Spinner />
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="rounded-md border border-rule bg-panel px-4 py-3 text-sm">
      <p className="text-danger">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 font-semibold text-accent underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-[34px] leading-none font-bold tracking-tight md:text-[44px]">
        {children}
      </h1>
      {aside}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-2xl font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

/** The one panel style: white surface, hairline border. Used for grouped content only. */
export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border border-rule bg-panel ${className}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={`h-11 rounded-md border border-rule bg-panel px-3 text-[15px] text-ink focus:border-accent focus:outline-none ${className}`}
        {...rest}
      />
    );
  },
);
