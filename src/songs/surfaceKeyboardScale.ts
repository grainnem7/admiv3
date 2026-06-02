/**
 * surfaceKeyboardScale — map a tube's left→right index to a pitch for the
 * standalone Surface Keyboard mode (no backing song / no chord lock).
 *
 * Tubes ascend through the **major pentatonic** scale: any combination of
 * tubes sounds consonant together, so there are no "wrong" notes — the most
 * forgiving mapping for free play. After five tubes it wraps up an octave.
 */

/** Major pentatonic semitone offsets within an octave: C D E G A. */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;

/**
 * MIDI note for the tube at `index` (0 = leftmost), starting from `baseMidi`
 * (default C4 = 60) and ascending through the major pentatonic, wrapping up
 * an octave every five tubes.
 */
export function pentatonicMidiForTube(index: number, baseMidi = 60): number {
  const n = MAJOR_PENTATONIC.length;
  const octave = Math.floor(index / n);
  const degree = ((index % n) + n) % n; // safe for negative indices
  return baseMidi + octave * 12 + MAJOR_PENTATONIC[degree];
}
