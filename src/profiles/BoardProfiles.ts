/**
 * Board Sequencer player profiles. Storage is split in two:
 *  - the RIG (this device's board + camera + counter colours), shared by every player;
 *  - PLAYERS, each with their own grid, jobs/instruments/mix, sound, loops and settings.
 * The runtime still works with one merged BoardSequencerStored (resolveBoardConfig).
 */
import type { ColourChannel } from '../tracking/boardColours';
import {
  DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, referencedChannelIds,
  type BoardSequencerStored,
} from './BoardSequencerConfig';

export const RIG_KEY = 'admi-board-rig';
export const PLAYERS_KEY = 'admi-board-players';
export const ACTIVE_PLAYER_KEY = 'admi-board-active-player';
export const LEGACY_KEY = 'admi-board-sequencer';

const RIG_FIELDS = ['version', 'enabled', 'corners', 'boardSquares', 'cameraDeviceId', 'cameraLabel', 'mirrorX', 'mirrorY'] as const;
export type RigField = (typeof RIG_FIELDS)[number];

export type RigChannel = Pick<ColourChannel, 'id' | 'kind' | 'swatch' | 'band' | 'blackBand' | 'whiteBand'>;
export type ChannelPlayerSettings = Pick<ColourChannel, 'role' | 'instrument' | 'drum' | 'volume' | 'tone' | 'reverbSend' | 'delaySend'>;

export interface BoardRigConfig {
  fields: Pick<BoardSequencerStored, RigField>;
  channels: RigChannel[];
}

export interface BoardPlayerProfile {
  id: string;
  name: string;
  settings: Partial<BoardSequencerStored>;
  channelSettings: Record<string, ChannelPlayerSettings>;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[BoardProfiles] Failed to save ${key}:`, error);
  }
}

export function splitBoardConfig(cfg: BoardSequencerStored): {
  rig: BoardRigConfig; settings: Partial<BoardSequencerStored>; channelSettings: Record<string, ChannelPlayerSettings>;
} {
  const fields = {} as Record<RigField, unknown>;
  for (const k of RIG_FIELDS) fields[k] = cfg[k];
  const settings: Partial<BoardSequencerStored> = { ...cfg };
  for (const k of RIG_FIELDS) delete settings[k];
  delete settings.channels;
  const channels: RigChannel[] = [];
  const channelSettings: Record<string, ChannelPlayerSettings> = {};
  for (const c of cfg.channels) {
    const { role, instrument, drum, volume, tone, reverbSend, delaySend, ...rigPart } = c;
    channels.push(rigPart);
    const ps: ChannelPlayerSettings = { role };
    if (instrument !== undefined) ps.instrument = instrument;
    if (drum !== undefined) ps.drum = drum;
    if (volume !== undefined) ps.volume = volume;
    if (tone !== undefined) ps.tone = tone;
    if (reverbSend !== undefined) ps.reverbSend = reverbSend;
    if (delaySend !== undefined) ps.delaySend = delaySend;
    channelSettings[c.id] = ps;
  }
  return { rig: { fields: fields as Pick<BoardSequencerStored, RigField>, channels }, settings, channelSettings };
}

export function resolveBoardConfig(rig: BoardRigConfig, player: BoardPlayerProfile): BoardSequencerStored {
  const merged = {
    ...player.settings,
    ...rig.fields,
    channels: rig.channels.map((c) => ({ ...c, ...(player.channelSettings[c.id] ?? { role: 'off' }) })),
  };
  return sanitizeBoardSequencerConfig(merged) ?? DEFAULT_BOARD_SEQUENCER_CONFIG;
}

function loadRig(): BoardRigConfig | null {
  const raw = readJson(RIG_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as { fields?: unknown; channels?: unknown };
  const fields = typeof o.fields === 'object' && o.fields !== null ? o.fields : {};
  const channels = Array.isArray(o.channels) ? o.channels : [];
  // Re-sanitise through a full merge so a corrupt rig yields safe defaults.
  const clean = sanitizeBoardSequencerConfig({ ...fields, channels: channels.map((c: object) => ({ role: 'off', ...c })) });
  return clean ? splitBoardConfig(clean).rig : null;
}

function sanitizePlayer(v: unknown): BoardPlayerProfile | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' && o.name ? o.name : 'Player',
    settings: typeof o.settings === 'object' && o.settings !== null ? (o.settings as Partial<BoardSequencerStored>) : {},
    channelSettings: typeof o.channelSettings === 'object' && o.channelSettings !== null
      ? (o.channelSettings as Record<string, ChannelPlayerSettings>)
      : {},
  };
}

export function listBoardPlayers(): BoardPlayerProfile[] {
  const raw = readJson(PLAYERS_KEY);
  return Array.isArray(raw) ? raw.map(sanitizePlayer).filter((p): p is BoardPlayerProfile => p !== null) : [];
}

function savePlayers(players: BoardPlayerProfile[]): void {
  writeJson(PLAYERS_KEY, players);
}

function freshPlayerId(players: BoardPlayerProfile[]): string {
  const used = new Set(players.map((p) => p.id));
  for (let i = 1; ; i++) if (!used.has(`p${i}`)) return `p${i}`;
}

/** One-time: split the legacy single config into rig + "Player 1". Old key is left in place. */
function migrateLegacy(): void {
  if (localStorage.getItem(RIG_KEY) !== null) return;
  const legacy = sanitizeBoardSequencerConfig(readJson(LEGACY_KEY));
  if (!legacy) return;
  const { rig, settings, channelSettings } = splitBoardConfig(legacy);
  writeJson(RIG_KEY, rig);
  const p1: BoardPlayerProfile = { id: 'p1', name: 'Player 1', settings, channelSettings };
  savePlayers([p1]);
  localStorage.setItem(ACTIVE_PLAYER_KEY, p1.id);
}

export function getActiveBoardPlayer(): BoardPlayerProfile | null {
  migrateLegacy();
  const players = listBoardPlayers();
  if (players.length === 0) return null;
  const id = localStorage.getItem(ACTIVE_PLAYER_KEY);
  return players.find((p) => p.id === id) ?? players[0];
}

export function loadActiveBoardConfig(): BoardSequencerStored | null {
  try {
    migrateLegacy();
    const rig = loadRig();
    if (!rig) return null;
    const player = getActiveBoardPlayer() ?? { id: 'p1', name: 'Player 1', settings: {}, channelSettings: {} };
    return resolveBoardConfig(rig, player);
  } catch (error) {
    console.warn('[BoardProfiles] Failed to load:', error);
    return null;
  }
}

export function saveActiveBoardConfig(cfg: BoardSequencerStored): void {
  try {
    migrateLegacy();
    const clean = sanitizeBoardSequencerConfig(cfg);
    if (!clean) return;
    const { rig, settings, channelSettings } = splitBoardConfig(clean);
    writeJson(RIG_KEY, rig);
    const players = listBoardPlayers();
    const active = getActiveBoardPlayer();
    if (!active) {
      const p1: BoardPlayerProfile = { id: 'p1', name: 'Player 1', settings, channelSettings };
      savePlayers([p1]);
      localStorage.setItem(ACTIVE_PLAYER_KEY, p1.id);
      return;
    }
    savePlayers(players.map((p) => (p.id === active.id ? { ...p, settings, channelSettings } : p)));
    localStorage.setItem(ACTIVE_PLAYER_KEY, active.id);
  } catch (error) {
    console.warn('[BoardProfiles] Failed to save:', error);
  }
}

export function createBoardPlayer(name: string, handedness: 'left' | 'right'): BoardPlayerProfile {
  migrateLegacy();
  const players = listBoardPlayers();
  const { settings } = splitBoardConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, handedness });
  const player: BoardPlayerProfile = { id: freshPlayerId(players), name: name.trim() || 'Player', settings, channelSettings: {} };
  savePlayers([...players, player]);
  localStorage.setItem(ACTIVE_PLAYER_KEY, player.id);
  return player;
}

export function setActiveBoardPlayer(id: string): void {
  if (listBoardPlayers().some((p) => p.id === id)) localStorage.setItem(ACTIVE_PLAYER_KEY, id);
}

/** Channel ids referenced by any player's saved pages or loop slots. */
export function allReferencedChannelIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of listBoardPlayers()) {
    const cfg = sanitizeBoardSequencerConfig({ ...p.settings });
    if (!cfg) continue;
    for (const id of referencedChannelIds(cfg)) ids.add(id);
  }
  return ids;
}
