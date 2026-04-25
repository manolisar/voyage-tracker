// Inline SVG icons. Sized via `className`/`style`; `currentColor` lets parent
// control color. Same calling convention as v6 Icons.jsx.

import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const i = (props: IconProps, children: ReactNode) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

export const Lock = (p: IconProps) => i(p, <>
  <rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 0110 0v4" />
</>);

export const Unlock = (p: IconProps) => i(p, <>
  <rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 019.9-1" />
</>);

export const Eye = (p: IconProps) => i(p, <>
  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
  <circle cx="12" cy="12" r="3" />
</>);

export const Edit = (p: IconProps) => i(p, <>
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
</>);

export const Settings = (p: IconProps) => i(p, <>
  <circle cx="12" cy="12" r="3" />
  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15 1.65 1.65 0 003.17 14H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
</>);

export const Sun = (p: IconProps) => i(p, <>
  <circle cx="12" cy="12" r="5" />
  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
</>);

export const Moon = (p: IconProps) => i(p, <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />);

export const LogOut = (p: IconProps) => i(p, <>
  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
  <path d="M16 17l5-5-5-5" />
  <path d="M21 12H9" />
</>);

export const Menu = (p: IconProps) => i(p, <>
  <line x1="3" y1="6"  x2="21" y2="6" />
  <line x1="3" y1="12" x2="21" y2="12" />
  <line x1="3" y1="18" x2="21" y2="18" />
</>);

export const Anchor = (p: IconProps) => i(p, <>
  <circle cx="12" cy="5" r="3" />
  <line x1="12" y1="22" x2="12" y2="8" />
  <path d="M5 12H2a10 10 0 0020 0h-3" />
</>);

export const Github = (p: IconProps) => i(p, <>
  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
</>);

export const Cloud = (p: IconProps) => i(p, <>
  <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
</>);

export const X = (p: IconProps) => i(p, <>
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</>);

export const ChevronDown = (p: IconProps) => i(p, <polyline points="6 9 12 15 18 9" />);
export const ChevronRight = (p: IconProps) => i(p, <polyline points="9 6 15 12 9 18" />);

export const AlertTriangle = (p: IconProps) => i(p, <>
  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
  <line x1="12" y1="9"  x2="12" y2="13" />
  <line x1="12" y1="17" x2="12.01" y2="17" />
</>);

export const Check = (p: IconProps) => i(p, <polyline points="20 6 9 17 4 12" />);

export const HelpCircle = (p: IconProps) => i(p, <>
  <circle cx="12" cy="12" r="10" />
  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
  <line x1="12" y1="17" x2="12.01" y2="17" />
</>);

export const Search = (p: IconProps) => i(p, <>
  <circle cx="11" cy="11" r="7" />
  <line x1="21" y1="21" x2="16.65" y2="16.65" />
</>);

export const Refresh = (p: IconProps) => i(p, <>
  <polyline points="23 4 23 10 17 10" />
  <polyline points="1 20 1 14 7 14" />
  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
</>);

export const FileText = (p: IconProps) => i(p, <>
  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
  <polyline points="14 2 14 8 20 8" />
</>);

export const Compass = (p: IconProps) => i(p, <>
  <circle cx="12" cy="12" r="10" />
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
</>);

export const Plus = (p: IconProps) => i(p, <>
  <line x1="12" y1="5" x2="12" y2="19" />
  <line x1="5" y1="12" x2="19" y2="12" />
</>);

export const ArrowUpRight = (p: IconProps) => i(p, <>
  <line x1="7" y1="17" x2="17" y2="7" />
  <polyline points="7 7 17 7 17 17" />
</>);

export const ArrowDownLeft = (p: IconProps) => i(p, <>
  <line x1="17" y1="7" x2="7" y2="17" />
  <polyline points="17 17 7 17 7 7" />
</>);

export const BarChart = (p: IconProps) => i(p, <>
  <line x1="12" y1="20" x2="12" y2="10" />
  <line x1="18" y1="20" x2="18" y2="4" />
  <line x1="6"  y1="20" x2="6"  y2="16" />
</>);

export const Download = (p: IconProps) => i(p, <>
  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
  <polyline points="7 10 12 15 17 10" />
  <line x1="12" y1="15" x2="12" y2="3" />
</>);

export const Upload = (p: IconProps) => i(p, <>
  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
  <polyline points="17 8 12 3 7 8" />
  <line x1="12" y1="3" x2="12" y2="15" />
</>);

export const Trash2 = (p: IconProps) => i(p, <>
  <polyline points="3 6 5 6 21 6" />
  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
  <path d="M10 11v6" />
  <path d="M14 11v6" />
  <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
</>);

export const Folder = (p: IconProps) => i(p, <>
  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
</>);
