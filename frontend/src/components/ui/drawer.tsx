import * as React from "react";
import { X } from "lucide-react";

// Simple right-side slide-over used for the entity detail drawer and issue/anomaly drawers.
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode; // pinned to the bottom, always visible (no scroll needed)
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="absolute right-0 top-0 flex h-full flex-col bg-page shadow-2xl"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="text-base font-semibold text-text1">{title}</div>
          <button onClick={onClose} className="text-text3 hover:text-text1">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border bg-card p-4">{footer}</div>}
      </div>
    </div>
  );
}
