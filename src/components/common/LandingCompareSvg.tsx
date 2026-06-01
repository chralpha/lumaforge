export function LandingCompareSvg({ label }: { label: string }) {
  return (
    <svg
      className="lf-compare-svg"
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="lf-sky-raw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2730" />
          <stop offset="0.56" stopColor="#34404a" />
          <stop offset="1" stopColor="#4f4d46" />
        </linearGradient>
        <linearGradient id="lf-sky-finished" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#29435a" />
          <stop offset="0.48" stopColor="#6c7e7a" />
          <stop offset="1" stopColor="#c5965c" />
        </linearGradient>
        <linearGradient id="lf-ground-raw" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3a33" />
          <stop offset="1" stopColor="#171b1d" />
        </linearGradient>
        <linearGradient id="lf-ground-finished" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a6842" />
          <stop offset="1" stopColor="#203229" />
        </linearGradient>
        <radialGradient id="lf-sun" cx="50%" cy="44%" r="45%">
          <stop offset="0" stopColor="#ffd08a" stopOpacity="0.78" />
          <stop offset="0.42" stopColor="#eaa65f" stopOpacity="0.22" />
          <stop offset="1" stopColor="#eaa65f" stopOpacity="0" />
        </radialGradient>
        <clipPath id="lf-finished-clip">
          <rect
            className="lf-finished-clip-rect"
            x="600"
            y="0"
            width="600"
            height="900"
          />
        </clipPath>
        <filter id="lf-soft-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.14" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width="1200" height="900" fill="url(#lf-sky-raw)" />
      <path
        d="M0 548c105-78 192-125 282-140 95-16 166 35 257 17 72-14 116-70 211-69 116 2 178 75 272 84 80 7 129-28 178-66v526H0z"
        fill="url(#lf-ground-raw)"
      />
      <path
        d="M0 505c102-56 186-86 258-82 94 5 139 66 232 60 83-6 139-74 230-70 109 5 176 89 275 101 77 9 133-23 205-84v470H0z"
        fill="#101417"
        opacity="0.52"
      />
      <path
        d="M0 654c133-62 248-85 358-68 89 14 155 56 244 55 117-1 221-78 344-54 86 17 165 66 254 43v270H0z"
        fill="#0b0f11"
        opacity="0.68"
      />

      <g clipPath="url(#lf-finished-clip)">
        <rect width="1200" height="900" fill="url(#lf-sky-finished)" />
        <circle cx="725" cy="348" r="360" fill="url(#lf-sun)" />
        <path
          d="M0 548c105-78 192-125 282-140 95-16 166 35 257 17 72-14 116-70 211-69 116 2 178 75 272 84 80 7 129-28 178-66v526H0z"
          fill="url(#lf-ground-finished)"
        />
        <path
          d="M0 505c102-56 186-86 258-82 94 5 139 66 232 60 83-6 139-74 230-70 109 5 176 89 275 101 77 9 133-23 205-84v470H0z"
          fill="#27351f"
          opacity="0.35"
        />
        <path
          d="M0 654c133-62 248-85 358-68 89 14 155 56 244 55 117-1 221-78 344-54 86 17 165 66 254 43v270H0z"
          fill="#142017"
          opacity="0.56"
        />
      </g>

      <rect
        width="1200"
        height="900"
        filter="url(#lf-soft-grain)"
        opacity="0.24"
      />

      <g className="lf-compare-handle">
        <rect
          x="598"
          y="0"
          width="4"
          height="900"
          fill="#f4ead7"
          opacity="0.95"
        />
        <circle cx="600" cy="450" r="48" fill="#101417" opacity="0.64" />
        <path
          d="M584 450h32M592 438l-12 12 12 12M608 438l12 12-12 12"
          fill="none"
          stroke="#f8f0dd"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
