/**
 * Timbo's logo: Tim's red cap, seen from the side (crown, peak and the button on top), no
 * words. One drawing for every size, from the 16 px browser tab to the Welcome screen;
 * public/favicon.svg is a copy of it (CapLogo.test.tsx checks they match).
 */
import { CAP_RED } from '../screens/boardSequencer/theme/boardTokens';

export const CAP_LOGO_SHAPES = {
  viewBox: '0 0 32 32',
  paths: [
    // The crown: high at the front, sloping to the back.
    'M1.5 20.6C1.5 12.4 7.4 6.6 14.6 6.6C21.6 6.6 25.8 11.8 25.4 18.6L25 22.6C17 21 9 20.4 1.5 20.6Z',
    // The peak, curving forward and down.
    'M14 22.8C20.6 21.9 26.8 23.3 30.8 26.5C31.4 27 31 27.9 30.3 27.7C25 26.3 19.6 25.9 14.4 26.2C13.4 26.2 13 22.9 14 22.8Z',
  ],
  /** The button on top. */
  button: { x: 13, y: 4.4, width: 3.2, height: 2.6, rx: 1.1 },
} as const;

export interface CapLogoProps {
  /** Width and height, in pixels. */
  size: number;
  /** Hidden from screen readers, where the word Timbo is right beside it. */
  decorative?: boolean;
  className?: string;
}

export function CapLogo({ size, decorative = false, className }: CapLogoProps): JSX.Element {
  const b = CAP_LOGO_SHAPES.button;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={CAP_LOGO_SHAPES.viewBox}
      fill={CAP_RED}
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Timbo' })}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {CAP_LOGO_SHAPES.paths.map((d) => <path key={d} d={d} />)}
      <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={b.rx} />
    </svg>
  );
}
