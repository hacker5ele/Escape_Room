/**
 * Inline SVG for the Reading Hall. No image files: the rest of the app is
 * self-hosted fonts and no CDN requests, and a handful of flat shapes cost
 * less than a sprite sheet. Placeholder art pending Inaam's Figma pass — see
 * the note in `index.css`.
 */

interface MarkProps {
  className?: string
}

export function BookshelfMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="4" y="38" width="40" height="3" fill="currentColor" opacity="0.9" />
      <rect x="7" y="14" width="5" height="24" fill="currentColor" opacity="0.55" />
      <rect x="13" y="9" width="4" height="29" fill="currentColor" opacity="0.85" />
      <rect x="18" y="18" width="6" height="20" fill="currentColor" opacity="0.4" />
      <rect x="25" y="6" width="4" height="32" fill="currentColor" opacity="0.7" />
      <rect x="30" y="16" width="5" height="22" fill="currentColor" opacity="0.9" />
      <rect x="36" y="11" width="5" height="27" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function ScrollMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="8" y="20" width="32" height="9" rx="4.5" fill="currentColor" opacity="0.85" />
      <circle cx="8" cy="24.5" r="4.5" fill="currentColor" opacity="0.6" />
      <circle cx="40" cy="24.5" r="4.5" fill="currentColor" opacity="0.6" />
      <rect x="12" y="31" width="26" height="7" rx="3.5" fill="currentColor" opacity="0.45" />
      <circle cx="12" cy="34.5" r="3.5" fill="currentColor" opacity="0.3" />
      <circle cx="38" cy="34.5" r="3.5" fill="currentColor" opacity="0.3" />
    </svg>
  )
}

export function LecternMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M14 20 L34 20 L38 12 L10 12 Z" fill="currentColor" opacity="0.85" />
      <path
        d="M13 15 Q24 9 35 15"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.9"
      />
      <path d="M20 20 L18 40 L24 40 Z" fill="currentColor" opacity="0.6" />
      <path d="M28 20 L30 40 L24 40 Z" fill="currentColor" opacity="0.6" />
      <rect x="16" y="40" width="16" height="3" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function CandleMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M24 6 C29 13 29 17 24 20 C19 17 19 13 24 6 Z" fill="currentColor" opacity="0.6" />
      <rect x="20" y="20" width="8" height="20" fill="currentColor" opacity="0.85" />
      <rect x="15" y="40" width="18" height="3" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function InkwellMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M14 20 L34 20 L32 40 L16 40 Z" fill="currentColor" opacity="0.75" />
      <ellipse cx="24" cy="20" rx="10" ry="3" fill="currentColor" opacity="0.9" />
      <path d="M28 14 L38 4" stroke="currentColor" strokeWidth="2" opacity="0.7" />
      <path d="M28 14 L24 18" stroke="currentColor" strokeWidth="2" opacity="0.7" />
    </svg>
  )
}

export function VellumMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect
        x="8"
        y="30"
        width="32"
        height="6"
        fill="currentColor"
        opacity="0.85"
        transform="rotate(-2 24 33)"
      />
      <rect
        x="10"
        y="22"
        width="30"
        height="6"
        fill="currentColor"
        opacity="0.6"
        transform="rotate(2 25 25)"
      />
      <rect
        x="9"
        y="14"
        width="31"
        height="6"
        fill="currentColor"
        opacity="0.75"
        transform="rotate(-1 24 17)"
      />
    </svg>
  )
}

export function EmberMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <ellipse cx="16" cy="34" rx="7" ry="4" fill="currentColor" opacity="0.5" />
      <ellipse cx="28" cy="36" rx="8" ry="4.5" fill="currentColor" opacity="0.65" />
      <ellipse cx="22" cy="30" rx="6" ry="3.5" fill="currentColor" opacity="0.8" />
      <circle cx="22" cy="29" r="2" fill="currentColor" opacity="0.95" />
    </svg>
  )
}

export function ColumnMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="18" y="6" width="12" height="4" fill="currentColor" opacity="0.9" />
      <rect x="20" y="10" width="8" height="26" fill="currentColor" opacity="0.7" />
      <path d="M16 36 L32 36 L34 40 L14 40 Z" fill="currentColor" opacity="0.6" />
      <rect x="14" y="40" width="20" height="3" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function BeamMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="4" y="20" width="40" height="8" fill="currentColor" opacity="0.8" />
      <path
        d="M22 20 L26 24 L22 28"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
    </svg>
  )
}

export function ScorchMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <ellipse cx="24" cy="30" rx="18" ry="8" fill="currentColor" opacity="0.5" />
      <ellipse cx="20" cy="28" rx="10" ry="5" fill="currentColor" opacity="0.7" />
      <ellipse cx="28" cy="31" rx="7" ry="4" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export const HOTSPOT_MARKS: Record<string, (props: MarkProps) => React.ReactElement> = {
  bookshelf: BookshelfMark,
  'scroll-pile': ScrollMark,
  'candle-stand': CandleMark,
  lectern: LecternMark,
  'ink-well': InkwellMark,
  'vellum-rack': VellumMark,
  'broken-column': ColumnMark,
  'ceiling-beam': BeamMark,
  'scorch-mark': ScorchMark,
  'ember-pit': EmberMark,
}

/** A fixed sequence rather than `Math.random()` — the shelf should not reflow on every render. */
const SHELF_BOOK_WIDTHS = [
  10, 14, 8, 18, 11, 9, 16, 13, 10, 20, 12, 8, 15, 11, 9, 17, 13, 10, 14, 19, 8, 12, 16, 10, 13, 9,
  18, 11, 14, 8, 15, 12, 20, 9, 13, 17, 10, 14, 11, 16,
]

/** Ambient shelving along the top of the scene — the hall reads as a library even before you click anything. */
export function LibraryBackdrop() {
  let x = 0
  const books = SHELF_BOOK_WIDTHS.map((width, index) => {
    const height = 40 + ((index * 7) % 30)
    const book = (
      <rect
        key={index}
        x={x}
        y={110 - height}
        width={width - 2}
        height={height}
        fill="currentColor"
        opacity={0.08 + (index % 4) * 0.03}
      />
    )
    x += width
    return book
  })

  return (
    <svg
      viewBox={`0 0 ${x} 110`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="text-stock-200 pointer-events-none absolute inset-x-0 top-0 h-36 w-full sm:h-44"
    >
      {books}
      <rect x="0" y="107" width={x} height="3" fill="currentColor" opacity="0.25" />
    </svg>
  )
}

const WALL_ROWS = 6
const WALL_BOOK_WIDTHS = [9, 13, 7, 16, 10, 8, 14, 11, 9, 17, 12, 7, 15, 10, 8, 12, 9, 14]

/** A tall stack of shelf rows for the side walls — the hall flanked on both sides, not just a strip up top. */
export function ShelfColumn({ className }: MarkProps) {
  const rowHeight = 118
  const columnWidth = 120
  const height = WALL_ROWS * rowHeight
  const rows = []

  for (let row = 0; row < WALL_ROWS; row++) {
    const baseY = row * rowHeight + rowHeight - 6
    const books = []
    let x = 6
    let bookIndex = 0
    while (x < columnWidth - 6) {
      const width = WALL_BOOK_WIDTHS[(row * 5 + bookIndex) % WALL_BOOK_WIDTHS.length] ?? 10
      const bookHeight = 46 + (((row + 1) * (bookIndex + 1) * 13) % 52)
      books.push(
        <rect
          key={bookIndex}
          x={x}
          y={baseY - bookHeight}
          width={width - 2}
          height={bookHeight}
          fill="currentColor"
          opacity={0.12 + ((row + bookIndex) % 4) * 0.05}
        />,
      )
      x += width
      bookIndex++
    }
    rows.push(
      <g key={row}>
        {books}
        <rect x="0" y={baseY} width={columnWidth} height="3" fill="currentColor" opacity="0.28" />
      </g>,
    )
  }

  return (
    <svg
      viewBox={`0 0 ${columnWidth} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      {rows}
    </svg>
  )
}
