import type { ReactNode } from 'react';

// Small stroke icon set, drawn on a 24px grid. currentColor, so an icon takes
// the colour of the text around it.
const PATHS = {
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  inbox: <><path d="M4 5h16l1.5 8v6a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-6z" /><path d="M2.5 13H8l1.5 2.5h5L16 13h5.5" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  phone: <path d="M5 3.5h3.5l2 5-2.5 1.6a11 11 0 0 0 5.9 5.9l1.6-2.5 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />,
  phoneOut: <><path d="M5 3.5h3.5l2 5-2.5 1.6a11 11 0 0 0 5.9 5.9l1.6-2.5 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" /><path d="M15 3h6v6M21 3l-6.5 6.5" /></>,
  phoneIn: <><path d="M5 3.5h3.5l2 5-2.5 1.6a11 11 0 0 0 5.9 5.9l1.6-2.5 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" /><path d="M21 3l-6.5 6.5M14.5 4v5.5H20" /></>,
  phoneMissed: <><path d="M5 3.5h3.5l2 5-2.5 1.6a11 11 0 0 0 5.9 5.9l1.6-2.5 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" /><path d="M15 3l6 6M21 3l-6 6" /></>,
  voicemail: <><circle cx="6.5" cy="12" r="3.5" /><circle cx="17.5" cy="12" r="3.5" /><path d="M6.5 15.5h11" /></>,
  building: <><path d="M4 21V6.5L12 3l8 3.5V21" /><path d="M2.5 21h19" /><path d="M9.5 21v-4.5h5V21" /><path d="M8.5 8.5h.01M12 8.5h.01M15.5 8.5h.01M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" strokeWidth="2.4" /></>,
  sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8.5" r="3.3" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.3a3.3 3.3 0 0 1 0 6.4M18 14.2A6.5 6.5 0 0 1 21.5 20" /></>,
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.3h.01" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  pin: <><path d="M12 21.5s7-7.2 7-12.5a7 7 0 0 0-14 0c0 5.3 7 12.5 7 12.5z" /><circle cx="12" cy="9" r="2.5" /></>,
  trash: <><path d="M4 7h16M9.5 7V4h5v3" /><path d="M6.5 7l1 13.5h9l1-13.5" /></>,
  pencil: <><path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z" /><path d="M13.5 7l3.5 3.5" /></>,
  sparkle: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />,
  moon: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  logout: <><path d="M15 4h3.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H15" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16.5 6.5l3 3" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5h12l-2.5 4 2.5 4H5" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.8, className = '', title }: {
  name: IconName; size?: number; strokeWidth?: number; className?: string; title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
