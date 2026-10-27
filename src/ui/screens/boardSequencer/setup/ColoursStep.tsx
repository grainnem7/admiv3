import { useState } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Switch } from '../ui/Switch';
import { LabeledSlider } from '../ui/LabeledSlider';
import { SwatchChip } from '../ui/SwatchChip';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { BoardPalette } from '../theme/boardTokens';
import { describeChannel, type ColourChannel, type ColourId, type ColourRole } from '../../../../tracking/boardColours';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { ColourTable } from '../play/ColourTable';
import type { ChannelSoundPatch } from '../play/SoundTab';


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
  /** True when this colour can't be told apart from the board itself. */
  unsafe?: boolean;
  /** Share (0–1) of the tapped counter's pixels its band recognises. */
  keeps?: number;
}

export interface ColoursStepProps {
  channels: ColourChannel[];
  counts: Partial<Record<ColourId, number>>;
  palette: BoardPalette;
  /** Armed picker: adding a new colour, or recalibrating an existing one. */
  arming: { mode: 'new' } | { mode: 'recal'; id: ColourId } | null;
  pending: PendingColour | null;
  /** Whether the empty board has been learnt; 0 means colour checks have less to go on. */
  boardLearnt: number;
  /** Learn the empty board from here, without going back a step. */
  onLearnBoard(): void;
  /** What happened the last time it tried ("Learnt from 64 squares", or why it refused). */
  learnMessage: string | null;
  onFindColours(): void;
  onArmTap(): void;
  onCancelArm(): void;
  onAddPending(): void;
  onDiscardPending(): void;
  onRecalibrate(id: ColourId): void;
  onRole(id: ColourId, role: ColourRole): void;
  /** The whole config, for the colour table (sounds, world, loop names). */
  config: BoardSequencerStored;
  setChannelSound(id: string, patch: ChannelSoundPatch): void;
  onHear(c: ColourChannel): void;
  /** The colour whose ▶ Hear is loading, or null. */
  hearing: string | null;
  /** What Hear is doing for one colour, shown on its row. */
  hearNote?: { id: string; text: string } | null;
  /** For the "Plays a loop" job: which saved loop this colour's counter plays. */
  onLoopSlot(id: ColourId, slot: number): void;
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
  /** How tall the counters are, in board squares (the camera's angle is allowed for). */
  counterHeight: number;
  onCounterHeight(value: number): void;
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
    channels, counts, palette, arming, pending, boardLearnt, onLearnBoard, learnMessage,
    onFindColours, onArmTap, onCancelArm,
    onAddPending, onDiscardPending, onRecalibrate, onRole, onLoopSlot, onRemove, config, setChannelSound, onHear, hearing, hearNote, onClearAll, isReferenced, running,
    minFilledFraction, readSettingsCustom, onMinFill, onResetReadSettings, counterHeight, onCounterHeight,
    settleWindowMs, onSettleWindow, onBlackDarkness, picker, onMovePicker, onSampleSquare, hands,
    finding, onCancelFind, found, onUseFound, onDiscardFound,
  } = props;
  const [confirm, setConfirm] = useState<{ kind: 'remove'; id: ColourId } | { kind: 'clear' } | null>(null);

  const removeTarget = confirm?.kind === 'remove' ? channels.find((c) => c.id === confirm.id) : null;

  return (
    <>
      {boardLearnt === 0 && (
        <div
          role="region"
          aria-label="Learn the empty board"
          style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn-tint)',
            border: '2px solid var(--bs-warn)',
          }}
        >
          <strong>First: let it see the empty board</strong>
          <span style={{ fontSize: 13 }}>
            Take every counter off, then press the button. It learns what each square looks
            like on its own, so counters are found by being unlike the board &mdash; and the
            wood is never offered as a colour.
          </span>
          <div>
            <Button tone="primary" onClick={onLearnBoard} reason={running ? 'Stop the board first.' : null}>
              Learn the empty board
            </Button>
          </div>
          {learnMessage && (
            <span role="status" aria-live="polite" style={{ fontSize: 13, fontWeight: 600 }}>{learnMessage}</span>
          )}
        </div>
      )}

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
            <div style={{ fontSize: 12, color: pending.unsafe ? 'var(--bs-warn)' : 'var(--bs-fg2)' }}>
              {pending.unsafe
                ? 'This looks like the board itself, so it would light up bare squares. Try a counter that stands out more from the wood, or add it and switch its job Off.'
                : 'Nothing is saved until you press Add.'}
            </div>
            {/* The numbers the sample actually produced. A swatch shows what was read;
                these say how STRONG the colour was, which is the difference between
                "you tapped the wood" and "this camera sends washed-out colour". A vivid
                counter should read well above 40 saturation on any camera worth using. */}
            <div style={{ fontSize: 11, color: 'var(--bs-fg2)', fontFamily: 'ui-monospace, monospace' }}>
              {`${pending.hex}  ·  hue ${Math.round(pending.h)}°  ·  saturation ${Math.round(pending.s)}  ·  brightness ${Math.round(pending.v)}`}
            </div>
            {/* How much of the counter its band will recognise. Low here is the reason a
                counter that was just tapped can be listed as "0 on board". */}
            {pending.keeps !== undefined && (
              <div style={{ fontSize: 12, color: pending.keeps < 0.6 ? 'var(--bs-warn)' : 'var(--bs-fg2)' }}>
                {pending.keeps < 0.6
                  ? `Only recognises ${Math.round(pending.keeps * 100)}% of this counter, so it may be missed. Tap nearer the middle of the counter, or try a stronger colour.`
                  : `Recognises ${Math.round(pending.keeps * 100)}% of this counter.`}
              </div>
            )}
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

      {/* At the top of the list, not below every colour: starting again with colours from
          an earlier setup is common, and one by one is slow. */}
      {channels.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, flex: 1 }}>{`Your colours (${channels.length})`}</span>
          <Button tone="secondary" onClick={() => setConfirm({ kind: 'clear' })}>Remove all colours</Button>
        </div>
      )}

      {channels.length > 0 && (
        <ColourTable
          config={config}
          palette={palette}
          roleLockedReason={running ? 'Stop the board to change what a colour plays.' : null}
          onRole={onRole}
          onLoopSlot={onLoopSlot}
          setChannelSound={setChannelSound}
          onHear={onHear}
          hearing={hearing}
          hearNote={hearNote}
          rowExtras={(c) => (
            <span style={{ fontSize: 12, color: 'var(--bs-fg2)', whiteSpace: 'nowrap' }}>{`${counts[c.id] ?? 0} down`}</span>
          )}
          rowMore={(c) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button tone="secondary" onClick={() => onRecalibrate(c.id)}>{`⟳ Recalibrate ${describeChannel(c)}`}</Button>
                <Button tone="quiet" onClick={() => setConfirm({ kind: 'remove', id: c.id })}>{`× Remove ${describeChannel(c)}`}</Button>
              </div>
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
          )}
        />
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
        <LabeledSlider
          label="Counter height"
          min={0}
          max={50}
          step={5}
          value={Math.round(counterHeight * 100)}
          display={counterHeight === 0 ? 'flat' : `${Math.round(counterHeight * 100)}% of a square`}
          onChange={(v) => onCounterHeight(v / 100)}
        />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)' }}>
          A camera at an angle sees the tops of counters shifted towards the far side. This
          allows for it. If a counter sitting in its square reads in the square behind,
          raise it; if it reads in the square in front, lower it.
        </p>
      </Disclosure>

      <Disclosure summary="Hands">
        <Switch
          label="Ignore hands"
          checked={hands.handGuardEnabled}
          onChange={hands.onHandGuardEnabled}
          hint="Holds the squares your hand is over, so placing a counter adds no stray notes and a covered counter keeps playing. Still being tuned: if counters stop being seen, turn this off."
        />
        <Switch
          label="Keep the pattern if pieces get knocked"
          checked={hands.knockGuardEnabled && hands.handGuardEnabled}
          onChange={hands.onKnockGuardEnabled}
          disabled={!hands.handGuardEnabled}
          hint={hands.handGuardEnabled
            ? 'Knocked pieces keep sounding until you let them go or save them as a loop.'
            // Without the hand guard it can't tell a knock from an arm covering counters:
            // every reach across the board froze the old pattern.
            : 'Needs "Ignore hands" on: without it, an arm reaching over counters looks like a knock.'}
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
          title="Remove all colours?"
          body="Every colour is removed for every player on this board. Saved loops and pages that use them will go quiet."
          confirmLabel="Remove all"
          onConfirm={() => { onClearAll(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
