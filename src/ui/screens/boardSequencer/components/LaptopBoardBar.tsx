import { useRef, useState } from 'react';
import { SwatchChip } from '../ui/SwatchChip';
import { Button } from '../ui/Button';
import { focusWhenGone } from '../ui/focusNext';
import type { BoardPalette } from '../theme/boardTokens';
import { UNDERLINE_OFF, UNDERLINE_ON } from '../ui/text';
import { describeChannel, ROLE_LABELS, type ColourChannel, type ColourRole } from '../../../../tracking/boardColours';

export interface LaptopBoardBarProps {
  /** The colours with a job: the counters there are to put down. */
  channels: ColourChannel[];
  /** Every colour this device knows, with or without a job. */
  knownColours: number;
  selected: string;
  onSelect(id: string): void;
  count: number;
  onClear(): void;
  onAddColours(): void;
  /** Add one more colour with this job; null when every ready-made colour is in use. */
  onAddColour: ((role: ColourRole) => void) | null;
  palette: BoardPalette;
}

/** The jobs a new laptop colour can be given straight away; the rest are in Set up → Colours. */
const NEW_JOBS: { role: ColourRole; label: string }[] = [
  { role: 'melody', label: 'Melody' },
  { role: 'bass', label: 'Bass' },
  { role: 'chord', label: 'Chords' },
  { role: 'drums', label: 'Drums' },
  { role: 'loop', label: 'Plays a loop' },
];

/**
 * Above the laptop board: which counter a click puts down, how many are down, and a way
 * to clear them. With no colours yet (a laptop that has never seen the board), one button
 * adds four ready-made ones so there is something to play straight away.
 */
export function LaptopBoardBar({
  channels, knownColours, selected, onSelect, count, onClear, onAddColours, onAddColour, palette,
}: LaptopBoardBarProps): JSX.Element {
  const [adding, setAdding] = useState(false);
  // Add four colours goes once they are added: focus goes to the colour a click puts down.
  const pickerRef = useRef<HTMLDivElement>(null);
  if (channels.length === 0) {
    return (
      <div role="group" aria-label="Laptop board" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--bs-fg2)', fontSize: 14, flex: '1 1 240px' }}>
          {knownColours === 0
            ? 'No counter colours yet. Add four to play with now; the real counters can be added later in Set up → Colours.'
            : 'No colour has a job yet. Give one a job in Set up → Colours, or add four ready-made colours.'}
        </span>
        <Button
          // Its own key: without it React reused this button as "+ Add a colour", and focus
          // stayed there, on a button that now did something else.
          key="add-four"
          tone="primary"
          onClick={(e) => {
            onAddColours();
            const radio = (which: string): HTMLElement | null => pickerRef.current?.querySelector<HTMLElement>(which) ?? null;
            void focusWhenGone(() => radio('[aria-checked="true"]') ?? radio('[role="radio"]'), e.currentTarget);
          }}
        >
          Add four colours
        </Button>
      </div>
    );
  }
  return (
    <div role="group" aria-label="Laptop board" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* The colours as words with a dot (L3): the one a click puts down in the text colour,
          underlined; the rest quiet. No chips. */}
      <div ref={pickerRef} role="radiogroup" aria-label="Counter to put down" style={{ display: 'flex', columnGap: 18, flexWrap: 'wrap' }}>
        {channels.map((c, i) => {
          const on = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: 0, minHeight: 'var(--bs-target)',
                borderRadius: 0, border: '1px solid transparent', background: 'transparent',
                color: on ? 'var(--bs-fg)' : 'var(--bs-fg3)', fontWeight: on ? 600 : 500, cursor: 'pointer',
              }}
            >
              <SwatchChip swatch={c.swatch} palette={palette} surface={palette.bg} number={i + 1} size={20} />
              <span data-words="" style={{ borderBottom: on ? UNDERLINE_ON : UNDERLINE_OFF, paddingBottom: 1 }}>{describeChannel(c)}</span>
              <span style={{ fontSize: 14, color: 'var(--bs-fg3)', fontWeight: 500 }}>{ROLE_LABELS[c.role]}</span>
            </button>
          );
        })}
      </div>
      <Button
        tone="quiet"
        aria-expanded={adding}
        onClick={() => setAdding((a) => !a)}
        reason={onAddColour ? null : 'Every ready-made colour is in use.'}
      >
        + Add a colour
      </Button>
      {adding && onAddColour && (
        <div role="group" aria-label="The new colour's job" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', flexBasis: '100%' }}>
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>The new colour plays:</span>
          {NEW_JOBS.map((j) => (
            <Button key={j.role} onClick={() => { onAddColour(j.role); setAdding(false); }}>{j.label}</Button>
          ))}
          <Button tone="quiet" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}
      {/* Just the count, so the bar stays one row and the board gets the room (U4). How to
          place is in its tooltip, in Set up's Ready step and in Help. */}
      <span title="Click a square to put a counter down, click it again to lift it." style={{ fontSize: 14, color: 'var(--bs-fg3)', flex: '0 1 auto', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {`${count} on the board`}
      </span>
      <Button
        // A real button, with an edge: as a quiet one it read as a word (U1). With nothing to
        // clear it is greyed, the reason in its tooltip (U6): as a line under the bar it
        // repeated "0 on the board" beside it, and made the bar two lines.
        tone="secondary"
        disabled={count === 0}
        title={count === 0 ? 'The board is already empty.' : undefined}
        onClick={() => {
          onClear();
          // It turns itself off: focus goes to the colour a click puts down, as Add four
          // colours does, before the button goes (R2-T1-02).
          const radio = (which: string): HTMLElement | null => pickerRef.current?.querySelector<HTMLElement>(which) ?? null;
          (radio('[aria-checked="true"]') ?? radio('[role="radio"]'))?.focus();
        }}
      >
        Clear the board
      </Button>
    </div>
  );
}
