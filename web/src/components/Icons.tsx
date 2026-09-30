type P = { size?: number };
const svg = (size: number, children: React.ReactNode, stroke = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IconMenu = ({ size = 22 }: P) => svg(size, <><path d="M7 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" /><path d="M9 13v8" /><path d="M16.5 21V3c-1.9 1-3 3.2-3 6v4h3" /></>);
export const IconClock = ({ size = 22 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconPlus = ({ size = 22 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>);
export const IconUser = ({ size = 22 }: P) => svg(size, <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
export const IconBack = ({ size = 22 }: P) => svg(size, <path d="m15 5-7 7 7 7" />, 2);
export const IconChevron = ({ size = 16 }: P) => svg(size, <path d="m9 6 6 6-6 6" />, 2);
export const IconClose = ({ size = 20 }: P) => svg(size, <path d="M6 6l12 12M18 6 6 18" />, 2);
export const IconCheck = ({ size = 14 }: P) => svg(size, <path d="m5 12 5 5 9-10" />, 2.6);
export const IconLock = ({ size = 22 }: P) => svg(size, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconImage = ({ size = 24 }: P) => svg(size, <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>, 1.6);
export const IconDoc = ({ size = 20 }: P) => svg(size, <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h4" /></>);
export const IconHelp = ({ size = 20 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" /><path d="M12 17.5h.01" /></>);
export const IconLogout = ({ size = 20 }: P) => svg(size, <><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h9" /></>);
export const IconTrash = ({ size = 20 }: P) => svg(size, <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
export const IconPencil = ({ size = 14 }: P) => svg(size, <path d="M4 20h4L19 9l-4-4L4 16z" />);
export const IconSearch = ({ size = 18 }: P) => svg(size, <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, 2);
