import { useId } from 'react';

// International Code of Signals — alphabet flags rendered as inline SVG.
// Used as decoration on VoyageEndDetail's otherwise-empty page real estate.
//
// Only the letters needed for "VOYAGE END" are implemented (V O Y A G E N D);
// extending to the rest of the alphabet would just be more of the same.
//
// Geometry is hand-drawn in a 60×40 viewBox to roughly match the standard
// ICS aspect ratio. Colours follow the Pantone references for ICS:
//   Red    PMS 186 C  →  #C8102E
//   Blue   PMS 280 C  →  #012169
//   Yellow PMS 116 C  →  #FFD100
//   White  #FFFFFF

const RED = '#C8102E';
const BLUE = '#012169';
const YELLOW = '#FFD100';
const WHITE = '#FFFFFF';

interface FlagProps {
  size?: number;
  className?: string;
  title?: string;
}

const FLAG_VIEWBOX = '0 0 60 40';

function flagFrame(children: React.ReactNode, size: number, className?: string, title?: string) {
  return (
    <svg
      viewBox={FLAG_VIEWBOX}
      width={size}
      height={size * (40 / 60)}
      className={className}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// A — "Diver below; keep clear." White / blue with swallow-tail right edge.
export function FlagAlfa({ size = 60, className, title = 'Alfa' }: FlagProps) {
  return flagFrame(
    <>
      <path d="M0,0 L30,0 L30,40 L0,40 Z" fill={WHITE} />
      <path d="M30,0 L60,0 L50,20 L60,40 L30,40 Z" fill={BLUE} />
    </>,
    size, className, title,
  );
}

// D — "Keep clear of me; manoeuvring with difficulty." Blue / yellow / blue
// horizontal bands (1 : 3 : 1).
export function FlagDelta({ size = 60, className, title = 'Delta' }: FlagProps) {
  return flagFrame(
    <>
      <rect x="0" y="0" width="60" height="8" fill={BLUE} />
      <rect x="0" y="8" width="60" height="24" fill={YELLOW} />
      <rect x="0" y="32" width="60" height="8" fill={BLUE} />
    </>,
    size, className, title,
  );
}

// E — "Altering my course to starboard." Blue top half, red bottom half.
export function FlagEcho({ size = 60, className, title = 'Echo' }: FlagProps) {
  return flagFrame(
    <>
      <rect x="0" y="0" width="60" height="20" fill={BLUE} />
      <rect x="0" y="20" width="60" height="20" fill={RED} />
    </>,
    size, className, title,
  );
}

// G — "I require a pilot." Six vertical bands, yellow / blue alternating.
export function FlagGolf({ size = 60, className, title = 'Golf' }: FlagProps) {
  return flagFrame(
    <>
      {[0, 10, 20, 30, 40, 50].map((x, i) => (
        <rect key={x} x={x} y="0" width="10" height="40" fill={i % 2 === 0 ? YELLOW : BLUE} />
      ))}
    </>,
    size, className, title,
  );
}

// N — "No / negative." 4 × 4 blue / white checkerboard.
export function FlagNovember({ size = 60, className, title = 'November' }: FlagProps) {
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) cells.push({ x: col * 15, y: row * 10 });
    }
  }
  return flagFrame(
    <>
      <rect width="60" height="40" fill={WHITE} />
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="15" height="10" fill={BLUE} />
      ))}
    </>,
    size, className, title,
  );
}

// O — "Man overboard." Diagonal split: red triangle top-left,
// yellow triangle bottom-right.
export function FlagOscar({ size = 60, className, title = 'Oscar' }: FlagProps) {
  return flagFrame(
    <>
      <polygon points="0,0 60,0 0,40" fill={RED} />
      <polygon points="60,0 60,40 0,40" fill={YELLOW} />
    </>,
    size, className, title,
  );
}

// V — "I require assistance." White with red saltire (diagonal cross).
export function FlagVictor({ size = 60, className, title = 'Victor' }: FlagProps) {
  // Saltire drawn as two thick diagonals; bar width chosen so the cross is
  // visually similar to the printed standard.
  return flagFrame(
    <>
      <rect width="60" height="40" fill={WHITE} />
      <line x1="0" y1="0" x2="60" y2="40" stroke={RED} strokeWidth="9" />
      <line x1="60" y1="0" x2="0" y2="40" stroke={RED} strokeWidth="9" />
    </>,
    size, className, title,
  );
}

// Y — "I am dragging my anchor." Diagonal yellow / red stripes from upper-left
// to lower-right. Implemented with a rotated pattern for crisp rendering.
export function FlagYankee({ size = 60, className, title = 'Yankee' }: FlagProps) {
  // useId gives a stable, render-safe unique id per instance — avoids the
  // pattern-id collisions that crop up when multiple Yankee flags share a
  // document, without the purity-rule warning of Math.random().
  const reactId = useId();
  const patternId = `flag-yankee-${reactId}`;
  return flagFrame(
    <>
      <defs>
        <pattern
          id={patternId}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="14" fill={YELLOW} />
          <rect x="7" width="7" height="14" fill={RED} />
        </pattern>
      </defs>
      <rect width="60" height="40" fill={`url(#${patternId})`} />
    </>,
    size, className, title,
  );
}

// Map letter → flag component for SignalFlagWord. Only includes the letters
// needed by the current callers; extend as needed.
const FLAG_BY_LETTER: Record<string, (props: FlagProps) => React.ReactElement> = {
  A: FlagAlfa,
  D: FlagDelta,
  E: FlagEcho,
  G: FlagGolf,
  N: FlagNovember,
  O: FlagOscar,
  V: FlagVictor,
  Y: FlagYankee,
};

const FLAG_NAME: Record<string, string> = {
  A: 'Alfa',
  D: 'Delta',
  E: 'Echo',
  G: 'Golf',
  N: 'November',
  O: 'Oscar',
  V: 'Victor',
  Y: 'Yankee',
};

interface SignalFlagWordProps {
  text: string;
  size?: number;
  // Width of the gap rendered for whitespace characters in `text`.
  spaceWidth?: number;
}

// Renders a string as a row of ICS alphabet flags. Whitespace becomes a gap;
// unknown letters are skipped (with a console warning so missing flags are
// caught early in dev).
export function SignalFlagWord({ text, size = 56, spaceWidth = 18 }: SignalFlagWordProps) {
  const items: React.ReactNode[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      items.push(<span key={`sp-${i}`} style={{ width: spaceWidth }} aria-hidden="true" />);
      continue;
    }
    const Flag = FLAG_BY_LETTER[ch.toUpperCase()];
    if (!Flag) {
      console.warn(`[SignalFlagWord] no flag defined for "${ch}"`);
      continue;
    }
    items.push(
      <Flag
        key={`${ch}-${i}`}
        size={size}
        title={FLAG_NAME[ch.toUpperCase()]}
        className="rounded-sm shadow-sm"
      />,
    );
  }
  return (
    <div
      role="img"
      aria-label={`International Code of Signals: ${text}`}
      className="flex items-center gap-1.5 flex-wrap justify-center"
    >
      {items}
    </div>
  );
}
