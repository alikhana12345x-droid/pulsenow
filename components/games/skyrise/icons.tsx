import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function ChevronLeftIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function UsersIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" stroke="currentColor" strokeWidth="2" />
      <path d="M4.5 21a7.5 7.5 0 0115 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BoltIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M13 2L4 14h7l-1 8 10-13h-7l0-7z" fill="currentColor" />
    </svg>
  );
}

export function WalletIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M4 7.5A2.5 2.5 0 016.5 5H19a1 1 0 011 1v3H6.5A2.5 2.5 0 014 6.5v11A2.5 2.5 0 006.5 20H20a1 1 0 001-1v-9a1 1 0 00-1-1H6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 14h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function RocketGlyph({ size = 44, className = "", ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} {...props}>
      <path d="M35.8 7.7c8.7-3 17.8-1 17.8-1s2 9.1-1 17.8C49.2 34.3 40 43.4 28 48L16 36C20.6 24 25.7 11.1 35.8 7.7z" fill="currentColor" />
      <path d="M20.5 41.5L11 45l3.5-9.5M28.5 49.5L25 59l9.5-3.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="41" cy="20" r="6" fill="#090814" />
      <path d="M17 47c-4 1.2-7 4.2-9 9 4.8-2 7.8-5 9-9z" fill="#f97316" />
    </svg>
  );
}
