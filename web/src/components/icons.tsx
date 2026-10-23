type IconProps = { className?: string };

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const TodayIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <path d="M9 14.5l2 2 4-4" />
  </svg>
);

export const ProgramsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <rect x="3.5" y="4.5" width="3" height="3" rx="0.8" />
    <rect x="3.5" y="10.5" width="3" height="3" rx="0.8" />
    <rect x="3.5" y="16.5" width="3" height="3" rx="0.8" />
  </svg>
);

export const LibraryIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M2.5 12h19" />
    <rect x="5" y="7" width="3" height="10" rx="1" />
    <rect x="16" y="7" width="3" height="10" rx="1" />
    <path d="M2.5 10v4M21.5 10v4" />
  </svg>
);

export const ProgressIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 19.5h16" />
    <path d="M5 15l4.5-4.5 3.5 3 6-6.5" />
    <path d="M15 7h4v4" />
  </svg>
);

export const SettingsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg {...base} width={18} height={18} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...base} width={18} height={18} strokeWidth={2.4} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const TrashIcon = ({ className }: IconProps) => (
  <svg {...base} width={18} height={18} className={className}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps) => (
  <svg {...base} width={18} height={18} className={className}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg {...base} width={20} height={20} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** The wordmark glyph: a loaded bar seen side-on. */
export const BarbellMark = ({ className }: IconProps) => (
  <svg viewBox="0 0 32 32" width={26} height={26} className={className} aria-hidden>
    <rect x="2" y="14.5" width="28" height="3" rx="1.5" fill="var(--bar)" />
    <rect x="6" y="6" width="5" height="20" rx="1.5" fill="var(--plate-blue)" />
    <rect x="21" y="6" width="5" height="20" rx="1.5" fill="var(--plate-blue)" />
  </svg>
);
