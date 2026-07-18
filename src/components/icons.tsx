// Lucide icon paths, 24x24 viewBox, consistent sizing.
type IconProps = { className?: string };

function Svg({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const IconGauge = (p: IconProps) => (
  <Svg {...p} d="m12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0 M2 12h2 M20 12h2" />
);
export const IconUser = (p: IconProps) => (
  <Svg {...p} d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
);
export const IconBriefcase = (p: IconProps) => (
  <Svg {...p} d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16 M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
);
export const IconInbox = (p: IconProps) => (
  <Svg {...p} d="M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
);
export const IconStore = (p: IconProps) => (
  <Svg {...p} d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7 M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4 M2 7h20 M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
);
export const IconMail = (p: IconProps) => (
  <Svg {...p} d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M2 5h20v14H2z" />
);
export const IconZap = (p: IconProps) => (
  <Svg {...p} d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p} d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.3-4.3" />
);
export const IconCheck = (p: IconProps) => <Svg {...p} d="M20 6 9 17l-5-5" />;
export const IconX = (p: IconProps) => <Svg {...p} d="M18 6 6 18 M6 6l12 12" />;
export const IconSend = (p: IconProps) => (
  <Svg {...p} d="M14.54 9.46 3.71 20.29 M20.33 3.67a1 1 0 0 0-1.05-.23L3.36 9.08a1 1 0 0 0 .06 1.9l7.1 2.14a1 1 0 0 1 .66.66l2.14 7.1a1 1 0 0 0 1.9.06l5.64-15.92a1 1 0 0 0-.23-1.05z" />
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12" />
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p} d="M3 12a9 9 0 0 1 15.36-6.36L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15.36 6.36L3 16 M3 21v-5h5" />
);
export const IconLink = (p: IconProps) => (
  <Svg {...p} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
);
