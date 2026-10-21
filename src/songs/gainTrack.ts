/**
 * A copy of an AudioParam's automation, kept in plain numbers so its value at any moment
 * can be read without the audio graph. The engine's ending gain (endGain) is driven with
 * the same calls; MIDI then follows it: CC 11 and the notes' velocity fade exactly as
 * ADMI's own sound does, because MIDI never hears ADMI's audio.
 *
 * Only what the engine uses: setValueAtTime, linearRampToValueAtTime, setTargetAtTime and
 * cancelScheduledValues, with the Web Audio rules for each (a linear ramp runs from the
 * event before it; a cancel drops every event at or after its time).
 */

type GainEvent =
  | { type: 'set'; t: number; v: number }
  | { type: 'linear'; t: number; v: number }
  | { type: 'target'; t: number; v: number; tc: number };

/** Where the value stands after an event: a fixed value, or one gliding toward a target. */
interface State {
  t: number;
  v: number;
  glide: { to: number; tc: number } | null;
}

function valueOf(s: State, time: number): number {
  if (!s.glide) return s.v;
  return s.glide.to + (s.v - s.glide.to) * Math.exp(-Math.max(0, time - s.t) / s.glide.tc);
}

export class GainTrack {
  private events: GainEvent[] = [];

  constructor(private initial = 1) {}

  /** Back to a steady value with nothing scheduled (Play). */
  reset(v = 1): void {
    this.initial = v;
    this.events = [];
  }

  setValueAtTime(v: number, t: number): void {
    this.insert({ type: 'set', t, v });
  }

  linearRampToValueAtTime(v: number, t: number): void {
    this.insert({ type: 'linear', t, v });
  }

  setTargetAtTime(v: number, t: number, tc: number): void {
    this.insert({ type: 'target', t, v, tc: Math.max(1e-4, tc) });
  }

  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e.t < t);
  }

  /** The value at `time` (audio-context seconds). */
  valueAt(time: number): number {
    let s: State = { t: -Infinity, v: this.initial, glide: null };
    for (const e of this.events) {
      if (e.type === 'linear') {
        if (time < e.t) {
          // Mid ramp: from where the previous event left the value.
          const startT = Number.isFinite(s.t) ? s.t : e.t;
          const startV = valueOf(s, startT);
          const span = e.t - startT;
          return span <= 0 ? e.v : startV + (e.v - startV) * ((time - startT) / span);
        }
        s = { t: e.t, v: e.v, glide: null };
        continue;
      }
      if (e.t > time) break;
      s = e.type === 'set'
        ? { t: e.t, v: e.v, glide: null }
        : { t: e.t, v: valueOf(s, e.t), glide: { to: e.v, tc: e.tc } };
    }
    return valueOf(s, time);
  }

  private insert(e: GainEvent): void {
    // Kept in time order; an event at the same time as another goes after it, as in Web Audio.
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > e.t) i--;
    this.events.splice(i, 0, e);
    // A long piece never builds up a long list: anything well past is folded away.
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
  }
}
