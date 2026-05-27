/**
 * RemixRecorder — buffers timestamped control events while armed. Continuous
 * params (filter/loop) are deduped against the last recorded value so a
 * per-frame stream collapses to change points; percussion (discrete) is always
 * kept. commitTake() returns the buffered events (t-sorted) as a new take and
 * clears the buffer + dedup baseline for the next overdub cycle.
 */
import type { CaptureInput, RemixEvent, RemixTake } from './remixRecording';

const EPS = 0.004; // continuous-value change threshold

function valueOf(input: CaptureInput): number {
  switch (input.kind) {
    case 'stemFilter': return input.value;
    case 'loopVolume': return input.value;
    case 'loopSelect': return input.index;
    case 'loopEnable': return input.on ? 1 : 0;
    case 'percussion': return input.velocity;
  }
}

function paramKey(input: CaptureInput): string {
  return input.kind === 'stemFilter' ? `stemFilter:${input.stem}` : input.kind;
}

export class RemixRecorder {
  private armed = false;
  private buffer: RemixEvent[] = [];
  private sectionStartSec = 0;
  private sectionLengthSec = 0;
  private lastValue = new Map<string, number>();
  private seq = 0;

  arm(sectionStartSec: number, sectionLengthSec: number): void {
    this.armed = true;
    this.sectionStartSec = sectionStartSec;
    this.sectionLengthSec = sectionLengthSec;
    this.buffer = [];
    this.lastValue.clear();
  }

  setSection(sectionStartSec: number, sectionLengthSec: number): void {
    this.sectionStartSec = sectionStartSec;
    this.sectionLengthSec = sectionLengthSec;
  }

  disarm(): void {
    this.armed = false;
  }

  isArmed(): boolean {
    return this.armed;
  }

  capture(input: CaptureInput, transportSec: number): void {
    if (!this.armed) return;
    if (input.kind !== 'percussion') {
      const key = paramKey(input);
      const v = valueOf(input);
      const last = this.lastValue.get(key);
      if (last !== undefined && Math.abs(last - v) < EPS) return;
      this.lastValue.set(key, v);
    }
    let t = transportSec - this.sectionStartSec;
    if (this.sectionLengthSec > 0) {
      t = ((t % this.sectionLengthSec) + this.sectionLengthSec) % this.sectionLengthSec;
    }
    this.buffer.push({ t, ...input } as RemixEvent);
  }

  commitTake(): RemixTake {
    const events = this.buffer.slice().sort((a, b) => a.t - b.t);
    this.buffer = [];
    this.lastValue.clear();
    return { id: `take-${++this.seq}`, muted: false, events };
  }

  hasBuffered(): boolean {
    return this.buffer.length > 0;
  }
}
