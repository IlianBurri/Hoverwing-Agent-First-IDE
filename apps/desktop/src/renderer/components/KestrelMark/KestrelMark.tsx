interface KestrelMarkProps {
  className?: string | undefined;
}

/** Simple abstract wing mark; uses currentColor. */
export function KestrelMark({ className }: KestrelMarkProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M6 30C14 18 24 12 42 10C34 16 30 22 28 30C24 26 16 26 6 30Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M28 30C27 34 25 37 22 39C24 35 24 32 23 29Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
