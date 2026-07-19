import * as React from "react";
import { cn } from "@/lib/utils";

// Form-control kit (SPEC §10). One height, one focus treatment, tokenised so both themes
// stay correct. Read-only fields use a tinted inset surface; calculated fields use a calm
// accent — both visibly distinct from editable inputs, neither looks "disabled".

/** Canonical editable-field classes — reuse inline where a raw <input> is unavoidable. */
export const fieldClass =
  "h-10 w-full rounded-btn border border-border bg-card px-3 text-sm text-text1 outline-none transition-[border-color,box-shadow] duration-fast placeholder:text-text3 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-inset disabled:text-text2";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text3", className)}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldClass, className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldClass, "h-auto min-h-[96px] py-2.5 leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/** Canonical select classes (editable field + standardised chevron, §10). */
export const selectClass = cn(fieldClass, "cursor-pointer select-field");

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(selectClass, className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/** Read-only display value — tinted inset surface, clearly non-editable but fully readable (§10). */
export function ReadOnlyField({ value, className, mono }: { value: React.ReactNode; className?: string; mono?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-btn border border-border bg-inset px-3 text-sm text-text2",
        mono && "nums font-medium",
        className,
      )}
    >
      {value}
    </div>
  );
}

/** Calculated value — calm blue accent, tabular, clearly derived not typed (§10). */
export function CalcField({ value, className }: { value: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "nums flex h-10 items-center rounded-btn border border-primary/25 bg-primary/[0.06] px-3 text-sm font-semibold text-primary",
        className,
      )}
    >
      {value}
    </div>
  );
}
