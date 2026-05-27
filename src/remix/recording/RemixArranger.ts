/**
 * RemixArranger — owns the RemixArrangement (sections → overdub takes) and
 * composites them for playback. Continuous params use last-non-muted-take-wins
 * (a take only stores params the user touched, so untouched params pass
 * through); percussion (discrete) from every non-muted take all fires. Pure
 * compositing — the engine resolves section→time using the song's downbeats.
 */
import type { StemId } from '../RemixBaton';
import type { RemixArrangement, RemixEvent, RemixSection, RemixTake } from './remixRecording';

export interface CompositeResult {
  filters: Partial<Record<StemId, number>>;
  loopSelect?: number;
  loopEnable?: boolean;
  loopVolume?: number;
}

export class RemixArranger {
  private arrangement: RemixArrangement;

  constructor(songId: string) {
    this.arrangement = { songId, sections: [] };
  }

  getArrangement(): RemixArrangement {
    return this.arrangement;
  }

  load(a: RemixArrangement): void {
    this.arrangement = a;
  }

  private ensureSection(originBar: number, lengthBars: number): RemixSection {
    let s = this.arrangement.sections.find(
      (sec) => sec.originBar === originBar && sec.lengthBars === lengthBars,
    );
    if (!s) {
      s = { originBar, lengthBars, layers: [] };
      this.arrangement.sections.push(s);
      this.arrangement.sections.sort((a, b) => a.originBar - b.originBar);
    }
    return s;
  }

  addTake(originBar: number, lengthBars: number, take: RemixTake): void {
    this.ensureSection(originBar, lengthBars).layers.push(take);
  }

  muteTake(sectionIdx: number, takeId: string, muted: boolean): void {
    const take = this.arrangement.sections[sectionIdx]?.layers.find((l) => l.id === takeId);
    if (take) take.muted = muted;
  }

  deleteTake(sectionIdx: number, takeId: string): void {
    const sec = this.arrangement.sections[sectionIdx];
    if (!sec) return;
    sec.layers = sec.layers.filter((l) => l.id !== takeId);
  }

  static composite(section: RemixSection, t: number): CompositeResult {
    const res: CompositeResult = { filters: {} };
    for (const take of section.layers) {
      if (take.muted) continue;
      for (const ev of take.events) {
        if (ev.t > t) continue;
        switch (ev.kind) {
          case 'stemFilter': res.filters[ev.stem] = ev.value; break;
          case 'loopSelect': res.loopSelect = ev.index; break;
          case 'loopEnable': res.loopEnable = ev.on; break;
          case 'loopVolume': res.loopVolume = ev.value; break;
          case 'percussion': break;
        }
      }
    }
    return res;
  }

  static discreteEventsInWindow(section: RemixSection, fromT: number, toT: number): RemixEvent[] {
    const out: RemixEvent[] = [];
    for (const take of section.layers) {
      if (take.muted) continue;
      for (const ev of take.events) {
        if (ev.kind === 'percussion' && ev.t > fromT && ev.t <= toT) out.push(ev);
      }
    }
    return out;
  }
}
