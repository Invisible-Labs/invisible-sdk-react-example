const ICON_PATHS = {
  arrow: "M12 4v16m-7-7 7 7 7-7",
  chevron: "m6 9 6 6 6-6",
  close: "m6 6 12 12M6 18 18 6",
  clock: "M12 7v5l3 2",
  check: "m5 12 4 4L19 6",
  copy: "M9 9h11v11H9zM5 15H3V3h12v2",
  help: "M9.5 8a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 4h.01",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
} as const;
export function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(name === "clock" || name === "help") && (
        <circle cx="12" cy="12" r="9" />
      )}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
export function SolIcon() {
  return (
    <span className="sol-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="m5 4 16 0-3 4H2zm-3 6h16l3 4H5zm3 6h16l-3 4H2z" />
      </svg>
    </span>
  );
}
