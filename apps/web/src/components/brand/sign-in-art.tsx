/** The sign-in illustration: an open book on a stack of books, with floating notes. Tokens only. */
export function SignInArt() {
  return (
    <svg
      role="img"
      aria-label="An open book on a stack of books, with floating notes"
      viewBox="0 0 480 400"
      className="h-auto w-full max-w-md"
    >
      <circle cx="240" cy="210" r="168" className="fill-accent-100" />
      <circle cx="240" cy="210" r="118" className="fill-surface opacity-60" />

      <rect x="60" y="86" width="96" height="60" rx="10" className="fill-surface stroke-line" />
      <circle cx="80" cy="106" r="7" className="fill-accent" />
      <rect x="94" y="102" width="46" height="8" rx="4" className="fill-line" />
      <rect x="74" y="122" width="68" height="7" rx="3.5" className="fill-subtle" />

      <rect x="338" y="62" width="96" height="60" rx="10" className="fill-surface stroke-line" />
      <rect x="354" y="80" width="52" height="8" rx="4" className="fill-line" />
      <rect x="354" y="96" width="64" height="7" rx="3.5" className="fill-subtle" />
      <circle cx="418" cy="82" r="6" className="fill-accent-100" />

      <circle cx="410" cy="186" r="10" className="fill-accent" />
      <circle cx="68" cy="212" r="7" className="fill-accent/40" />
      <circle cx="108" cy="52" r="5" className="fill-accent" />

      <rect x="90" y="322" width="300" height="42" rx="8" className="fill-fg" />
      <rect x="90" y="336" width="300" height="5" className="fill-accent" />
      <rect x="112" y="276" width="256" height="42" rx="8" className="fill-accent" />
      <rect x="112" y="290" width="256" height="5" className="fill-accent-100" />
      <rect x="132" y="230" width="216" height="42" rx="8" className="fill-surface stroke-line-strong" />
      <rect x="132" y="244" width="216" height="5" className="fill-line" />

      <path
        d="M236 152C196 122 140 122 100 136V214C140 200 196 200 236 228Z"
        className="fill-surface stroke-line-strong"
      />
      <path
        d="M244 152C284 122 340 122 380 136V214C340 200 284 200 244 228Z"
        className="fill-accent-50 stroke-line-strong"
      />
      <rect x="120" y="156" width="82" height="7" rx="3.5" className="fill-line" />
      <rect x="120" y="171" width="68" height="7" rx="3.5" className="fill-subtle" />
      <rect x="120" y="186" width="76" height="7" rx="3.5" className="fill-subtle" />
      <rect x="278" y="156" width="82" height="7" rx="3.5" className="fill-accent-100" />
      <rect x="278" y="171" width="68" height="7" rx="3.5" className="fill-accent-100" />
      <rect x="278" y="186" width="76" height="7" rx="3.5" className="fill-accent-100" />
      <path d="M326 126V160L338 150L350 160V130Z" className="fill-accent" />
    </svg>
  );
}
