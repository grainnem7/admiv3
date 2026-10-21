/**
 * The named steps the Sound tab offers instead of sliders (Soft, Medium, Loud, Full…).
 * Shared by the Sound tab and by MIDI out, so Ableton's macros move in the same steps the
 * player chooses.
 */

export interface Step { label: string; value: number }

export const LOUD: Step[] = [{ label: 'Soft', value: 0.4 }, { label: 'Medium', value: 0.65 }, { label: 'Loud', value: 0.85 }, { label: 'Full', value: 1 }];
export const BRIGHT: Step[] = [{ label: 'Dark', value: 0.3 }, { label: 'Warm', value: 0.55 }, { label: 'Clear', value: 0.8 }, { label: 'Bright', value: 1 }];
export const SPACE_SEND: Step[] = [{ label: 'Dry', value: 0 }, { label: 'Room', value: 0.15 }, { label: 'Hall', value: 0.3 }, { label: 'Huge', value: 0.5 }];
export const ENERGY: Step[] = [{ label: 'Calm', value: 0.2 }, { label: 'Steady', value: 0.5 }, { label: 'Lively', value: 0.75 }, { label: 'Driving', value: 1 }];
export const SPACE_ALL: Step[] = [{ label: 'Dry', value: 0.1 }, { label: 'Natural', value: 0.5 }, { label: 'Roomy', value: 0.75 }, { label: 'Huge', value: 1 }];

/** The step nearest a stored value, so a value set elsewhere still lights a step. */
export function nearest(steps: readonly Step[], v: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i].value - v) < Math.abs(steps[best].value - v)) best = i;
  return best;
}

/** A value as its step, spread over 0 to 127: four steps are 0, 42, 85, 127. */
export function stepCc(steps: readonly Step[], v: number): number {
  if (steps.length < 2) return 127;
  return Math.round((nearest(steps, v) / (steps.length - 1)) * 127);
}
