/**
 * Board Sequencer player profiles. Storage is split in two:
 *  - the RIG (this device's board + camera + counter colours), shared by every player;
 *  - PLAYERS, each with their own grid, jobs/instruments/mix, sound, loops and settings.
 * The runtime still works with one merged BoardSequencerStored (resolveBoardConfig).
 */
import type { ColourChannel } from '../tracking/boardColours';
import {
  DEFAULT_BOARD_SEQUENCER_CONFIG, NEW_PLAYER_SOUND, sanitizeBoardSequencerConfig, referencedChannelIds,
  type BoardSequencerStored,
} from './BoardSequencerConfig';
import { applyGridChange } from '../tracking/boardGrid';
import { canSave } from '../storage/tabSaving';
import { DEMO_PLAYER_ID, DEMO_PLAYER_NAME, DEMO_REVISION, demoColourVoices, demoMusic } from '../songs/demo/demoPiece';

export const RIG_KEY = 'admi-board-rig';
export const PLAYERS_KEY = 'admi-board-players';
export const ACTIVE_PLAYER_KEY = 'admi-board-active-player';
export const LEGACY_KEY = 'admi-board-sequencer';

const RIG_FIELDS = ['version', 'enabled', 'corners', 'boardSquares', 'cameraDeviceId', 'cameraLabel', 'mirrorX', 'mirrorY', 'cameraRotation', 'midiEnabled', 'midiDeviceId', 'midiSends', 'midiKeepSound', 'midiChannelMode', 'midiLeadMs', 'midiLoopChannels', 'boardSource', 'boardReference', 'counterDetection', 'counterHeight'] as const;
export type RigField = (typeof RIG_FIELDS)[number];

export type RigChannel = Pick<ColourChannel, 'id' | 'kind' | 'swatch' | 'band' | 'blackBand' | 'whiteBand' | 'midiChannel'>;
export type ChannelPlayerSettings = Pick<ColourChannel, 'role' | 'instrument' | 'drum' | 'loopSlot' | 'volume' | 'tone' | 'reverbSend' | 'delaySend' | 'plays' | 'changes' | 'noteVary'>;

export interface BoardRigConfig {
  fields: Pick<BoardSequencerStored, RigField>;
  channels: RigChannel[];
}

export interface BoardPlayerProfile {
  id: string;
  name: string;
  settings: Partial<BoardSequencerStored>;
  channelSettings: Record<string, ChannelPlayerSettings>;
  /** The demo piece's player only: the player whose colours, cap and iPad it took. */
  madeFrom?: string;
  /** The demo piece's player only: which revision of the demo's music it holds. */
  demoRev?: number;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Every write of the board's players and rig goes through here or setActiveId: a tab that
 * waits for another tab of ADMI writes nothing (src/storage/tabSaving.ts).
 */
function writeJson(key: string, value: unknown): boolean {
  if (!canSave()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[BoardProfiles] Failed to save ${key}:`, error);
    return false;
  }
}

function setActiveId(id: string): void {
  if (canSave()) localStorage.setItem(ACTIVE_PLAYER_KEY, id);
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
    const { role, instrument, drum, loopSlot, volume, tone, reverbSend, delaySend, plays, changes, noteVary, ...rigPart } = c;
    channels.push(rigPart);
    const ps: ChannelPlayerSettings = { role };
    if (instrument !== undefined) ps.instrument = instrument;
    if (drum !== undefined) ps.drum = drum;
    if (loopSlot !== undefined) ps.loopSlot = loopSlot;
    if (volume !== undefined) ps.volume = volume;
    if (tone !== undefined) ps.tone = tone;
    if (reverbSend !== undefined) ps.reverbSend = reverbSend;
    if (delaySend !== undefined) ps.delaySend = delaySend;
    if (plays !== undefined) ps.plays = plays;
    if (changes !== undefined) ps.changes = changes;
    if (noteVary !== undefined) ps.noteVary = noteVary;
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
    ...(typeof o.madeFrom === 'string' && o.madeFrom ? { madeFrom: o.madeFrom } : {}),
    ...(typeof o.demoRev === 'number' && Number.isInteger(o.demoRev) ? { demoRev: o.demoRev } : {}),
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
  setActiveId(p1.id);
}

/** The player chosen last time, exactly as stored (null if none): who plays again. */
export function rememberedBoardPlayerId(): string | null {
  migrateLegacy();
  return localStorage.getItem(ACTIVE_PLAYER_KEY);
}

export function getActiveBoardPlayer(): BoardPlayerProfile | null {
  migrateLegacy();
  const players = listBoardPlayers();
  if (players.length === 0) return null;
  const id = localStorage.getItem(ACTIVE_PLAYER_KEY);
  return players.find((p) => p.id === id) ?? players[0];
}

/**
 * The demo player chosen, holding an older revision of the demo's music: written afresh (its
 * colours, cap and iPad kept from the player it was made from). True when it was.
 */
export function refreshStaleDemo(): boolean {
  const active = getActiveBoardPlayer();
  if (!active || active.id !== DEMO_PLAYER_ID || active.demoRev === DEMO_REVISION) return false;
  openDemoPlayer();
  return true;
}

export function loadActiveBoardConfig(): BoardSequencerStored | null {
  try {
    migrateLegacy();
    // A demo from an older ADMI plays the newest demo (the owner pulled and still heard the old one).
    refreshStaleDemo();
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
      setActiveId(p1.id);
      return rigOk && ok;
    }
    const ok = savePlayers(players.map((p) => (p.id === active.id ? { ...p, settings, channelSettings } : p)));
    setActiveId(active.id);
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
  const base = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...NEW_PLAYER_SOUND, handedness, boardSquares };
  const { settings } = splitBoardConfig(applyGridChange(base, {}));
  const player: BoardPlayerProfile = { id: freshPlayerId(players), name: name.trim() || 'Player', settings, channelSettings: {} };
  savePlayers([...players, player]);
  setActiveId(player.id);
  return player;
}

/**
 * How far the hat moves the speed in the demo piece: 15 % either side of the scene's own
 * speed (owner, 7 Nov 2026: the hat must shape the demo, live). A whole turn of the head to
 * Slowest or Fastest (60 to 240 BPM) tore the ambient piece apart. A span chosen on the
 * player's own Cap tab is kept.
 */
export const DEMO_HAT_SPAN = 0.15;

/**
 * The demo piece, ready to play, as its own player ("Demo piece"), opened. Its music is
 * written afresh every time (src/songs/demo/demoPiece.ts), so it always plays as written,
 * whatever was changed in it since. Everything that is not the music comes from the player
 * chosen last (or, from the demo itself, the player it was made from): their colours and
 * what each plays, the cap, the iPad, the hand, the control ranges, the keys. The board,
 * camera and MIDI are the rig's, as for every player.
 */
export function openDemoPlayer(): BoardPlayerProfile {
  migrateLegacy();
  const players = listBoardPlayers();
  const existing = players.find((p) => p.id === DEMO_PLAYER_ID) ?? null;
  const activeId = localStorage.getItem(ACTIVE_PLAYER_KEY);
  const others = players.filter((p) => p.id !== DEMO_PLAYER_ID);
  const fromId = activeId && activeId !== DEMO_PLAYER_ID ? activeId : existing?.madeFrom;
  const from = others.find((p) => p.id === fromId) ?? (existing ? null : others[0] ?? null);
  const rig = loadRig();
  const boardSquares = rig?.fields.boardSquares ?? DEFAULT_BOARD_SEQUENCER_CONFIG.boardSquares;
  const own = from?.settings ?? existing?.settings ?? {};
  const merged = applyGridChange(
    { ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...NEW_PLAYER_SOUND, ...own, boardSquares, channels: [], ...demoMusic() },
    { rows: 8, cols: 8 },
  );
  const sane = sanitizeBoardSequencerConfig(merged) ?? merged;
  const clean = sane.cap.tempoSpan < 1 ? sane : { ...sane, cap: { ...sane.cap, tempoSpan: DEMO_HAT_SPAN } };
  const { settings } = splitBoardConfig(clean);
  const madeFrom = from?.id ?? existing?.madeFrom;
  const player: BoardPlayerProfile = {
    id: DEMO_PLAYER_ID,
    name: DEMO_PLAYER_NAME,
    settings,
    // His colours, as ambient voices for the demo (C9); his own player keeps his sounds.
    channelSettings: demoColourVoices(from?.channelSettings ?? existing?.channelSettings ?? {}),
    ...(madeFrom ? { madeFrom } : {}),
    demoRev: DEMO_REVISION,
  };
  savePlayers(existing ? players.map((p) => (p.id === DEMO_PLAYER_ID ? player : p)) : [...players, player]);
  setActiveId(player.id);
  return player;
}

/** A player's name or main hand, changed. Everything else of theirs stays as it is. */
export function updateBoardPlayer(id: string, change: { name?: string; handedness?: 'left' | 'right' }): void {
  const players = listBoardPlayers();
  if (!players.some((p) => p.id === id)) return;
  savePlayers(players.map((p) => (p.id !== id ? p : {
    ...p,
    name: change.name !== undefined && change.name.trim() ? change.name.trim() : p.name,
    settings: change.handedness ? { ...p.settings, handedness: change.handedness } : p.settings,
  })));
}

export function setActiveBoardPlayer(id: string): void {
  if (listBoardPlayers().some((p) => p.id === id)) setActiveId(id);
}

/** Each player's saved loops and pages, as saved, for what removing a colour would do to them. */
export function savedPlayersWork(): { id: string; name: string; work: Pick<BoardSequencerStored, 'loopSlots' | 'loopNames' | 'pages'> }[] {
  return listBoardPlayers().flatMap((p) => {
    const cfg = sanitizeBoardSequencerConfig({ ...p.settings });
    return cfg ? [{ id: p.id, name: p.name, work: cfg }] : [];
  });
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
