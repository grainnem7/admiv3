/**
 * The Sound tab's live settings on the second performer's page (owner, 7 Nov 2026: "show me
 * everything in the sound panel that I can tweak whilst the performance is happening"): the
 * world, Energy, Space, Groove, the Band, Extra notes, Sounds change, Loops vary, Keep my notes
 * on top, and each colour's loudness. The same choices as the laptop's Sound tab (its steps),
 * sent as what is wanted; the laptop sets them as its own tab would. Pure.
 */
import { ENERGY, LOUD, SPACE_ALL } from '../audio/soundSteps';

export type RemoteWorld = 'warm' | 'lofi' | 'ambient' | 'electronic' | 'none';
export type RemoteGroove = 'straight' | 'swung' | 'lazy';
export type RemoteBand = 'off' | 'gentle' | 'full';

export interface RemoteSound {
  world: RemoteWorld;
  energy: number;
  space: number;
  /** Null: the player's own swing and timing, not one of the three. */
  groove: RemoteGroove | null;
  band: RemoteBand;
  fill: number;
  evolve: number;
  loopVary: number;
  keepOnTop: boolean;
  /** Each colour's loudness, by colour id. */
  volumes: Record<string, number>;
}
export type SoundPatch = Partial<Omit<RemoteSound, 'volumes' | 'groove'>> & { groove?: RemoteGroove };

interface Choice<T> { value: T; label: string }
export const WORLD_CHOICES: Choice<RemoteWorld>[] = [
  { value: 'warm', label: 'Warm' }, { value: 'lofi', label: 'Lo-fi' }, { value: 'ambient', label: 'Ambient' },
  { value: 'electronic', label: 'Electronic' }, { value: 'none', label: 'My picks' },
];
export const GROOVES: Record<RemoteGroove, { label: string; swing: number; humanize: number }> = {
  straight: { label: 'Straight', swing: 0, humanize: 0 },
  swung: { label: 'Swung', swing: 0.33, humanize: 0.08 },
  lazy: { label: 'Lazy', swing: 0.5, humanize: 0.22 },
};
export const BAND_CHOICES: Choice<RemoteBand>[] = [{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }];
/** The Sound tab's steps (SoundTab.tsx keeps the same). */
export const FILL_STEPS: Choice<number>[] = [{ label: 'Off', value: 0 }, { label: 'A few', value: 0.25 }, { label: 'Some', value: 0.5 }, { label: 'Lots', value: 0.8 }];
export const EVOLVE_STEPS: Choice<number>[] = [{ label: 'Off', value: 0 }, { label: 'Slowly', value: 0.35 }, { label: 'More', value: 0.7 }];
export const LOOP_VARY_STEPS: Choice<number>[] = [{ label: 'Off', value: 0 }, { label: 'A little', value: 0.35 }, { label: 'More', value: 0.7 }];
export const ENERGY_STEPS: Choice<number>[] = ENERGY.map((s) => ({ label: s.label, value: s.value }));
export const SPACE_STEPS: Choice<number>[] = SPACE_ALL.map((s) => ({ label: s.label, value: s.value }));
export const LOUD_STEPS: Choice<number>[] = LOUD.map((s) => ({ label: s.label, value: s.value }));

const WORLDS = new Set<string>(WORLD_CHOICES.map((w) => w.value));
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** The groove a swing and loose timing are, or null for the player's own. */
export function grooveOf(swing: number, humanize: number): RemoteGroove | null {
  for (const [name, g] of Object.entries(GROOVES) as [RemoteGroove, (typeof GROOVES)[RemoteGroove]][]) {
    if (Math.abs(g.swing - swing) < 0.02 && Math.abs(g.humanize - humanize) < 0.02) return name;
  }
  return null;
}

/** The settings as the second laptop shows them, from the player's. */
export function remoteSoundOf(c: {
  soundWorld: string; energy: number; space: number; swing: number; humanize: number; band: string;
  fillAmount: number; evolveAmount: number; loopVary: number; keepOnTop: boolean;
  channels: readonly { id: string; volume?: number }[];
}): RemoteSound {
  return {
    world: (WORLDS.has(c.soundWorld) ? c.soundWorld : 'none') as RemoteWorld,
    energy: c.energy, space: c.space, groove: grooveOf(c.swing, c.humanize),
    band: (['off', 'gentle', 'full'].includes(c.band) ? c.band : 'off') as RemoteBand,
    fill: c.fillAmount, evolve: c.evolveAmount, loopVary: c.loopVary, keepOnTop: c.keepOnTop,
    volumes: Object.fromEntries(c.channels.map((ch) => [ch.id, ch.volume ?? 1])),
  };
}

/** A patch sent from the second laptop, made safe: anything unknown or out of range is dropped. */
export function sanitizeSoundPatch(v: unknown): SoundPatch | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const out: SoundPatch = {};
  if (typeof o.world === 'string' && WORLDS.has(o.world)) out.world = o.world as RemoteWorld;
  if (typeof o.groove === 'string' && o.groove in GROOVES) out.groove = o.groove as RemoteGroove;
  if (typeof o.band === 'string' && ['off', 'gentle', 'full'].includes(o.band)) out.band = o.band as RemoteBand;
  for (const k of ['energy', 'space', 'fill', 'evolve', 'loopVary'] as const) if (isUnit(o[k])) out[k] = o[k] as number;
  if (typeof o.keepOnTop === 'boolean') out.keepOnTop = o.keepOnTop;
  return Object.keys(out).length > 0 ? out : null;
}

/** The state's settings, made safe (as the page receives them). */
export function sanitizeRemoteSound(v: unknown): RemoteSound | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const p = sanitizeSoundPatch({ ...o, groove: o.groove ?? undefined });
  if (!p || p.world === undefined || p.band === undefined) return undefined;
  const vols: Record<string, number> = {};
  if (typeof o.volumes === 'object' && o.volumes !== null) {
    for (const [k, x] of Object.entries(o.volumes as Record<string, unknown>)) if (isUnit(x)) vols[k] = x;
  }
  return {
    world: p.world, band: p.band, energy: p.energy ?? 0.5, space: p.space ?? 0.5, groove: p.groove ?? null,
    fill: p.fill ?? 0, evolve: p.evolve ?? 0, loopVary: p.loopVary ?? 0, keepOnTop: p.keepOnTop ?? false, volumes: vols,
  };
}

/** What the laptop sets for a patch: the player's own settings, and the groove's swing and timing. */
export function configPatchOf(p: SoundPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.world !== undefined) out.soundWorld = p.world;
  if (p.energy !== undefined) out.energy = p.energy;
  if (p.space !== undefined) out.space = p.space;
  if (p.band !== undefined) out.band = p.band;
  if (p.fill !== undefined) { out.fillAmount = p.fill; if (p.fill === 0) out.fillKept = null; }
  if (p.evolve !== undefined) out.evolveAmount = p.evolve;
  if (p.loopVary !== undefined) out.loopVary = p.loopVary;
  if (p.keepOnTop !== undefined) out.keepOnTop = p.keepOnTop;
  if (p.groove !== undefined) { out.swing = GROOVES[p.groove].swing; out.humanize = GROOVES[p.groove].humanize; }
  return out;
}
