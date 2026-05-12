import type { SongConfig, StemMixerMapping } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';
import { FILTER_MIN_HZ, FILTER_MAX_HZ } from '../../../songs/voices/ToneVoiceBase';

export type StemMixerLayout = 'multi-stem' | 'mix-only';

export interface StemBarView {
  id: string;
  label: string;
  level: number;
}

export interface StemMixerView {
  layout: StemMixerLayout;
  zoneLabel: string;
  stems: StemBarView[];
  filterPercent: number;
  dimmed: boolean;
}

const STEM_IDS = ['vocals', 'drums', 'bass', 'other'] as const;
const STEM_LABELS: Record<(typeof STEM_IDS)[number], string> = {
  vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other',
};

const DEFAULT_ZONE_LABELS = { left: 'Left', center: 'Center', right: 'Right' };

function isMixOnly(song: SongConfig): boolean {
  const paths = STEM_IDS.map((id) => song.stems[id]);
  return paths.every((p) => p === paths[0]);
}

function resolveZoneLabels(mapping: StemMixerMapping): { left: string; center: string; right: string } {
  return mapping.zoneLabels ?? DEFAULT_ZONE_LABELS;
}

function filterHzToPercent(hz: number): number {
  if (hz <= FILTER_MIN_HZ) return 0;
  if (hz >= FILTER_MAX_HZ) return 100;
  const ratio = Math.log(hz / FILTER_MIN_HZ) / Math.log(FILTER_MAX_HZ / FILTER_MIN_HZ);
  return Math.round(ratio * 1000) / 10;
}

export function resolveStemMixerView(
  song: SongConfig,
  status: SongPresetStatus,
  active: boolean,
): StemMixerView {
  const mixOnly = isMixOnly(song);
  const zoneLabels = resolveZoneLabels(song.stemMixer);
  const zoneLabel = status.stemMixerZone ? zoneLabels[status.stemMixerZone] : '—';
  const filterPercent = filterHzToPercent(status.filterHz);

  let stems: StemBarView[];
  if (mixOnly) {
    const vols = STEM_IDS.map((id) => status.stemVolumes[id] ?? 0);
    const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
    stems = [{ id: 'volume', label: 'Volume', level: avg }];
  } else {
    stems = STEM_IDS.map((id) => ({
      id,
      label: STEM_LABELS[id],
      level: status.stemVolumes[id] ?? 0,
    }));
  }

  return {
    layout: mixOnly ? 'mix-only' : 'multi-stem',
    zoneLabel,
    stems,
    filterPercent,
    dimmed: !active,
  };
}
