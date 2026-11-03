import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { LabeledSlider } from '../ui/LabeledSlider';
import { Note } from '../ui/explain';
import { addTap, stepBpm, TAP_MAX_BPM, TAP_MIN_BPM, tapTempo } from '../../../../songs/tapTempo';

export interface SpeedControlProps {
  bpm: number;
  onBpm(bpm: number): void;
  /** Why the speed can't be changed here (a tempo counter owns it), or null. */
  reason?: string | null;
}

/**
 * The speed in the transport (producer flow, item 4): the readout is a button. Arrow keys
 * change it by one BPM (five with Shift); a press opens a slider and Tap, so the owner can
 * tap the speed in as in any DAW. The words stay "90 BPM", so the readout reads as before.
 */
export function SpeedControl({ bpm, onBpm, reason = null }: SpeedControlProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent): void => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <span ref={box} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={button}
        type="button"
        data-speed-readout=""
        aria-label={`${bpm} BPM: change the speed`}
        aria-expanded={open}
        aria-controls={id}
        disabled={reason !== null}
        title={reason ?? 'Arrow keys: one BPM, five with Shift. Press for a slider and tap tempo.'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          const next = stepBpm(bpm, e.key, e.shiftKey, TAP_MIN_BPM, TAP_MAX_BPM);
          if (next === null) return;
          e.preventDefault();
          if (next !== bpm) onBpm(next);
        }}
        style={{
          minHeight: 'var(--bs-target)', minWidth: 0, padding: '0 6px', margin: '-10px 0',
          border: '1px solid transparent', borderRadius: 'var(--bs-radius-sm)', background: 'transparent',
          color: 'var(--bs-fg)', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums', cursor: reason ? 'not-allowed' : 'pointer',
        }}
      >
        {`${bpm} BPM`}
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Speed"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 12px)', zIndex: 30, width: 280, padding: 12, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: 8,
            background: 'var(--bs-elev)', border: '1px solid var(--bs-border-control)', borderRadius: 'var(--bs-radius-md)',
          }}
        >
          <LabeledSlider label="Speed" min={TAP_MIN_BPM} max={TAP_MAX_BPM} value={bpm} display={`${bpm} BPM`} onChange={(v) => onBpm(Math.round(v))} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              tone="secondary"
              aria-label="Tap the speed"
              onClick={() => {
                const next = addTap(taps, performance.now());
                setTaps(next);
                const v = tapTempo(next);
                if (v !== null && v !== bpm) onBpm(v);
              }}
            >
              Tap
            </Button>
            <Button tone="quiet" onClick={() => { setOpen(false); button.current?.focus(); }}>Done</Button>
          </div>
          <Note>Tap along four times and the speed follows.</Note>
        </div>
      )}
    </span>
  );
}
