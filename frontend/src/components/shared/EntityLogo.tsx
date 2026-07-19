import { useState } from "react";
import { cn } from "@/lib/utils";
import { entityChipColor, entityInitials, entityLogoSrc } from "@/lib/entityLogo";

interface EntityLogoProps {
  /** Entity display name — used for the alt text and the initials fallback. */
  name: string;
  /** Entity code (DM/DHA/…). Resolves the asset by convention and drives the initials chip. */
  code?: string | null;
  /** Authoritative logo path from the API (Entity.logo_url). Wins over code-based resolution. */
  src?: string | null;
  /** Rendered square size in px. */
  size?: number;
  /** Corner rounding. */
  rounded?: "md" | "lg" | "full";
  className?: string;
}

/**
 * An entity's brand mark: the official logo when one is held (on a white chip so colored/transparent
 * marks read on any background, in both themes), otherwise a deterministic initials chip. A single
 * component so every surface — DGHR tables, the entity portal, dashboards — renders identities the
 * same way. Falls back to initials if the image fails to load.
 */
export function EntityLogo({ name, code, src, size = 28, rounded = "md", className }: EntityLogoProps) {
  const [errored, setErrored] = useState(false);
  const resolved = src ?? entityLogoSrc(code);
  const radius = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-md";

  if (resolved && !errored) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/5",
          radius,
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={resolved}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-[12%]"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </span>
    );
  }

  const initials = entityInitials(name, code);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center font-bold text-white", radius, className)}
      style={{
        width: size,
        height: size,
        backgroundColor: entityChipColor(code || name),
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
      aria-label={`${name} logo`}
      title={name}
    >
      {initials}
    </span>
  );
}
