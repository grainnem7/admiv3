import { useState } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { LabeledSlider } from '../ui/LabeledSlider';
import { SwatchChip } from '../ui/SwatchChip';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { BoardPalette } from '../theme/boardTokens';
import {
  describeChannel, FADER_ROLES, ROLE_LABELS, TOGGLE_ROLES,
  type ColourChannel, type ColourId, type ColourRole,
} from '../../../../tracking/boardColours';

/** The jobs offered as chips; Control… opens the fader and toggle roles. */
const MAIN_JOBS: ColourRole[] = ['melody', 'bass', 'drums', 'chord', 'off'];
const CONTROL_JOBS: ColourRole[] = [...FADER_ROLES, ...TOGGLE_ROLES];

export interface PendingColour {
  hex: string;
  h: number;
  s: number;
  v: number;
  kindLabel: string;
}

export interface ColoursStepProps {
  channels: ColourChannel[];
  counts: Partial<Record<ColourId, number>>;
  palette: BoardPalette;
  /** Armed picker: adding a new colour, or recalibrating an existing one. */
  arming: { mode: 'new' } | { mode: 'recal'; id: ColourId } | null;
  pending: PendingColour | null;
  onFindColours(): void;
  onArmTap(): void;
  onCancelArm(): void;
  onAddPending(): void;
  onDiscardPending(): void;
  onRecalibrate(id: ColourId): void;
  onRole(id: ColourId, role: ColourRole): void;
  onRemove(id: ColourId): void;
  onClearAll(): void;
  /** True when saved pages or loops reference this colour, for the confirmation wording. */
  isReferenced(id: ColourId): boolean;
  minFilledFraction: number;
  readSettingsCustom: boolean;
  onMinFill(value: number): void;
  onResetReadSettings(): void;
  settleWindowMs: number;
  onSettleWindow(ms: number): void;
  onBlackDarkness(id: ColourId, maxValue: number): void;
  /** The square picker, for players who can't point at the video. */
  picker: { row: number; col: number } | null;
  onMovePicker(dRow: number, dCol: number): void;
  onSampleSquare(): void;
}

export function ColoursStep(props: ColoursStepProps): JSX.Element {
  const {
    channels, counts, palette, arming, pending, onFindColours, onArmTap, onCancelArm,
    onAddPending, onDiscardPending, onRecalibrate, onRole, onRemove, onClearAll, isReferenced,
    minFilledFraction, readSettingsCustom, onMinFill, onResetReadSettings,
    settleWindowMs, onSettleWindow, onBlackDarkness, picker, onMovePicker, onSampleSquare,
  } = props;
  const [confirm, setConfirm] = useState<{ kind: 'remove'; id: ColourId } | { kind: 'clear' } | null>(null);
  const [controlOpen, setControlOpen] = useState<ColourId | null>(null);

  const removeTarget = confirm?.kind === 'remove' ? channels.find((c) => c.id === confirm.id) : null;

  return (
    <>
      {!arming && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button tone="primary" onClick={onFindColours}>Find colours</Button>
          <Button tone="secondary" onClick={onArmTap}>Tap a counter</Button>
        </div>
      )}

      {arming && !pending && (
        <div
          role="status"
          style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-accent-muted)',
            border: '1px solid var(--bs-accent)',
          }}
        >
          <span>
            {arming.mode === 'new' ? 'Tap a counter to add its colour' : 'Tap that counter again to recalibrate it'}
          </span>
          {/* Pick a square: the same job with no pointer at all. */}
          {picker && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span aria-live="polite">{`Row ${picker.row + 1}, column ${picker.col + 1}`}</span>
              <Button tone="secondary" aria-label="Move the square left" onClick={() => onMovePicker(0, -1)}>◀</Button>
              <Button tone="secondary" aria-label="Move the square up" onClick={() => onMovePicker(-1, 0)}>▲</Button>
              <Button tone="secondary" aria-label="Move the square down" onClick={() => onMovePicker(1, 0)}>▼</Button>
              <Button tone="secondary" aria-label="Move the square right" onClick={() => onMovePicker(0, 1)}>▶</Button>
              <Button tone="primary" onClick={onSampleSquare}>Sample this square</Button>
            </div>
          )}
          <Button tone="quiet" onClick={onCancelArm}>Cancel</Button>
        </div>
      )}

      {pending && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 10,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)',
            border: '1px solid var(--bs-border-control)',
          }}
        >
          <SwatchChip swatch={pending.hex} palette={palette} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{pending.kindLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>Nothing is saved until you press Add.</div>
          </div>
          <Button tone="primary" onClick={onAddPending}>Add</Button>
          <Button tone="secondary" onClick={onDiscardPending}>Try again</Button>
        </div>
      )}

      {channels.length === 0 && !arming && (
        <p style={{ margin: 0, color: 'var(--bs-fg2)' }}>
          No colours yet. Put one of each counter on the board, then add them one at a time.
        </p>
      )}

      {channels.map((c, i) => {
        const count = counts[c.id] ?? 0;
        const isControl = CONTROL_JOBS.includes(c.role);
        return (
          <div
            key={c.id}
            aria-label={`${i + 1}, ${describeChannel(c)}, ${count} on board`}
            style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
              borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)',
              border: '1px solid var(--bs-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{describeChannel(c)}</div>
                <div style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{`${count} on board`}</div>
              </div>
              <Button tone="secondary" aria-label={`Recalibrate ${describeChannel(c)}`} onClick={() => onRecalibrate(c.id)}>
                <span aria-hidden="true">⟳</span>
              </Button>
              <Button tone="quiet" aria-label={`Remove ${describeChannel(c)}`} onClick={() => setConfirm({ kind: 'remove', id: c.id })}>
                <span aria-hidden="true">×</span>
              </Button>
            </div>

            <div role="radiogroup" aria-label={`Job for ${describeChannel(c)}`} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {MAIN_JOBS.map((role) => (
                <JobChip
                  key={role}
                  label={role === 'off' ? 'Off (not used)' : ROLE_LABELS[role]}
                  selected={c.role === role}
                  onClick={() => { onRole(c.id, role); setControlOpen(null); }}
                />
              ))}
              <JobChip
                label={isControl ? `Control: ${ROLE_LABELS[c.role]}` : 'Control…'}
                selected={isControl}
                onClick={() => setControlOpen((id) => (id === c.id ? null : c.id))}
              />
            </div>

            {(controlOpen === c.id || isControl) && (
              <div role="radiogroup" aria-label={`Control job for ${describeChannel(c)}`} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {CONTROL_JOBS.map((role) => (
                  <JobChip
                    key={role}
                    label={ROLE_LABELS[role]}
                    selected={c.role === role}
                    onClick={() => onRole(c.id, role)}
                  />
                ))}
              </div>
            )}

            {c.kind === 'black' && (
              <LabeledSlider
                label="Black darkness"
                min={10}
                max={70}
                value={c.blackBand?.maxValue ?? 45}
                display={String(c.blackBand?.maxValue ?? 45)}
                onChange={(v) => onBlackDarkness(c.id, v)}
              />
            )}
          </div>
        );
      })}

      {channels.length > 0 && (
        <Button tone="quiet" onClick={() => setConfirm({ kind: 'clear' })}>Clear all colours</Button>
      )}

      <Disclosure summary="Detection sensitivity">
        <LabeledSlider
          label="Piece coverage"
          min={3}
          max={50}
          value={Math.round(minFilledFraction * 100)}
          display={`${Math.round(minFilledFraction * 100)}%`}
          onChange={(v) => onMinFill(v / 100)}
        />
        {readSettingsCustom && (
          <Button tone="secondary" onClick={onResetReadSettings}>Reset to suggested</Button>
        )}
        <LabeledSlider
          label="Settle time"
          min={100}
          max={2000}
          step={50}
          value={settleWindowMs}
          display={`${settleWindowMs} ms`}
          onChange={onSettleWindow}
        />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)' }}>Settle time takes effect once you are playing.</p>
      </Disclosure>

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${describeChannel(removeTarget)}?`}
          body={[
            'It is removed for every player on this board.',
            isReferenced(removeTarget.id)
              ? `Saved loops and pages that use ${describeChannel(removeTarget)} will go quiet.`
              : '',
          ].filter(Boolean).join(' ')}
          confirmLabel="Remove"
          onConfirm={() => { onRemove(removeTarget.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'clear' && (
        <ConfirmDialog
          title="Clear all colours?"
          body="Every colour is removed for every player on this board. Saved loops and pages that use them will go quiet."
          confirmLabel="Clear all"
          onConfirm={() => { onClearAll(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function JobChip({ label, selected, onClick }: { label: string; selected: boolean; onClick(): void }): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={{
        minHeight: 'var(--bs-target)',
        borderRadius: 999,
        padding: '0 14px',
        background: selected ? 'var(--bs-accent)' : 'var(--bs-elev)',
        color: selected ? 'var(--bs-accent-fg)' : 'var(--bs-fg)',
        borderColor: selected ? 'var(--bs-accent)' : 'var(--bs-border-control)',
        borderWidth: selected ? 2 : 1,
        fontWeight: selected ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}
