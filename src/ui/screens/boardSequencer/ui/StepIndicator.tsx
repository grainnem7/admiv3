import type { StepIndicator as StepState } from '../boardSetupFlow';

export interface StepIndicatorItem<T extends string> {
  id: T;
  label: string;
  state: StepState;
}

export interface StepIndicatorProps<T extends string> {
  steps: StepIndicatorItem<T>[];
  onOpen(id: T): void;
  canOpen(id: T): boolean;
}

/** The glyph and word for each state — a tick is never the only signal. */
const MARK: Record<StepState, { glyph: string; word: string }> = {
  done: { glyph: '✓', word: 'done' },
  warning: { glyph: '!', word: 'needs a look' },
  current: { glyph: '●', word: 'current step' },
  todo: { glyph: '○', word: 'still to do' },
  pending: { glyph: '…', word: 'starting' },
};

const COLOUR: Record<StepState, string> = {
  done: 'var(--bs-ok)',
  warning: 'var(--bs-warn)',
  current: 'var(--bs-accent)',
  todo: 'var(--bs-fg3)',
  pending: 'var(--bs-fg3)',
};

export function StepIndicator<T extends string>({ steps, onOpen, canOpen }: StepIndicatorProps<T>): JSX.Element {
  return (
    <ol style={{ display: 'flex', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((s, i) => {
        const mark = MARK[s.state];
        const open = canOpen(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.state === 'current' ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${steps.length}: ${s.label}, ${mark.word}`}
              disabled={!open}
              onClick={() => onOpen(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                minHeight: 'var(--bs-target)',
                background: s.state === 'current' ? 'var(--bs-elev)' : 'transparent',
                borderColor: s.state === 'current' ? 'var(--bs-accent)' : 'transparent',
                color: 'var(--bs-fg)',
              }}
            >
              <span aria-hidden="true" style={{ color: COLOUR[s.state], fontWeight: 700 }}>{mark.glyph}</span>
              <span aria-hidden="true">{`${i + 1}. ${s.label}`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
