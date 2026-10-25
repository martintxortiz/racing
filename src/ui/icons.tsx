/** 16px stroke icons. */
type P = { size?: number };
const S = ({ size = 16, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const IconPlus = (p: P) => <S {...p}><path d="M8 3v10M3 8h10" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M4 4l8 8M12 4l-8 8" /></S>;
export const IconChevron = (p: P) => <S {...p}><path d="M4.5 6.5L8 10l3.5-3.5" /></S>;
export const IconChevronRight = (p: P) => <S {...p}><path d="M6.5 4.5L10 8l-3.5 3.5" /></S>;
export const IconPlay = (p: P) => <S {...p}><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></S>;
export const IconPause = (p: P) => <S {...p}><path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={2} /></S>;
export const IconPrev = (p: P) => <S {...p}><path d="M4 3.5v9M12 3.5v9L6 8z" /></S>;
export const IconNext = (p: P) => <S {...p}><path d="M12 3.5v9M4 3.5v9L10 8z" /></S>;
export const IconSun = (p: P) => <S {...p}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z" /></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="8" cy="8" r="2" /><path d="M8 1.8l1.2 1.6 2-.3.6 1.9 1.8.9-.6 1.9.6 1.9-1.8.9-.6 1.9-2-.3L8 14.2l-1.2-1.6-2 .3-.6-1.9-1.8-.9.6-1.9-.6-1.9 1.8-.9.6-1.9 2 .3z" /></S>;
export const IconFolder = (p: P) => <S {...p}><path d="M2 4.5h4l1.5 1.5H14v6.5H2z" /></S>;
export const IconLayout = (p: P) => <S {...p}><rect x="2" y="2.5" width="12" height="11" rx="1" /><path d="M7 2.5v11M7 8h7" /></S>;
export const IconMore = (p: P) => <S {...p}><circle cx="3.5" cy="8" r=".6" fill="currentColor" /><circle cx="8" cy="8" r=".6" fill="currentColor" /><circle cx="12.5" cy="8" r=".6" fill="currentColor" /></S>;
export const IconMaximize = (p: P) => <S {...p}><path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" /></S>;
export const IconMinimize = (p: P) => <S {...p}><path d="M6 3v3H3M13 6h-3V3M10 13v-3h3M3 10h3v3" /></S>;
export const IconSplitH = (p: P) => <S {...p}><rect x="2" y="2.5" width="12" height="11" rx="1" /><path d="M8 2.5v11" /></S>;
export const IconUpload = (p: P) => <S {...p}><path d="M8 10.5V3M5 6l3-3 3 3M3 10.5v2.5h10v-2.5" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M3.5 8.5l3 3 6-7" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></S>;
export const IconGrip = (p: P) => <S {...p}><path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" strokeWidth={2} /></S>;
export const IconServer = (p: P) => <S {...p}><rect x="2.5" y="2.5" width="11" height="4.5" rx="1" /><rect x="2.5" y="9" width="11" height="4.5" rx="1" /><path d="M5 4.75h.01M5 11.25h.01" strokeWidth={2} /></S>;
export const IconLive = (p: P) => <S {...p}><circle cx="8" cy="8" r="2" fill="currentColor" /><path d="M4.5 4.5a5 5 0 000 7M11.5 4.5a5 5 0 010 7" /></S>;
export const IconDownload = (p: P) => <S {...p}><path d="M8 3v7.5M5 7.5l3 3 3-3M3 13h10" /></S>;
