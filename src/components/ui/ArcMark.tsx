export function ArcMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden className={className}>
      <defs>
        <linearGradient id="arcmark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8a55a" />
          <stop offset="1" stopColor="#cc785c" />
        </linearGradient>
      </defs>
      <path d="M5 20 A 11 11 0 0 1 21 6" fill="none" stroke="url(#arcmark-g)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20.5" cy="19" r="3" fill="#cc785c" />
    </svg>
  )
}
