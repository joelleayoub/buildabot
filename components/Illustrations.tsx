// Decorative illustrations. All are hidden from screen readers.

/** Small rover mark used in the header. */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="5" y="11" width="22" height="11" rx="3.5" fill="var(--accent)" />
      <circle cx="12" cy="16.5" r="2.2" fill="var(--background)" />
      <circle cx="20" cy="16.5" r="2.2" fill="var(--background)" />
      <path d="M16 11V6.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5" r="2" fill="var(--accent)" />
      <circle cx="10" cy="25" r="3.5" fill="currentColor" />
      <circle cx="22" cy="25" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** Side view of a mapping rover scanning a room. */
export function HeroRover({ className = "" }: { className?: string }) {
  const body = "var(--g-body)";
  const sense = "var(--g-sense)";
  const brain = "var(--g-brain)";
  const power = "var(--g-power)";
  return (
    <svg viewBox="0 0 360 190" aria-hidden="true" className={className}>
      {/* room: floor, plant, box */}
      <path d="M8 164h344" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
      <rect x="296" y="118" width="44" height="46" rx="4" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M296 134h44M318 118v46" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M28 164v-28M28 146c-10-2-14-10-14-18 9 1 14 8 14 18zM28 138c9-3 13-11 12-20-9 2-13 10-12 20z" stroke={sense} strokeWidth="1.5" fill={sense} fillOpacity="0.18" strokeLinejoin="round" />
      <path d="M20 164h16l-2 -8h-12z" fill="currentColor" fillOpacity="0.2" />

      {/* lidar sweep */}
      <path d="M176 58 L352 20 L352 104 Z" fill={sense} fillOpacity="0.1" />
      <g fill="none" stroke={sense} strokeLinecap="round" strokeWidth="2">
        <path d="M204 44a30 30 0 0 1 0 28" strokeOpacity="0.7" />
        <path d="M222 36a48 48 0 0 1 0 44" strokeOpacity="0.45" />
        <path d="M240 28a66 66 0 0 1 0 60" strokeOpacity="0.25" />
      </g>
      {[
        [296, 118],
        [296, 132],
        [296, 146],
        [308, 118],
        [322, 118],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill={sense} />
      ))}

      {/* rover */}
      <rect x="150" y="50" width="34" height="16" rx="5" fill={sense} fillOpacity="0.25" stroke={sense} strokeWidth="2" />
      <rect x="160" y="66" width="14" height="12" fill={body} fillOpacity="0.5" />
      <rect x="96" y="78" width="142" height="20" rx="6" fill={brain} fillOpacity="0.18" stroke={brain} strokeWidth="2" />
      <rect x="110" y="84" width="34" height="8" rx="2" fill={brain} />
      <circle cx="156" cy="88" r="2" fill={sense} />
      <circle cx="164" cy="88" r="2" fill={power} />
      <rect x="104" y="98" width="8" height="18" fill={body} fillOpacity="0.5" />
      <rect x="222" y="98" width="8" height="18" fill={body} fillOpacity="0.5" />
      <rect x="84" y="112" width="166" height="26" rx="8" fill={body} fillOpacity="0.16" stroke={body} strokeWidth="2" />
      <rect x="136" y="118" width="58" height="14" rx="3" fill={power} fillOpacity="0.3" stroke={power} strokeWidth="1.5" />
      <path d="M163 121l-4 4.5h6l-4 4.5" stroke={power} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="236" y="116" width="16" height="12" rx="3" fill={sense} fillOpacity="0.3" stroke={sense} strokeWidth="1.5" />
      <circle cx="248" cy="122" r="2.5" fill={sense} />
      {[112, 222].map((x) => (
        <g key={x}>
          <circle cx={x} cy="142" r="22" fill={body} />
          <circle cx={x} cy="142" r="9" fill="var(--background)" />
          <circle cx={x} cy="142" r="3" fill={body} />
        </g>
      ))}
    </svg>
  );
}

const step = "h-9 w-9 shrink-0 rounded-lg bg-accent-soft p-2 text-accent";

/** Icons for the three "how it works" steps. */
export const StepIcons = {
  describe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={step}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={step}>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.800-1.2-8-4.500-8-9V6z" />
      <path d="M8.5 12l2.500 2.500 4.500-5" />
    </svg>
  ),
  build: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={step}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3z" />
      <path d="M14.7 6.3l2.300-2.300M19.700 11.300l2.300-2.300" />
    </svg>
  ),
};
