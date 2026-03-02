/**
 * ADMIv3 Icon Set
 *
 * Minimal icon set for the design system.
 * All icons are 20x20 by default, using currentColor.
 */

import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const defaultProps = {
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconHome({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 10.5L10 4l7 6.5" />
      <path d="M5 9v7a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V9" />
    </svg>
  );
}

export function IconPlay({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M6 4.5v11l9-5.5-9-5.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M6 4h2v12H6V4zm6 0h2v12h-2V4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStop({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="5" y="5" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconRecord({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2m0 10v2M3 10h2m10 0h2M5.05 5.05l1.41 1.41m7.08 7.08l1.41 1.41M5.05 14.95l1.41-1.41m7.08-7.08l1.41-1.41" />
    </svg>
  );
}

export function IconVolume({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 8v4h3l4 4V4L6 8H3z" />
      <path d="M13 7.5a3 3 0 010 5M15 5.5a6 6 0 010 9" />
    </svg>
  );
}

export function IconVolumeMute({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 8v4h3l4 4V4L6 8H3z" />
      <path d="M13 8l4 4m0-4l-4 4" />
    </svg>
  );
}

export function IconMicrophone({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="7" y="2" width="6" height="10" rx="3" />
      <path d="M4 10a6 6 0 0012 0M10 16v2" />
    </svg>
  );
}

export function IconCamera({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="2" y="5" width="16" height="11" rx="2" />
      <circle cx="10" cy="10.5" r="3" />
      <path d="M7 5V4a1 1 0 011-1h4a1 1 0 011 1v1" />
    </svg>
  );
}

export function IconHand({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 18v-6m0 0V7.5a1.5 1.5 0 013 0V12m-3 0V6a1.5 1.5 0 00-3 0v6m0 0V5.5a1.5 1.5 0 00-3 0v7.5a6 6 0 0012 0V8.5a1.5 1.5 0 00-3 0V12" />
    </svg>
  );
}

export function IconBody({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="4" r="2" />
      <path d="M10 8v5m0 0l-3 5m3-5l3 5M6 10h8" />
    </svg>
  );
}

export function IconFace({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="7.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <path d="M7 13a3 3 0 006 0" />
    </svg>
  );
}

export function IconMusic({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M8 17a2 2 0 100-4 2 2 0 000 4zM8 13V4l8-2v11" />
      <circle cx="14" cy="13" r="2" />
    </svg>
  );
}

export function IconWaveform({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M2 10h2M6 6v8M10 3v14M14 6v8M18 10h-2" />
    </svg>
  );
}

export function IconSliders({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M4 4v12M10 4v12M16 4v12" />
      <circle cx="4" cy="8" r="2" fill="currentColor" />
      <circle cx="10" cy="14" r="2" fill="currentColor" />
      <circle cx="16" cy="6" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconMapping({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="5" cy="5" r="2" />
      <circle cx="5" cy="15" r="2" />
      <circle cx="15" cy="10" r="2" />
      <path d="M7 5h4a2 2 0 012 2v1m-6 7h4a2 2 0 002-2v-1" />
    </svg>
  );
}

export function IconCalibrate({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2" />
    </svg>
  );
}

export function IconPreset({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

export function IconMonitor({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="2" y="3" width="16" height="11" rx="2" />
      <path d="M7 17h6M10 14v3" />
    </svg>
  );
}

export function IconMidi({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="2" y="5" width="16" height="10" rx="2" />
      <circle cx="6" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="14" cy="10" r="1.5" />
    </svg>
  );
}

export function IconChevronRight({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

export function IconChevronDown({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M4 7l6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M13 4l-6 6 6 6" />
    </svg>
  );
}

export function IconX({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function IconPlus({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconMinus({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M4 10h12" />
    </svg>
  );
}

export function IconCheck({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M4 10l4 4 8-8" />
    </svg>
  );
}

export function IconWarning({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 3L2 17h16L10 3z" />
      <path d="M10 8v4M10 14v1" />
    </svg>
  );
}

export function IconInfo({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5M10 6v1" />
    </svg>
  );
}

export function IconSave({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M5 3h10l2 2v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h1" />
      <rect x="6" y="11" width="8" height="6" />
      <path d="M7 3v4h5V3" />
    </svg>
  );
}

export function IconUpload({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 3v10M6 7l4-4 4 4M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
    </svg>
  );
}

export function IconDownload({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 3v10M6 9l4 4 4-4M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
    </svg>
  );
}

export function IconRefresh({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 10a7 7 0 0113.6-2.3M17 10a7 7 0 01-13.6 2.3" />
      <path d="M17 4v4h-4M3 16v-4h4" />
    </svg>
  );
}

export function IconPanic({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M10 2v6M10 12v6" />
      <circle cx="10" cy="10" r="8" />
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}

export function IconExpand({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 7V4a1 1 0 011-1h3M13 3h3a1 1 0 011 1v3M17 13v3a1 1 0 01-1 1h-3M7 17H4a1 1 0 01-1-1v-3" />
    </svg>
  );
}

export function IconCollapse({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M7 3v3a1 1 0 01-1 1H3M13 3v3a1 1 0 001 1h3M17 13h-3a1 1 0 00-1 1v3M3 13h3a1 1 0 011 1v3" />
    </svg>
  );
}

export function IconMenu({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

export function IconDrag({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="7" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconZone({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="7" strokeDasharray="4 2" />
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}

export function IconGesture({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M6 14c-2-2-2-5 0-7s5-2 7 0M10 10l4 4" />
      <circle cx="10" cy="10" r="2" />
    </svg>
  );
}

export function IconEffects({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <path d="M3 10c0-4 3-7 7-7s7 3 7 7-3 7-7 7" />
      <path d="M7 10a3 3 0 016 0 3 3 0 01-6 0z" />
    </svg>
  );
}

export function IconSequencer({ size = 20, ...props }: IconProps) {
  return (
    <svg {...defaultProps} width={size} height={size} viewBox="0 0 20 20" {...props}>
      <rect x="2" y="4" width="3" height="12" rx="0.5" />
      <rect x="6" y="8" width="3" height="8" rx="0.5" />
      <rect x="10" y="6" width="3" height="10" rx="0.5" />
      <rect x="14" y="4" width="3" height="12" rx="0.5" />
    </svg>
  );
}
