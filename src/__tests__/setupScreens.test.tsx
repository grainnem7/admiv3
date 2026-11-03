/**
 * Audit batch 4 (spec 2026-10-30-audit-fixes-design.md): the set-up screens. A1 the folds,
 * A2 one word list, A3 the header's More, A14 the visible questions and the Ready check's
 * buttons, A16 ↶ kept from set-up and the "comes in" swatches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PieceSteps, type PieceLoop, type PieceStepsProps } from '../ui/screens/boardSequencer/play/PieceSteps';
import { SoundTab, type SoundTabProps } from '../ui/screens/boardSequencer/play/SoundTab';
import { ColourTable, forgetSoundsBefore, type ColourTableProps } from '../ui/screens/boardSequencer/play/ColourTable';
import { ReadyList, PLACE_WORDS } from '../ui/screens/boardSequencer/play/ReadyCheck';
import { SegmentedControl } from '../ui/screens/boardSequencer/ui/SegmentedControl';
import { HeaderMore } from '../ui/screens/boardSequencer/ui/HeaderMore';
import { forgetFolds } from '../ui/screens/boardSequencer/ui/useSessionFold';
import { ENERGY_NAMES, FADER_WORDS, RETIRED_WORDS, WORDS, retiredWordsIn } from '../ui/screens/boardSequencer/words';
import { CAP_ROLE_LABELS } from '../ui/screens/boardSequencer/play/CapPanel';
import { boardItem, ipadCheckItems, keepingTimeCheckItems, pieceCheckItems } from '../ui/screens/boardSequencer/pieceCheck';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';
import { ENERGY } from '../audio/soundSteps';
import { ENERGY_WORDS } from '../songs/performance/energy';
import { ROLE_LABELS, type ColourChannel } from '../tracking/boardColours';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';
import type { TrackedColor } from '../tracking/ColorTracker';
import BoardHelp from '../ui/components/board/BoardHelp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { forgetFolds(); forgetSoundsBefore(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const text = (): string => host.textContent ?? '';
const button = (name: string | RegExp, within: ParentNode = host): HTMLButtonElement | undefined =>
  [...within.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')));
const radios = (group: string): HTMLButtonElement[] =>
  [...host.querySelectorAll<HTMLButtonElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)];
const radio = (group: string, name: string): HTMLButtonElement | undefined => radios(group).find((b) => b.childNodes[0]?.textContent === name);

// ---- Make a piece: a scene ----

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0, evolveAmount: 0, bpm: 90, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: { asBefore: true, pads: true, bass: true, drums: true, counter: false }, sceneEnergy: 0 };
const scene = (id: string, at: number, extra: Partial<Scene> = {}): Scene => ({ id, name: id, loops: [0], settings, at, ...extra });
const loop = (slot: number, name: string, empty = false): PieceLoop => ({ slot, name, notes: empty ? 0 : 2, state: empty ? 'empty' : 'stopped', cells: [] });
function pieceProps(over: Partial<PieceStepsProps> = {}): PieceStepsProps {
  return {
    step: 'scenes', onStep: vi.fn(), running: false, lengthSec: 420, passSec: 5, clock: null,
    scenes: [scene('Arrival', 0), scene('Build', 90), scene('Open', 210)], currentScene: null,
    loops: [loop(0, 'Bed'), loop(1, 'Pulse'), ...[2, 3, 4, 5, 6, 7].map((s) => loop(s, '', true))],
    loopFadePasses: 1, performance: { ...DEFAULT_PERFORMANCE }, respectPlayer: true, canSaveBoard: true, loopsFull: false,
    deletedSceneName: null, diskLine: '', restoreError: null, worldOptions: [{ value: 'warm', label: 'Warm' }, { value: 'lofi', label: 'Lo-fi' }],
    readyItems: [], rows: 8, cols: 8, swatchFor: () => '#000', palette: BOARD_TOKENS.calm.dark, newLoop: null, playerName: 'Tim',
    colours: [{ id: 'c1', name: 'Black', swatch: '#111111', job: 'Melody', at: null }],
    onColourEntry: vi.fn(), onNewLoop: vi.fn(), onToggleLoop: vi.fn(), onSaveBoardToLoop: vi.fn(), onDrawLoop: vi.fn(), onClearLoop: vi.fn(),
    onRenameLoop: vi.fn(), onLoopFade: vi.fn(), onGoScene: vi.fn(), onRehearseFrom: vi.fn(), onSaveSceneFromNow: vi.fn(),
    onUpdateSceneFromNow: vi.fn(), onEditScene: vi.fn(), onDeleteScene: vi.fn(), onDuplicateScene: vi.fn(), onUndoDelete: vi.fn(), onMakePlan: vi.fn(),
    onRespectPlayer: vi.fn(), onNewIdeasScene: vi.fn(), onNewIdeasPiece: vi.fn(), surpriseMe: false, onSurpriseMe: vi.fn(),
    onPerformance: vi.fn(), onBackup: vi.fn(), onRestore: vi.fn(), onShow: vi.fn(),
    ...over,
  };
}
const renderPiece = (p: PieceStepsProps): void => { act(() => root.render(<PieceSteps {...p} />)); };
const more = (): HTMLButtonElement | undefined => button(/More for this scene/);
/** A scene's editor, from the line after its row to Delete scene. */
const sceneGroups = (): string[] => [...host.querySelectorAll('[role="radiogroup"]')].map((g) => g.getAttribute('aria-label') ?? '');

describe('A1: a scene shows its name, time, loops and Energy; the rest folds under More for this scene', () => {
  it('folded: the name, the time, the loops (and alone), Energy and Delete; nothing else to read through', () => {
    renderPiece(pieceProps());
    act(() => button(/^1:30 · Build/)?.click());
    expect(host.querySelector('input[aria-label="Scene name"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label^="When Build comes in"]')).not.toBeNull();
    expect(button('✓ Bed')).toBeDefined();
    expect(text()).toContain('Tim alone: no loops, only what Tim plays');
    expect(sceneGroups()).toEqual(['Energy of this scene']);
    expect(button('Delete scene')).toBeDefined();
    expect(more()?.getAttribute('aria-expanded')).toBe('false');
    // What is folded is still said, in one line.
    expect(more()?.textContent).toBe('▸ More for this sceneWarm · quiet band · band parts as before · no extra notes · sounds stay · 90 BPM · chords as before');
  });

  it('More for this scene still edits everything it did: each control changes the scene', () => {
    const p = pieceProps({ running: true, scenes: [scene('Arrival', 0), scene('Build', 90, { leadIn: undefined }), scene('Open', 210)] });
    renderPiece(p);
    act(() => button(/^1:30 · Build/)?.click());
    act(() => more()?.click());
    expect(sceneGroups()).toEqual([
      'Energy of this scene', 'Sound world', 'Band', 'Band parts', 'Lead-in', 'Chords', 'Extra notes', 'Sounds change', 'Reach this speed',
    ]);
    const edit = p.onEditScene as ReturnType<typeof vi.fn>;
    const last = (): unknown => edit.mock.calls[edit.mock.calls.length - 1];
    act(() => radio('Sound world', 'Lo-fi')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, soundWorld: 'lofi' } }]);
    act(() => radio('Band', 'Full')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, band: 'full' } }]);
    act(() => radio('Band parts', 'Choose parts')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, bandJobs: { ...settings.bandJobs, asBefore: false } } }]);
    act(() => radio('Lead-in', 'Drum fill')?.click());
    expect(last()).toEqual([1, { leadIn: 'drumFill' }]);
    act(() => radio('Chords', 'Rising')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, chords: { sequence: 'rising', bars: 2 } } }]);
    act(() => radio('Extra notes', 'Some')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, fillAmount: 0.5 } }]);
    act(() => radio('Sounds change', 'Slowly')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, evolveAmount: 0.35 } }]);
    act(() => radio('Reach this speed', 'Gradually')?.click());
    expect(last()).toEqual([1, { glideSec: 8 }]);
    act(() => radio('Energy of this scene', 'Driving')?.click());
    expect(last()).toEqual([1, { settings: { ...settings, sceneEnergy: 4 } }]);
    // The speed: a slider named Speed (not Tempo), 40 to 240.
    const speed = [...host.querySelectorAll('label')].find((l) => /^Speed/.test(l.textContent ?? ''));
    const slider = speed?.htmlFor ? document.getElementById(speed.htmlFor) as HTMLInputElement : null;
    expect(slider?.min).toBe('40');
    expect(slider?.max).toBe('240');
    act(() => button('↻ New ideas')?.click());
    expect(p.onNewIdeasScene).toHaveBeenCalledWith(1);
    act(() => button('Update from now')?.click());
    expect(p.onUpdateSceneFromNow).toHaveBeenCalledWith(1);
    act(() => button('Delete scene')?.click());
    expect(p.onDeleteScene).toHaveBeenCalledWith(1);
  });

  it('the fold is remembered: open on one scene, open on the next, and after the editor comes back', () => {
    renderPiece(pieceProps());
    act(() => button(/^1:30 · Build/)?.click());
    act(() => more()?.click());
    act(() => button(/^3:30 · Open/)?.click());
    expect(more()?.getAttribute('aria-expanded')).toBe('true');
    expect(sceneGroups()).toContain('Sound world');
    act(() => root.unmount());
    root = createRoot(host);
    renderPiece(pieceProps());
    act(() => button(/^0:00 · Arrival/)?.click());
    expect(more()?.getAttribute('aria-expanded')).toBe('true');
    act(() => more()?.click());
    expect(sceneGroups()).toEqual(['Energy of this scene']);
  });
});

describe('A16: the "comes in" swatches are the counters\' two-tone ring', () => {
  it('a black counter has its light inner ring and a ring against the card', () => {
    renderPiece(pieceProps());
    const card = host.querySelector('[role="group"][aria-labelledby="piece-colours"]');
    const chip = card?.querySelector<HTMLElement>('span[aria-hidden="true"]');
    // Two rings: 2 px against the counter, 4 px against the card (SwatchChip), not a 1 px border.
    expect(chip?.style.boxShadow).toMatch(/0 0 0 2px .+0 0 0 4px |0px 0px 0px 2px .+0px 0px 0px 4px /);
    expect(chip?.style.borderRadius).toBe('50%');
    expect(chip?.style.border).toBe('');
  });
});

// ---- the Sound tab ----

const band = (hue: number): TrackedColor => ({ hue } as TrackedColor);
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00', band: band(0) },
  { id: 'b', kind: 'hue', role: 'bass', swatch: '#00f', band: band(230) },
];
const helper = { reason: null, onTry: vi.fn(), onPrevious: vi.fn(), canPrevious: false, onFreeze: vi.fn(), frozen: false, freezeReason: null };
function soundProps(over: Partial<SoundTabProps> = {}): SoundTabProps {
  return {
    config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels, band: 'gentle', fillAmount: 0.5 },
    palette: BOARD_TOKENS.calm.dark, running: false, update: vi.fn(), setChannelSound: vi.fn(), onRole: vi.fn(), onLoopSlot: vi.fn(),
    onHear: vi.fn(), hearing: null, setGroove: vi.fn(),
    fill: { ...helper, count: 3, status: null }, evolve: { ...helper, lastChange: null },
    band: { playing: false, parts: [] }, liveValue: () => null, advanced: <p>advanced</p>,
    ...over,
  };
}
const renderSound = (p: SoundTabProps): void => { act(() => root.render(<SoundTab {...p} />)); };
const helperFolds = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('button[data-helper-fold]')];

describe('A1: each Sound tab helper folds to one line; Overall feel and Your colours stay open', () => {
  it('folded, each helper is one line saying how it is set; the feel and the colours are open', () => {
    renderSound(soundProps());
    expect(helperFolds().map((b) => b.textContent)).toEqual([
      '▸BandQuiet',
      '▸Keep my notes on topOn, the rest 3 dB quieter',
      '▸ChordsThe world’s own chords, 2 bars each',
      '▸Extra notesSome',
      '▸Sounds changeSlowly',
      '▸Loops varyOff',
    ]);
    expect(helperFolds().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    // Overall feel and Your colours: open, with their choices.
    expect(radios('Sound world').length).toBeGreaterThan(0);
    expect(radios('Energy').map((b) => b.childNodes[0]?.textContent)).toEqual(['Calm', 'Steady', 'Lively', 'Driving']);
    expect(host.querySelector('select[aria-label$=": sound"]')).not.toBeNull();
    // Folded, nothing of a helper's own is there.
    expect(radios('Band')).toHaveLength(0);
    expect(radios('How many')).toHaveLength(0);
    expect(button(/New idea/)).toBeUndefined();
  });

  it('opened, a helper does all it did; it stays open for the session', () => {
    const p = soundProps();
    renderSound(p);
    act(() => button(/^▸Extra notes/)?.click());
    act(() => radio('How many', 'Lots')?.click());
    expect(p.update).toHaveBeenCalledWith({ fillAmount: 0.8 });
    const newIdea = button('↻ New idea');
    expect(newIdea?.getAttribute('aria-label')).toBe('New idea: other extra notes');
    act(() => newIdea?.click());
    expect(p.fill.onTry).toHaveBeenCalled();
    act(() => button(/^▸Sounds change/)?.click());
    expect(button('↻ New sound')).toBeDefined();
    act(() => button(/^▸Band/)?.click());
    act(() => radio('Band', 'Full')?.click());
    expect(p.update).toHaveBeenCalledWith({ band: 'full' });
    act(() => root.unmount());
    root = createRoot(host);
    renderSound(p);
    expect(radios('How many')).not.toHaveLength(0);
    expect(radios('Band')).not.toHaveLength(0);
  });

  it('Groove says it sets the Timing tab\'s swing and loose timing in one step (the two swings, labelled)', () => {
    renderSound(soundProps({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, channels, swing: 0.33, humanize: 0.08 } }));
    expect(text()).toContain('Sets the swing and loose timing on the Timing tab in one step.');
    renderSound(soundProps({ config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, channels, swing: 0.2, humanize: 0.5 } }));
    expect(text()).toContain('Your own swing (20%) and loose timing (50%), set finely on the Timing tab.');
  });
});

// ---- A2: one word list ----

describe('A2: one word list, the same on the laptop, the iPad and in Help', () => {
  it('Energy has the same names in a scene and on the Sound tab, and Big for 5', () => {
    expect(ENERGY_NAMES.slice(1, 5)).toEqual(ENERGY.map((s) => s.label));
    expect(ENERGY_NAMES[5]).toBe('Big');
    expect(ENERGY_NAMES[0]).toBe('Off');
    for (const e of [0, 1, 2, 3, 4, 5] as const) expect(ENERGY_WORDS[e].startsWith(`${ENERGY_NAMES[e]}:`)).toBe(true);
  });

  it('a colour\'s control job, the hat and a disabled control all use the same words, with no "(fader)"', () => {
    for (const [role, word] of Object.entries(FADER_WORDS)) {
      expect(ROLE_LABELS[role as keyof typeof ROLE_LABELS]).toBe(word);
      expect(CAP_ROLE_LABELS[role as keyof typeof CAP_ROLE_LABELS]).toBe(word);
    }
    expect(Object.values(ROLE_LABELS).flatMap(retiredWordsIn)).toEqual([]);
    expect(ROLE_LABELS.delayToggle).toBe('Echo on/off');
  });

  it('none of the retired words is in Help', () => {
    act(() => root.render(<BoardHelp />));
    expect(retiredWordsIn(text())).toEqual([]);
    expect(text()).toContain('Timing');
  });

  it('none is in Make a piece, every step, with a scene and its More open', () => {
    for (const step of ['loops', 'scenes', 'ending'] as const) {
      forgetFolds();
      renderPiece(pieceProps({ step }));
      if (step === 'loops') act(() => button(/Other ways to make a loop/)?.click());
      if (step === 'scenes') { act(() => button(/^1:30 · Build/)?.click()); act(() => more()?.click()); }
      expect(retiredWordsIn(text()), step).toEqual([]);
    }
    // The old way of keeping a loop is named by the list's words.
    renderPiece(pieceProps({ step: 'loops' }));
    expect(button(WORDS.keepBoardAsLoop)).toBeDefined();
  });

  it('none is on the Sound tab with every helper open', () => {
    renderSound(soundProps());
    for (const b of helperFolds()) act(() => b.click());
    expect(retiredWordsIn(text())).toEqual([]);
  });

  it('the list knows the words it replaced', () => {
    expect(RETIRED_WORDS.length).toBeGreaterThan(8);
    expect(retiredWordsIn('Try another · Fill amount (fader) · Tempo')).toHaveLength(3);
    expect(retiredWordsIn('Extra notes · Speed · 90 BPM · delayed')).toEqual([]);
  });
});

// ---- A14: visible questions, and the Ready check's buttons ----

describe('A14: a segmented choice shows its question', () => {
  it('showLabel puts the question above the choices, said once to a screen reader', () => {
    act(() => root.render(<SegmentedControl label="When it ends" showLabel value="cue" onChange={vi.fn()} options={[{ value: 'cue', label: 'When I press End' }, { value: 'auto', label: 'By itself' }]} />));
    const visible = host.querySelector('span[aria-hidden="true"]');
    expect(visible?.textContent).toBe('When it ends');
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('When it ends');
  });

  it('Make a piece asks its questions in view: the ending\'s length, when it ends, the loops\' fade', () => {
    renderPiece(pieceProps({ step: 'ending' }));
    const shown = [...host.querySelectorAll('span[aria-hidden="true"]')].map((s) => s.textContent);
    expect(shown).toContain('The ending takes');
    expect(shown).toContain('When it ends');
  });
});

describe('A14: each Ready-check fix made elsewhere has a place, and the list shows a button to it', () => {
  it('the checks say where each fix is made', () => {
    expect(boardItem({ laptop: true, cameraOk: false })).toMatchObject({ state: 'note', place: 'cameraBoard' });
    expect(boardItem({ laptop: true, cameraOk: false }).fix).not.toContain('📷');
    expect(boardItem({ laptop: false, cameraOk: false }).place).toBe('setupCamera');
    expect(ipadCheckItems({ enabled: true, connected: false, safeLayout: true, pageOutOfDate: false, playerName: 'Tim', onUseSafeLayout: vi.fn() })[0].place).toBe('connections');
    expect(keepingTimeCheckItems({ report: null, running: false, valve: [] })[0].place).toBeUndefined();
    const items = pieceCheckItems({
      scenes: [scene('Build', 90)], loopSlots: [[{ row: 0, col: 0, colour: 'm' }]], loopNames: [], performance: { ...DEFAULT_PERFORMANCE }, passSec: 5,
      playerName: 'Tim', onTakeOut: vi.fn(), colourTimes: [],
    });
    expect(items.find((i) => i.label === 'No scene at 0:00')?.place).toBe('scenes');
  });

  it('the list shows the button the screen made from the place, with its real words', () => {
    const go = vi.fn();
    act(() => root.render(<ReadyList items={[{ label: 'No scene at 0:00', state: 'warn', fix: 'Give the opening scene the time 0:00.', place: 'scenes', action: { label: PLACE_WORDS.scenes, name: `${PLACE_WORDS.scenes}: No scene at 0:00`, onClick: go } }]} />));
    act(() => button('Go to Scenes')?.click());
    expect(go).toHaveBeenCalled();
    expect(Object.values(PLACE_WORDS)).toContain('Use the camera board');
  });
});

// ---- A3: the header's More ----

describe('A3: below about 1400 px the less-used header buttons are under More', () => {
  const items = (): JSX.Element => <><button type="button">Open the audience screen</button><button type="button">⚙ Set up</button></>;

  it('wide: the buttons sit in the header, no More', () => {
    act(() => root.render(<HeaderMore folded={false}>{items()}</HeaderMore>));
    expect(button('More ▾')).toBeUndefined();
    expect(button('⚙ Set up')).toBeDefined();
  });

  it('narrow: More opens them, and Esc closes it with focus back on More', () => {
    act(() => root.render(<HeaderMore folded>{items()}</HeaderMore>));
    const group = host.querySelector('[role="group"][aria-label="More"]') as HTMLElement;
    expect(group.hidden).toBe(true);
    act(() => button('More ▾')?.click());
    expect(group.hidden).toBe(false);
    expect(button('More ▴')?.getAttribute('aria-expanded')).toBe('true');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(group.hidden).toBe(true);
    expect(document.activeElement).toBe(button('More ▾'));
  });

  it('a button waiting for its second press keeps the menu open', () => {
    act(() => root.render(<HeaderMore folded keepOpen>{items()}</HeaderMore>));
    expect((host.querySelector('[role="group"][aria-label="More"]') as HTMLElement).hidden).toBe(false);
  });
});

// ---- A16: ↶ from set-up to the Board view ----

describe('A16: ↶ keeps the sound before from set-up into the Board view', () => {
  function tableProps(chs: ColourChannel[], over: Partial<ColourTableProps> = {}): ColourTableProps {
    return {
      config: { ...DEFAULT_BOARD_SEQUENCER_CONFIG, soundWorld: 'warm', channels: chs }, palette: BOARD_TOKENS.calm.dark,
      roleLockedReason: null, onRole: vi.fn(), onLoopSlot: vi.fn(), setChannelSound: vi.fn(), onHear: vi.fn(), hearing: null, ...over,
    };
  }
  const back = (): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Back to') ?? false);

  it('a sound changed in Set up → Colours can be undone on the Sound tab, a new table', () => {
    const before = channels.map((c) => ({ ...c }));
    act(() => root.render(<ColourTable {...tableProps(before)} />));
    const changed = before.map((c) => (c.id === 'm' ? { ...c, instrument: 'marimba' } : c));
    act(() => root.render(<ColourTable {...tableProps(changed)} />));
    // Set up closes; the Board view's Sound tab opens its own table.
    act(() => root.unmount());
    root = createRoot(host);
    const set = vi.fn();
    act(() => root.render(<ColourTable {...tableProps(changed, { setChannelSound: set })} />));
    expect(back()?.disabled).toBe(false);
    act(() => back()?.click());
    expect(set).toHaveBeenCalledWith('m', { instrument: undefined });
  });

  it('another player: their ↶ starts empty', () => {
    const before = channels.map((c) => ({ ...c }));
    act(() => root.render(<ColourTable {...tableProps(before)} />));
    act(() => root.render(<ColourTable {...tableProps(before.map((c) => (c.id === 'm' ? { ...c, instrument: 'marimba' } : c)))} />));
    forgetSoundsBefore();
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<ColourTable {...tableProps(before.map((c) => (c.id === 'm' ? { ...c, instrument: 'marimba' } : c)))} />));
    expect(back()?.disabled).toBe(true);
  });
});

describe('U8: the Sound tab reads in sections', () => {
  it('each section after the first starts with a hairline and air above its heading', () => {
    renderSound(soundProps());
    const sections = [...host.querySelectorAll('section')] as HTMLElement[];
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections[0].style.borderTop).toBe('');
    for (const s of sections.slice(1)) {
      expect(s.style.borderTop).toContain('var(--bs-border)');
      expect(parseInt(s.style.paddingTop, 10)).toBeGreaterThanOrEqual(12);
    }
  });
  it('a caption above a choice is a little bolder than the sentence under it', () => {
    renderSound(soundProps());
    const caption = [...host.querySelectorAll('span')].find((s) => s.textContent === 'World') as HTMLElement;
    expect(caption.style.fontWeight).toBe('600');
  });
});
