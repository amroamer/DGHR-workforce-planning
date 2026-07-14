// Original, generic brand marks — never a copyrighted government asset (SPEC §4.2).

/** Abstract government crest (generic geometric emblem). */
export function Crest({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="19" stroke="white" strokeWidth="1.5" opacity="0.9" />
      <path
        d="M20 6l3.8 7.7 8.5 1.2-6.1 6 1.4 8.5L20 26.4l-7.6 4 1.4-8.5-6.1-6 8.5-1.2L20 6z"
        fill="white"
        opacity="0.95"
      />
      <circle cx="20" cy="20" r="3" fill="#0B1B3B" />
    </svg>
  );
}

/** Light-gray Dubai skyline silhouette watermark for page headers. */
export function SkylineWatermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 900 180"
      preserveAspectRatio="xMaxYMax meet"
      className={className}
      aria-hidden
    >
      <g fill="#0B1B3B" opacity="0.06">
        {/* Burj-like central spire */}
        <path d="M470 180V54c0-3 3-4 4-1l6 20 6-20c1-3 4-2 4 1v126h-20z" />
        <rect x="452" y="86" width="16" height="94" />
        <rect x="492" y="74" width="16" height="106" />
        {/* Towers left */}
        <rect x="40" y="120" width="34" height="60" />
        <rect x="82" y="96" width="30" height="84" />
        <path d="M120 180v-70l16-14 16 14v70h-32z" />
        <rect x="160" y="108" width="28" height="72" />
        <rect x="196" y="132" width="26" height="48" />
        <path d="M232 180v-58c0-8 22-8 22 0v58h-22z" />
        <rect x="262" y="100" width="30" height="80" />
        <rect x="300" y="118" width="24" height="62" />
        <path d="M332 180v-64l14-18 14 18v64h-28z" />
        <rect x="368" y="112" width="28" height="68" />
        <rect x="404" y="128" width="24" height="52" />
        {/* Towers right */}
        <rect x="522" y="112" width="26" height="68" />
        <path d="M556 180v-60l14-16 14 16v60h-28z" />
        <rect x="592" y="98" width="30" height="82" />
        <rect x="630" y="124" width="24" height="56" />
        <path d="M662 180v-70c0-10 24-10 24 0v70h-24z" />
        <rect x="694" y="106" width="28" height="74" />
        <rect x="730" y="130" width="24" height="50" />
        <path d="M762 180v-62l16-16 16 16v62h-32z" />
        <rect x="806" y="116" width="28" height="64" />
        <rect x="842" y="134" width="24" height="46" />
      </g>
    </svg>
  );
}
