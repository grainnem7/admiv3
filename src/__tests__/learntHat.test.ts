import { describe, it, expect, beforeEach } from 'vitest';
import {
  capMask, capPatches, DEFAULT_CAP_COLOUR, findCap, findLearntHat, lookAlikes, pickCap, sanitizeCapSettings, type Frame,
} from '../tracking/cap/capTracker';
import {
  hatMask, hatTable, lightGain, loadLearntHat, sanitizeLearntHat, storeLearntHat, HAT_BINS, HAT_SURE_DEFAULT, HAT_SURE_MAX,
  HAT_SURE_MIN, ROOM_PICTURE_H, ROOM_PICTURE_W, type HatModel,
} from '../tracking/cap/hatColour';
import { learnHat, learnRoom, roomLearner, type HatLearning } from '../tracking/cap/learnHat';
import {
  createBoardPlayer, loadActiveBoardConfig, saveActiveBoardConfig, setActiveBoardPlayer,
} from '../profiles/BoardProfiles';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import { snapshotStorage } from '../storage/boardBackup';

/**
 * Learning the hat against the room, on synthetic 160×120 camera pictures (no real
 * pictures): a wall, the player (face and shirt), sometimes a red chair, and the hat.
 * Every picture has a little camera noise, so colours spread as they do in a real camera.
 */
const W = 160;
const H = 120;
type RGB = readonly [number, number, number];
const WALL: RGB = [120, 120, 125];
const SKIN: RGB = [205, 150, 125];
const SHIRT: RGB = [60, 80, 120];
/** The chair: a duller, browner red than the hat, but red enough for today's colour rule. */
const CHAIR: RGB = [170, 50, 45];
const HAT: RGB = [200, 30, 40];
const CHAIR_BOX = { x0: 0.72, y0: 0.5, x1: 0.95, y1: 0.95 };
const HAT_R = 0.07;

interface Thing { disc?: { x: number; y: number; r: number }; box?: typeof CHAIR_BOX; rgb: RGB }

interface Scene {
  /** Where the hat is, or no hat. The head is just under it. */
  hat: { x: number; y: number } | null;
  /** Where the head is when there is no hat. */
  head?: { x: number; y: number };
  chair?: boolean;
  extras?: Thing[];
  /** The room's light: a gain on each colour channel. */
  light?: RGB;
  /** Light from one side: this much brighter at the left edge, and as much darker at the right. */
  sideLight?: number;
  seed: number;
}

/** A small repeatable random source, so every run sees the same camera noise. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inDisc = (x: number, y: number, d: { x: number; y: number; r: number }): boolean =>
  Math.hypot(x / W - d.x, (y / H - d.y) * (H / W)) < d.r;
const inBox = (x: number, y: number, b: typeof CHAIR_BOX): boolean =>
  x / W >= b.x0 && x / W < b.x1 && y / H >= b.y0 && y / H < b.y1;

function picture(s: Scene): Frame {
  const head = s.hat ? { x: s.hat.x, y: s.hat.y + 0.12 } : (s.head ?? { x: 0.5, y: 0.45 });
  const things: Thing[] = [
    { box: { x0: 0.3, y0: 0.62, x1: 0.7, y1: 1 }, rgb: SHIRT },
    { disc: { ...head, r: 0.09 }, rgb: SKIN },
    ...(s.chair ? [{ box: CHAIR_BOX, rgb: CHAIR }] : []),
    ...(s.extras ?? []),
    ...(s.hat ? [{ disc: { ...s.hat, r: HAT_R }, rgb: HAT }] : []),
  ];
  const light = s.light ?? [1, 1, 1];
  const rnd = random(s.seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = WALL;
      for (const t of things) {
        if ((t.disc && inDisc(x, y, t.disc)) || (t.box && inBox(x, y, t.box))) c = t.rgb;
      }
      const i = (y * W + x) * 4;
      const side = 1 + (s.sideLight ?? 0) * (1 - (2 * x) / W);
      for (let ch = 0; ch < 3; ch++) data[i + ch] = (c[ch] + Math.round(rnd() * 12 - 6)) * light[ch] * side;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

/** The same picture the other way round, as with "Picture like a mirror" turned on. */
function mirrored(f: Frame): Frame {
  const data = new Uint8ClampedArray(f.data.length);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const from = (y * f.width + x) * 4; const to = (y * f.width + (f.width - 1 - x)) * 4;
      for (let ch = 0; ch < 4; ch++) data[to + ch] = f.data[from + ch];
    }
  }
  return { data, width: f.width, height: f.height };
}

/** "Learn the room": the player in place with the hat off, moving a little. */
const roomFrames = (extra: Partial<Scene> = {}, n = 36): Frame[] => Array.from({ length: n }, (_, i) => picture({
  hat: null, head: { x: 0.5 + 0.03 * Math.sin(i / 3), y: 0.45 + 0.015 * Math.cos(i / 4) }, seed: 1 + i, ...extra,
}));
/** Where the hat is in "Learn the hat": the head moving a little, any way it can. */
const hatAt = (i: number): { x: number; y: number } => ({ x: 0.5 + 0.04 * Math.sin(i / 3), y: 0.33 + 0.02 * Math.cos(i / 4) });
const hatFrames = (extra: Partial<Scene> = {}, n = 36): Frame[] =>
  Array.from({ length: n }, (_, i) => picture({ hat: hatAt(i), seed: 100 + i, ...extra }));

/** The share of an area's pixels that the mask takes for the hat. */
function share(mask: Uint8Array, inside: (x: number, y: number) => boolean): number {
  let n = 0; let on = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      n++; on += mask[y * W + x];
    }
  }
  return on / n;
}
const onChair = (x: number, y: number): boolean => inBox(x, y, CHAIR_BOX);
const onHat = (at: { x: number; y: number }) => (x: number, y: number): boolean => inDisc(x, y, { ...at, r: HAT_R });

/** The hat learnt in a room with a red chair (learnt once, used by several tests). */
let chairRoom: HatLearning | null = null;
function learntWithChair(): HatLearning {
  if (!chairRoom) chairRoom = learnHat(learnRoom(roomFrames({ chair: true })), hatFrames({ chair: true }), HAT_SURE_DEFAULT);
  return chairRoom;
}

describe('learning the hat against the room', () => {
  it("a red chair and a hat of a slightly different red: today's colour rule takes the chair, the learnt hat only the hat", () => {
    const at = { x: 0.45, y: 0.32 };
    const play = picture({ hat: at, chair: true, seed: 999 });
    // Today's rule: the chair is red enough and bigger than the hat, so it is "the cap".
    expect(findCap(play, DEFAULT_CAP_COLOUR)!.x).toBeGreaterThan(0.72);
    const learnt = learntWithChair();
    expect(learnt.outcome).toBe('ok');
    expect(learnt.of).toBeGreaterThanOrEqual(10);
    expect(learnt.found / learnt.of).toBeGreaterThan(0.8);
    const found = findLearntHat(play, learnt.model!, HAT_SURE_DEFAULT, null).sighting!;
    expect(found.x).toBeCloseTo(at.x, 1);
    expect(found.y).toBeCloseTo(at.y, 1);
    const mask = hatMask(play, learnt.model!, HAT_SURE_DEFAULT);
    expect(share(mask, onChair)).toBeLessThan(0.01);
    expect(share(mask, onHat(at))).toBeGreaterThan(0.8);
  });

  it('the light changes after learning (40% dimmer and warmer): the hat is still found, in the same place', () => {
    const at = { x: 0.55, y: 0.34 };
    const { model } = learntWithChair();
    const before = findLearntHat(picture({ hat: at, chair: true, seed: 2000 }), model!, HAT_SURE_DEFAULT, null).sighting!;
    const warmDim: RGB = [0.6 * 1.2, 0.6, 0.6 * 0.8];
    const dim = picture({ hat: at, chair: true, light: warmDim, seed: 2001 });
    const after = findLearntHat(dim, model!, HAT_SURE_DEFAULT, null).sighting!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.02);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.02);
    const mask = hatMask(dim, model!, HAT_SURE_DEFAULT);
    expect(share(mask, onChair)).toBeLessThan(0.01);
    expect(share(mask, onHat(at))).toBeGreaterThan(0.7);
  });

  it('no hat in the second step: "couldn\'t see the hat", and nothing to save', () => {
    const noHat = Array.from({ length: 36 }, (_, i) => picture({
      hat: null, head: { x: 0.5 + 0.04 * Math.cos(i / 3), y: 0.46 }, chair: true, seed: 300 + i,
    }));
    const r = learnHat(learnRoom(roomFrames({ chair: true })), noHat, HAT_SURE_DEFAULT);
    expect(r.outcome).toBe('not-seen');
    expect(r.model).toBeNull();
  });

  it('the hat step before the room step: the room first, and nothing to save', () => {
    const r = learnHat(null, hatFrames(), HAT_SURE_DEFAULT);
    expect(r.outcome).toBe('no-room');
    expect(r.model).toBeNull();
  });

  it('a room with something of the hat\'s own colour: learnt, with a warning and where it is', () => {
    const mug: Thing = { disc: { x: 0.15, y: 0.8, r: 0.028 }, rgb: HAT };
    const r = learnHat(learnRoom(roomFrames({ extras: [mug] })), hatFrames({ extras: [mug] }), HAT_SURE_DEFAULT);
    expect(r.outcome).toBe('look-alike');
    expect(r.model).not.toBeNull();
    const box = r.lookAlike!;
    expect(box.x + box.w / 2).toBeCloseTo(0.15, 1);
    expect(box.y + box.h / 2).toBeCloseTo(0.8, 1);
  });

  it('the hat seen in only a few pictures: hard to tell, and nothing to save', () => {
    const frames = hatFrames().map((f, i) => (i < 8 ? f : picture({ hat: null, seed: 500 + i })));
    const r = learnHat(learnRoom(roomFrames()), frames, HAT_SURE_DEFAULT);
    expect(r.outcome).toBe('hard');
    expect(r.model).toBeNull();
    expect(r.found / r.of).toBeLessThan(0.5);
  });

  it('too few pictures of the room: nothing learnt', () => {
    expect(learnRoom([])).toBeNull();
    expect(learnRoom(roomFrames({}, 3))).toBeNull();
  });
});

/**
 * B7: Learn the room with the hat still on would learn the hat as part of the room, and step 2
 * then says only "Couldn't see the hat". Step 1 watches for something hat-like: a patch of
 * the cap's colour that moves with the head (a red chair stays put), or one on the head when
 * the face is known.
 */
describe('Learn the room with the hat still on', () => {
  const watch = (frames: Frame[], faces: ({ x: number; y: number; w: number; h: number } | null)[] = []) => {
    const l = roomLearner();
    frames.forEach((f, k) => l.add(f, faces[k] ?? null));
    return { room: l.finish(), hatSeen: l.hatSeen() };
  };

  it('the hat on, the head moving a little: seen, in a room with a red chair too', () => {
    expect(watch(hatFrames({ chair: true })).hatSeen).toBe(true);
    expect(watch(hatFrames()).hatSeen).toBe(true);
  });

  it('the hat off: a red chair that stays put is not the hat, and the room is learnt', () => {
    const r = watch(roomFrames({ chair: true }));
    expect(r.hatSeen).toBe(false);
    expect(r.room).not.toBeNull();
  });

  it('the hat on a still head: seen when the face is known (on the head), not without it', () => {
    const at = { x: 0.5, y: 0.33 };
    const frames = Array.from({ length: 24 }, (_, i) => picture({ hat: at, chair: true, seed: 300 + i }));
    const face = { x: 0.41, y: 0.36, w: 0.18, h: 0.22 };
    expect(watch(frames, frames.map(() => face)).hatSeen).toBe(true);
    expect(watch(frames).hatSeen).toBe(false);
  });

  it('the red chair with a face in the picture: not on the head, so not the hat', () => {
    const frames = roomFrames({ chair: true });
    const face = { x: 0.41, y: 0.36, w: 0.18, h: 0.22 };
    expect(watch(frames, frames.map(() => face)).hatSeen).toBe(false);
  });
});

describe('storing the learnt hat', () => {
  const stored = (): ReturnType<typeof storeLearntHat> => storeLearntHat(learntWithChair().model!, 0.7, 1_793_000_000_000);

  it('survives a save and a load, close to what was learnt', () => {
    const s = stored();
    const back = sanitizeLearntHat(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    const model = loadLearntHat(back!)!;
    const orig = learntWithChair().model!;
    for (const k of ['hat', 'room'] as const) {
      for (let b = 0; b < HAT_BINS; b++) {
        // Only the colours a picture can have are kept: red and green shares add to under 1.
        const i = Math.floor(b / 32) % 32; const j = b % 32;
        if (i + j > 31) continue;
        const a = orig[k][b]; const v = model[k][b];
        // Stored as bytes on a log scale: within a few percent and a speck.
        expect(Math.abs(v - a)).toBeLessThanOrEqual(0.004 + 0.03 * a);
      }
    }
    // The same hat is found from what was stored.
    const play = picture({ hat: { x: 0.45, y: 0.32 }, chair: true, seed: 999 });
    expect(findLearntHat(play, model, 0.7, null).sighting!.x).toBeCloseTo(0.45, 1);
  });

  it('is kept by the cap settings, and anything malformed is dropped (back to the clicked colour)', () => {
    const s = stored();
    expect(sanitizeCapSettings({}).learntHat).toBeNull();
    expect(sanitizeCapSettings({ learntHat: s }).learntHat).toEqual(s);
    const bad: unknown[] = [
      null, 'hat', 5, {}, { ...s, v: 2 }, { ...s, hat: undefined }, { ...s, room: 7 },
      { ...s, hat: 'AAAA' }, { ...s, picture: s.picture.slice(8) }, { ...s, room: '!!not base64!!' },
      { ...s, hat: storeLearntHat({ ...learntWithChair().model!, hat: new Float32Array(HAT_BINS) }, 0.6, 0).hat },
    ];
    for (const b of bad) {
      expect(sanitizeLearntHat(b)).toBeNull();
      expect(sanitizeCapSettings({ learntHat: b }).learntHat).toBeNull();
    }
    // A sureness out of range is brought into range, not a reason to forget the hat.
    expect(sanitizeLearntHat({ ...s, sure: 5 })!.sure).toBe(HAT_SURE_MAX);
    expect(sanitizeLearntHat({ ...s, sure: 'x' })!.sure).toBe(HAT_SURE_DEFAULT);
  });

  it('is small: well under 50 KB, even with every colour seen', () => {
    expect(JSON.stringify(stored()).length).toBeLessThan(50_000);
    const full: HatModel = {
      ...learntWithChair().model!,
      hat: new Float32Array(HAT_BINS).fill(1234.5),
      room: new Float32Array(HAT_BINS).fill(0.37),
    };
    expect(JSON.stringify(storeLearntHat(full, 0.6, Date.now())).length).toBeLessThan(25_000);
  });
});

describe('the learnt hat while playing', () => {
  const at = { x: 0.45, y: 0.32 };

  it("the light can't be measured (the room learnt in the dark, or the picture blown out): no correction, and the hat is still found", () => {
    const { model } = learntWithChair();
    const play = picture({ hat: at, chair: true, seed: 999 });
    // Every value of the room's small picture too dark to trust: too few samples, so no correction.
    const dark: HatModel = { ...model!, picture: new Float32Array(ROOM_PICTURE_W * ROOM_PICTURE_H * 3).fill(8) };
    expect(lightGain(play, dark.picture)).toEqual([1, 1, 1]);
    // Every value of this picture clipped: the same.
    const white: Frame = { data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H };
    expect(lightGain(white, model!.picture)).toEqual([1, 1, 1]);
    const found = findLearntHat(play, dark, HAT_SURE_DEFAULT, null).sighting!;
    expect(found.x).toBeCloseTo(at.x, 1);
    expect(found.y).toBeCloseTo(at.y, 1);
    expect(share(hatMask(play, dark, HAT_SURE_DEFAULT), onChair)).toBeLessThan(0.01);
  });

  it('nothing is learnt while playing: the learnt hat is only read, and which colours count is worked out once per sureness', () => {
    const { model } = learntWithChair();
    const before = { hat: Float32Array.from(model!.hat), room: Float32Array.from(model!.room), picture: Float32Array.from(model!.picture) };
    for (let i = 0; i < 12; i++) {
      const light: RGB = i % 2 ? [0.7, 0.7, 0.7] : [1, 1, 1];
      findLearntHat(picture({ hat: hatAt(i), chair: true, light, seed: 3000 + i }), model!, HAT_SURE_DEFAULT, null);
    }
    expect(model!.hat).toEqual(before.hat);
    expect(model!.room).toEqual(before.room);
    expect(model!.picture).toEqual(before.picture);
    // Per pixel it is one lookup in this table: the same table, frame after frame.
    expect(hatTable(model!, HAT_SURE_DEFAULT)).toBe(hatTable(model!, HAT_SURE_DEFAULT));
  });

  it('"How sure before it counts" starts at 0.6 and goes from 0.3 to 0.9: surer never takes more colours, and the hat is found across the range', () => {
    expect([HAT_SURE_MIN, HAT_SURE_DEFAULT, HAT_SURE_MAX]).toEqual([0.3, 0.6, 0.9]);
    const { model } = learntWithChair();
    const loose = Uint8Array.from(hatTable(model!, HAT_SURE_MIN));
    const sure = Uint8Array.from(hatTable(model!, HAT_SURE_MAX));
    let more = 0;
    for (let b = 0; b < HAT_BINS; b++) {
      expect(sure[b]).toBeLessThanOrEqual(loose[b]);
      more += loose[b] - sure[b];
    }
    expect(more).toBeGreaterThan(0);
    const play = picture({ hat: at, chair: true, seed: 999 });
    for (const s of [HAT_SURE_MIN, HAT_SURE_MAX]) {
      expect(findLearntHat(play, model!, s, null).sighting!.x).toBeCloseTo(at.x, 1);
      expect(share(hatMask(play, model!, s), onChair)).toBeLessThan(0.01);
    }
  });

  it('the picture turned to a mirror after learning, in a room lit from one side: the light still reads as unchanged, and the hat is found', () => {
    const side = { sideLight: 0.5, chair: true };
    const learnt = learnHat(learnRoom(roomFrames(side)), hatFrames(side), HAT_SURE_DEFAULT);
    expect(learnt.outcome).toBe('ok');
    const play = mirrored(picture({ hat: at, ...side, seed: 4000 }));
    // The room is the other way round now; the median of the light's ratios hardly minds (a
    // brightness bin is a factor of about 1.7).
    for (const g of lightGain(play, learnt.model!.picture)) expect(Math.abs(g - 1)).toBeLessThan(0.15);
    const found = findLearntHat(play, learnt.model!, HAT_SURE_DEFAULT, null).sighting!;
    expect(found.x).toBeCloseTo(1 - at.x, 1);
    expect(found.y).toBeCloseTo(at.y, 1);
  });

  it('Show what it sees as the hat: anything else taken for the hat is outlined, never the one followed', () => {
    const play = picture({ hat: at, chair: true, seed: 999 });
    // Today's colour rule follows the chair; the hat is the other red patch, so it is outlined.
    const byColour = capPatches(capMask(play, DEFAULT_CAP_COLOUR), W, H).patches;
    const followed = pickCap(byColour, null)!;
    expect(followed.x).toBeGreaterThan(0.72);
    const others = lookAlikes(byColour, followed);
    expect(others).toHaveLength(1);
    expect(others[0].x).toBeCloseTo(at.x, 1);
    expect(others[0].x0).toBeLessThan(at.x);
    expect(others[0].x1).toBeGreaterThan(at.x);
    // The learnt hat takes only the hat: nothing to outline.
    const learnt = findLearntHat(play, learntWithChair().model!, HAT_SURE_DEFAULT, null);
    expect(lookAlikes(learnt.patches, learnt.sighting)).toEqual([]);
    // A mug of the hat's own red in the room: the hat is followed, the mug outlined.
    const mug: Thing = { disc: { x: 0.15, y: 0.8, r: 0.028 }, rgb: HAT };
    const withMug = learnHat(learnRoom(roomFrames({ extras: [mug] })), hatFrames({ extras: [mug] }), HAT_SURE_DEFAULT);
    const seen = findLearntHat(picture({ hat: at, extras: [mug], seed: 5000 }), withMug.model!, HAT_SURE_DEFAULT, null);
    expect(seen.sighting!.x).toBeCloseTo(at.x, 1);
    const outlined = lookAlikes(seen.patches, seen.sighting);
    expect(outlined).toHaveLength(1);
    expect(outlined[0].x).toBeCloseTo(0.15, 1);
    expect(outlined[0].y).toBeCloseTo(0.8, 1);
    // Nothing followed: every patch is outlined.
    expect(lookAlikes(byColour, null)).toHaveLength(byColour.length);
  });
});

describe('the learnt hat kept with the player', () => {
  beforeEach(() => localStorage.clear());
  const hat = (): ReturnType<typeof storeLearntHat> => storeLearntHat(learntWithChair().model!, 0.65, 1_793_000_000_000);

  it("is saved with the player's profile, comes back when the app is opened again, and is no other player's", () => {
    const tim = createBoardPlayer('Tim', 'left');
    const learnt = hat();
    const cfg = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, cap: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.cap, enabled: true, learntHat: learnt } };
    expect(saveActiveBoardConfig(cfg, tim.id)).toBe(true);
    // Opening the app again reads it all back from what the browser saved.
    expect(loadActiveBoardConfig()!.cap.learntHat).toEqual(learnt);
    // Another player has the clicked colour, as before.
    createBoardPlayer('Ann', 'right');
    expect(loadActiveBoardConfig()!.cap.learntHat).toBeNull();
    setActiveBoardPlayer(tim.id);
    expect(loadActiveBoardConfig()!.cap.learntHat).toEqual(learnt);
  });

  it("is small next to what the laptop's copy can hold (8 MB): ten players with a hat each add well under 200 KB", () => {
    const players = Array.from({ length: 10 }, (_, i) => createBoardPlayer(`Player ${i + 1}`, 'right'));
    for (const p of players) saveActiveBoardConfig(DEFAULT_BOARD_SEQUENCER_CONFIG, p.id);
    const without = JSON.stringify(snapshotStorage(localStorage)).length;
    const learnt = hat();
    for (const p of players) {
      const cfg = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, cap: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.cap, learntHat: learnt } };
      saveActiveBoardConfig(cfg, p.id);
    }
    const withHats = JSON.stringify(snapshotStorage(localStorage)).length;
    expect((withHats - without) / players.length).toBeLessThan(20_000);
    expect(withHats).toBeLessThan(8 * 1024 * 1024 / 20);
  });
});
