// Small stylized marks for each employer. These are hand-drawn monogram
// tiles in each brand's color language, not the official trademarks.
export function CompanyMark({ company }: { company: string }) {
  const base = "h-10 w-10 shrink-0 rounded-md";

  switch (company) {
    case "Microsoft":
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" className="fill-surface-2" />
          <rect x="9" y="9" width="10" height="10" fill="#f25022" />
          <rect x="21" y="9" width="10" height="10" fill="#7fba00" />
          <rect x="9" y="21" width="10" height="10" fill="#00a4ef" />
          <rect x="21" y="21" width="10" height="10" fill="#ffb900" />
        </svg>
      );
    case "NVIDIA":
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" fill="#76b900" />
          <path
            d="M11 27 V13 h4 l10 9.5 V13 h4 v14 h-4 l-10 -9.5 V27 Z"
            fill="#101408"
          />
        </svg>
      );
    case "Amazon":
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" fill="#232f3e" />
          <text
            x="20"
            y="24"
            textAnchor="middle"
            fontSize="19"
            fontWeight="700"
            fill="#ffffff"
            fontFamily="Arial, sans-serif"
          >
            a
          </text>
          <path
            d="M10 27 q10 6 19.5 0.5"
            fill="none"
            stroke="#ff9900"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path d="M29 25.5 l2.4 1.6 -2.9 1.2 Z" fill="#ff9900" />
        </svg>
      );
    case "Linectra":
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" fill="#0f2c4a" />
          <path
            d="M22.5 8 L12 22.5 h6.5 L17 32 L28 17 h-6.5 Z"
            fill="#ffd23f"
          />
        </svg>
      );
    case "Morgridge Institute for Research":
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" fill="#0e6e6a" />
          <path
            d="M8 26 h5 l3 -9 4 12 4 -9 2 6 h6"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 40 40" className={base} aria-hidden>
          <rect width="40" height="40" rx="8" className="fill-surface-2" />
          <text
            x="20"
            y="26"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            className="fill-muted"
            fontFamily="Georgia, serif"
          >
            {company[0]}
          </text>
        </svg>
      );
  }
}
