import * as React from "react";
import { cn } from "@/lib/utils";

// EmptyState / PlaceholderPage building block (SPEC §4.3). A placeholder must still look designed.
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "#2563EB",
  toneBg = "#DBEAFE",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: string;
  toneBg?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: toneBg, color: tone }}
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text1">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-text2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
