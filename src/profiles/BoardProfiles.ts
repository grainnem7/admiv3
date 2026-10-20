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
import { applyGridChange } from '../tracking/boardGrid';

export const RIG_KEY = 'admi-board-rig';
export const PLAYERS_KEY = 'admi-board-players';
export const ACTIVE_PLAYER_KEY = 'admi-board-active-player';
export const LEGACY_KEY = 'admi-board-sequencer';

const RIG_FIELDS = ['version', 'enabled', 'corners', 'boardSquares', 'cameraDeviceId', 'cameraLabel', 'mirrorX', 'mirrorY', 'cameraRotation', 'midiEnabled', 'midiDeviceId', 'midiSends', 'midiKeepSound', 'boardSource'] as const;
export type RigField = (typeof RIG_FIELDS)[number];

export type RigChannel = Pick<ColourChannel, 'id' | 'kind' | 'swatch' | 'band' | 'blackBand' | 'whiteBand'>;
export type ChannelPlayerSettings = Pick<ColourChannel, 'role' | 'instrument' | 'drum' | 'loopSlot' | 'volume' | 'tone' | 'reverbSend' | 'delaySend'>;

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

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[BoardProfiles] Failed to save ${key}:`, error);
    return false;
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
    const { role, instrument, drum, loopSlot, volume, tone, reverbSend, delaySend, ...rigPart } = c;
    channels.push(rigPart);
    const ps: ChannelPlayerSettings = { role };
    if (instrument !== undefined) ps.instrument = instrument;
    if (drum !== undefined) ps.drum = drum;
    if (loopSlot !== undefined) ps.loopSlot = loopSlot;
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

function savePlayers(players: BoardPlayerProfile[]): boolean {
  return writeJson(PLAYERS_KEY, players);
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

/**
 * Save the config for a player: `playerId` is the player this screen is showing. Without
 * it the stored "active player" is used — but that can be changed by another tab, and
 * then this tab's next save would land on someone else's loops.
 */
/** Returns false when the browser refused to save (storage full or blocked). */
export function saveActiveBoardConfig(cfg: BoardSequencerStored, playerId?: string | null): boolean {
  try {
    migrateLegacy();
    const clean = sanitizeBoardSequencerConfig(cfg);
    if (!clean) return false;
    const { rig, settings, channelSettings } = splitBoardConfig(clean);
    const rigOk = writeJson(RIG_KEY, rig);
    const players = listBoardPlayers();
    const active = (playerId ? players.find((p) => p.id === playerId) : undefined) ?? getActiveBoardPlayer();
    if (!active) {
      const p1: BoardPlayerProfile = { id: 'p1', name: 'Player 1', settings, channelSettings };
      const ok = savePlayers([p1]);
      localStorage.setItem(ACTIVE_PLAYER_KEY, p1.id);
      return rigOk && ok;
    }
    const ok = savePlayers(players.map((p) => (p.id === active.id ? { ...p, settings, channelSettings } : p)));
    localStorage.setItem(ACTIVE_PLAYER_KEY, active.id);
    return rigOk && ok;
  } catch (error) {
    console.warn('[BoardProfiles] Failed to save:', error);
    return false;
  }
}

export function createBoardPlayer(name: string, handedness: 'left' | 'right'): BoardPlayerProfile {
  migrateLegacy();
  const players = listBoardPlayers();
  // The rig's board size decides how much of a cell a counter covers, so a new player on
  // a 10 x 10 board must not start with the sampling suggested for an 8 x 8 one.
  const rig = loadRig();
  const boardSquares = rig?.fields.boardSquares ?? DEFAULT_BOARD_SEQUENCER_CONFIG.boardSquares;
  const base = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, handedness, boardSquares };
  const { settings } = splitBoardConfig(applyGridChange(base, {}));
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
