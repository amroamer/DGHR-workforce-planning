// Entity brand-mark resolution. The authoritative value is the DB `logo_url` (Entity.logo_url,
// exposed on the DGHR entity endpoints). Where a payload only carries the entity `code`, we resolve
// the same asset by convention — the file under /logos is named by the slugified code — so brand
// marks appear across secondary surfaces without threading logo_url through every serializer.
//
// ENTITY_LOGO_CODES mirrors app.planning_seed.LOGO_CODES: the codes for which an official asset is
// actually held. Keeping it here lets us render the initials fallback directly for entities with no
// asset, instead of probing for a 404. Not business data — brand wiring, like the persona presets.

export const ENTITY_LOGO_CODES = new Set<string>([
  "RTA", "DM", "DHA", "DP", "DC", "DXBC", "GDRFA", "DLD", "DET",
]);

/** Slugify an entity code into its logo filename stem — must match app.seed._logo_slug. */
export function logoSlug(code: string): string {
  return (code || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Canonical /logos path for an entity code, or null when no official asset is held. */
export function entityLogoSrc(code: string | null | undefined): string | null {
  if (!code || !ENTITY_LOGO_CODES.has(code)) return null;
  return `/logos/${logoSlug(code)}.png`;
}

/** Short, stable initials for the fallback chip — the code (recognisable short form) when present,
 *  else the first letters of the two most significant name words. */
export function entityInitials(name: string, code?: string | null): string {
  if (code) return code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
  const words = (name || "").split(/\s+/).filter((w) => w.length > 2);
  const pick = words.length ? words : (name || "?").split(/\s+/);
  return pick.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// Deterministic fallback-chip palette — mid-tone hues that carry white text in both themes.
const CHIP_COLORS = [
  "#0B1B3B", "#2563EB", "#0D9488", "#7C3AED", "#B45309",
  "#BE185D", "#0369A1", "#15803D", "#9333EA", "#C2410C",
];

/** Deterministic chip background for an entity, hashed from its code (or name) so a given entity
 *  always gets the same colour. */
export function entityChipColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}
