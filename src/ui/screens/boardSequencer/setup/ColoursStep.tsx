import { useState } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Switch } from '../ui/Switch';
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

/** One detected colour, as the results panel needs it. */
export interface DetectedColourCard {
  swatch: string;
  counters: number;
  unsafe: boolean;
  boardMatch: number;
}

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
  /**
   * A colour's JOB is read once, when the engine is built. Changing it while the board is
   * playing left the sound on the old job and the control counters on the new one — a
   * melody colour switched to "Control: reverb" both drove the reverb and went on playing
   * melody. The Instrument and Drum pickers are already stopped for the same reason.
   */
  running: boolean;
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
  /** Find colours is looking at the board right now. */
  finding: boolean;
  onCancelFind(): void;
  /** What it found, for the player to accept or discard. Nothing is saved until they do. */
  found: { colours: DetectedColourCard[]; message: string } | null;
  onUseFound(): void;
  onDiscardFound(): void;
  /** The Hands group: the guards and their plain-language settings. */
  hands: {
    handGuardEnabled: boolean;
    onHandGuardEnabled(on: boolean): void;
    knockGuardEnabled: boolean;
    onKnockGuardEnabled(on: boolean): void;
    handMarginSquares: number;
    onHandMargin(v: number): void;
    intruderSensitivity: number;
    onSensitivity(v: number): void;
    /** "Check my hand": what the colours do under the player's own hand. */
    checking: boolean;
    onCheckHand(): void;
    checkResult: string | null;
  };
}

export function ColoursStep(props: ColoursStepProps): JSX.Element {
  const {
    channels, counts, palette, arming, pending, onFindColours, onArmTap, onCancelArm,
    onAddPending, onDiscardPending, onRecalibrate, onRole, onRemove, onClearAll, isReferenced, running,
    minFilledFraction, readSettingsCustom, onMinFill, onResetReadSettings,
    settleWindowMs, onSettleWindow, onBlackDarkness, picker, onMovePicker, onSampleSquare, hands,
    finding, onCancelFind, found, onUseFound, onDiscardFound,
  } = props;
  const [confirm, setConfirm] = useState<{ kind: 'remove'; id: ColourId } | { kind: 'clear' } | null>(null);
  const [controlOpen, setControlOpen] = useState<ColourId | null>(null);

  const removeTarget = confirm?.kind === 'remove' ? channels.find((c) => c.id === confirm.id) : null;

  return (
    <>
      {finding && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 10,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-accent-muted)',
            border: '1px solid var(--bs-accent)',
          }}
        >
          <span style={{ flex: 1 }}>Hold still — keep hands away from the board.</span>
          <Button tone="secondary" onClick={onCancelFind}>Cancel</Button>
        </div>
      )}
      {!arming && !finding && !found && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button tone="primary" onClick={onFindColours}>Find colours</Button>
          <Button tone="secondary" onClick={onArmTap}>Tap a counter</Button>
        </div>
      )}

      {found && !finding && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)',
            border: '1px solid var(--bs-border-control)',
          }}
        >
          <span role="status">{found.message}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {found.colours.map((c, i) => (
              <span key={`${c.swatch}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={26} />
                <span style={{ fontSize: 12 }}>
                  {`${c.counters} ${c.counters === 1 ? 'counter' : 'counters'}`}
                  <br />
                  <span style={{ color: c.unsafe ? 'var(--bs-warn)' : 'var(--bs-fg2)' }}>
                    {c.unsafe ? 'looks like the board' : 'doesn’t match the board ✓'}
                  </span>
                </span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {found.colours.length > 0 && (
              <Button tone="primary" onClick={onUseFound}>Use these colours</Button>
            )}
            <Button tone="secondary" onClick={onFindColours}>Try again</Button>
            <Button tone="quiet" onClick={onDiscardFound}>Tap a counter instead</Button>
          </div>
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
        const jobReason = running ? 'Stop the board to change what a colour does.' : null;
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
                  disabledReason={jobReason}
                  onClick={() => { onRole(c.id, role); setControlOpen(null); }}
                />
              ))}
              <JobChip
                label={isControl ? `Control: ${ROLE_LABELS[c.role]}` : 'Control…'}
                selected={isControl}
                disabledReason={jobReason}
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
                    disabledReason={jobReason}
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

      <Disclosure summary="Hands">
        <Switch
          label="Ignore hands"
          checked={hands.handGuardEnabled}
          onChange={hands.onHandGuardEnabled}
          hint="Holds the squares your hand is over, so placing a counter adds no stray notes and a covered counter keeps playing."
        />
        <Switch
          label="Keep the pattern if pieces get knocked"
          checked={hands.knockGuardEnabled}
          onChange={hands.onKnockGuardEnabled}
          hint="Knocked pieces keep sounding until you let them go or save them as a loop."
        />
        <Button tone="secondary" onClick={hands.onCheckHand} disabled={hands.checking}>
          {hands.checking ? 'Hold your hand over the board…' : 'Check my hand'}
        </Button>
        {hands.checkResult && (
          <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)' }}>{hands.checkResult}</p>
        )}
        <LabeledSlider
          label="Space around a hand"
          min={25}
          max={200}
          step={5}
          value={Math.round(hands.handMarginSquares * 100)}
          display={`${hands.handMarginSquares.toFixed(2)} squares`}
          onChange={(v) => hands.onHandMargin(v / 100)}
        />
        <LabeledSlider
          label="Hand sensitivity"
          min={8}
          max={40}
          value={hands.intruderSensitivity}
          display={String(hands.intruderSensitivity)}
          onChange={hands.onSensitivity}
        />
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

function JobChip(
  { label, selected, onClick, disabledReason = null }:
  { label: string; selected: boolean; onClick(): void; disabledReason?: string | null },
): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabledReason !== null}
      title={disabledReason ?? undefined}
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
