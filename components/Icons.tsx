export const Logo = ({ className = "brand-mark" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="currentColor" />
    <path d="M8 22V14M14 22V9M20 22v-6M26 22V12" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

export const MetaLogo = () => (
  <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#0866FF" d="M6.9 5C4.1 5 2 8.6 2 12.7 2 15.6 3.4 18 5.8 18c1.7 0 3-1.2 4.9-4.4l1.3-2.2.3.5c1.9 3.4 3.4 6.1 6.1 6.1 2.6 0 3.6-2.4 3.6-5.3C22 8.6 20 5 17.1 5c-1.7 0-3 1.3-4.4 3.4L12 9.5l-.6-1C10 6.3 8.6 5 6.9 5Zm.2 2.6c1 0 1.9 1 3.4 3.4-1.9 3-2.9 4.3-4.1 4.3-1 0-1.6-1-1.6-2.8 0-2.8 1-4.9 2.3-4.9Zm10 0c1.3 0 2.3 2.2 2.3 5 0 1.6-.6 2.6-1.6 2.6-1.2 0-2-1.2-4.2-5.1 1.4-2 2.4-2.5 3.5-2.5Z" />
  </svg>
);

export const GoogleAdsLogo = () => (
  <svg className="platform-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#FBBC04" d="M3.3 16.4 9.4 5.8a3.6 3.6 0 0 1 6.2 3.6L9.5 20a3.6 3.6 0 0 1-6.2-3.6Z" />
    <path fill="#4285F4" d="M20.7 16.4 14.6 5.8a3.6 3.6 0 1 0-6.2 3.6L14.5 20a3.6 3.6 0 0 0 6.2-3.6Z" />
    <circle cx="6.4" cy="18.2" r="3.6" fill="#34A853" />
  </svg>
);

export const AlertIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M8 1.75 14.75 13.5H1.25L8 1.75Z" strokeLinejoin="round" />
    <path d="M8 6v3.5M8 11.25v.25" strokeLinecap="round" />
  </svg>
);

export const InfoIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25V11M8 5v.25" strokeLinecap="round" />
  </svg>
);

export const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" />
    <path d="m5.5 8 1.75 1.75L10.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg className={spinning ? "spin" : undefined} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
