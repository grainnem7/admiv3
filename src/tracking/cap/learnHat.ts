/**
 * Learning the hat in two short steps, done by the facilitator with the player in place:
 * 1. Learn the room (hat off): every colour seen is "not the hat" — room, skin, clothes,
 *    chair — and a small picture of the room is kept, to correct the light against.
 * 2. Learn the hat (hat on, the head moving a little in any way): in each picture, the
 *    colours that are new against the room, in the biggest patch of them on the head.
 * Nothing asks the player to hold still or hold a pose: every picture is used as it comes,
 * and pictures where the hat can't be told apart are simply skipped.
 *
 * Then a check on pictures from both steps: how often the learnt hat is found where the hat
 * was, and whether anything in the room would pass for it (and where).
 *
 * Each picture is taken in as it arrives (a couple of milliseconds), so the end of a step
 * only has the short check to do: the music's timing must not stall while it learns.
 *
 * Pure — pictures in, a model and a verdict out — so it is tested on synthetic pictures.
 */
import {
  capMask, capPatches, DEFAULT_CAP_COLOUR, onTheHead, pickCap, type CapColour, type CapPatch, type FaceBox, type Frame,
} from './capTracker';
import {
  blurHistogram, frameBins, hatMask, HAT_BINS, lightGain, ROOM_PICTURE_H, ROOM_PICTURE_W, smallPicture, type HatModel,
} from './hatColour';

/** Fewer pictures of the room than this: not enough to know it. */
export const MIN_ROOM_FRAMES = 8;
/** The hat must be told apart in at least this many pictures to be learnt. */
export const MIN_HAT_FRAMES = 6;
/** Found in fewer than this share of its pictures: too hard to tell from the room to use. */
export const HARD_SHARE = 0.5;
/** How many pictures of each step the check at the end looks at (spread over the step). */
const CHECK_HAT_FRAMES = 12;
const CHECK_ROOM_FRAMES = 8;
/**
 * A colour is new against the room when the room shows hardly any of it: at most
 * NEW_FLOOR pixels per picture, plus a quarter (1 / NEW_RATIO) of how much of it this
 * picture shows. So a speck of the hat's red in the room (a mug, a badge) doesn't stop the
 * hat being learnt — the check then points it out — while skin, clothes and anything big in
 * the room stay "not the hat".
 */
const NEW_FLOOR = 1;
const NEW_RATIO = 4;

const PICTURE_LEN = ROOM_PICTURE_W * ROOM_PICTURE_H * 3;

/** Pictures spread evenly over a step (all of them when there are few). */
function spread<T>(items: readonly T[], n: number): T[] {
  return items.length <= n ? [...items] : Array.from({ length: n }, (_, k) => items[Math.floor((k * items.length) / n)]);
}

export interface LearntRoom {
  /** Pixels of each colour bin per picture, blurred by a bin. */
  room: Float32Array;
  /** Its small picture, to correct the light against. */
  picture: Float32Array;
  /** A few of its pictures, to check afterwards that nothing in it passes for the hat. */
  check: Frame[];
}

export interface RoomLearner {
  /** A picture of the room, and the face when face tracking found one. */
  add(f: Frame, face?: FaceBox | null): void;
  /** The room learnt, or null with too few pictures. */
  finish(): LearntRoom | null;
  /**
   * Something hat-like was seen while learning the room: the hat is probably still on, and
   * the room must not be kept (it would take the hat for part of the room).
   */
  hatSeen(): boolean;
}

/** A patch of the cap's colour that has moved at least this far (of the picture) moves with the head. */
const HAT_MOVES = 0.02;
/** A patch is followed from picture to picture while it moves less than this between them. */
const HAT_FOLLOW = 0.1;
/** Seen in at least this many pictures (or this share of those with a face) before it counts. */
const HAT_SEEN_MIN = 3;
const HAT_ON_HEAD_SHARE = 1 / 3;
/** A patch bigger than this share of the picture is not a hat. */
const HAT_MAX_AREA = 0.08;

/**
 * Watches the pictures of Learn the room for the hat still being on: when the face is known,
 * a patch of the cap's colour on the head; otherwise one of a hat's size that moves (the
 * player can't hold still, and the hat moves with the head; a red chair stays put).
 */
function hatInRoomWatcher(colour: CapColour): { add(f: Frame, face: FaceBox | null): void; seen(): boolean } {
  /** Each patch followed through the pictures: where it was last, and how far its centre has ranged. */
  const tracks: { x: number; y: number; x0: number; x1: number; y0: number; y1: number; n: number }[] = [];
  let faces = 0;
  let onHead = 0;
  return {
    add(f, face) {
      const { patches } = capPatches(capMask(f, colour), f.width, f.height);
      if (face) {
        faces++;
        if (patches.some((c) => onTheHead(c, face))) onHead++;
      }
      for (const c of patches) {
        // Bigger than any hat: a chair, a jumper, a poster (partly hidden by an arm, it can seem to move).
        if (c.area > HAT_MAX_AREA) continue;
        let best: (typeof tracks)[number] | null = null;
        let bestD = HAT_FOLLOW;
        for (const t of tracks) {
          const d = Math.hypot(c.x - t.x, c.y - t.y);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (!best) { tracks.push({ x: c.x, y: c.y, x0: c.x, x1: c.x, y0: c.y, y1: c.y, n: 1 }); continue; }
        best.x = c.x; best.y = c.y; best.n++;
        best.x0 = Math.min(best.x0, c.x); best.x1 = Math.max(best.x1, c.x);
        best.y0 = Math.min(best.y0, c.y); best.y1 = Math.max(best.y1, c.y);
      }
    },
    seen() {
      // The face known: only a patch on the head counts (surer than movement).
      if (faces >= HAT_SEEN_MIN) return onHead >= HAT_ON_HEAD_SHARE * faces;
      return tracks.some((t) => t.n >= HAT_SEEN_MIN && (t.x1 - t.x0 >= HAT_MOVES || t.y1 - t.y0 >= HAT_MOVES));
    },
  };
}

/** Step 1, a picture at a time. `colour` is the cap's colour, to notice the hat still on. */
export function roomLearner(colour: CapColour = DEFAULT_CAP_COLOUR): RoomLearner {
  const sum = new Float32Array(PICTURE_LEN);
  const counts = new Float32Array(HAT_BINS);
  const frames: Frame[] = [];
  const hat = hatInRoomWatcher(colour);
  return {
    hatSeen: () => hat.seen(),
    add(f, face = null) {
      hat.add(f, face);
      // Each picture's light corrected to the room so far, so a camera settling its exposure
      // while it watches doesn't smear the room's colours.
      const s = smallPicture(f);
      for (let k = 0; k < PICTURE_LEN; k++) sum[k] += s[k];
      frames.push(f);
      const mean = sum.map((v) => v / frames.length);
      const bins = frameBins(f, lightGain(f, mean));
      for (let p = 0; p < bins.length; p++) counts[bins[p]]++;
    },
    finish() {
      const n = frames.length;
      if (n < MIN_ROOM_FRAMES) return null;
      return {
        room: blurHistogram(counts.map((v) => v / n)),
        picture: sum.map((v) => v / n),
        check: spread(frames, CHECK_ROOM_FRAMES),
      };
    },
  };
}

/** Step 1 from a list of pictures. */
export function learnRoom(frames: readonly Frame[]): LearntRoom | null {
  const l = roomLearner();
  for (const f of frames) l.add(f);
  return l.finish();
}

export type HatOutcome = 'ok' | 'look-alike' | 'hard' | 'not-seen' | 'no-room';

/** A box in the picture, 0..1. */
export interface HatBox { x: number; y: number; w: number; h: number }

export interface HatLearning {
  outcome: HatOutcome;
  /** The model to use: only when it can be ('ok' or 'look-alike'); otherwise nothing changes. */
  model: HatModel | null;
  /** In how many of the pictures checked the learnt hat was found where the hat was. */
  found: number;
  of: number;
  /** The biggest thing in the room that would pass for the hat, or null. */
  lookAlike: HatBox | null;
}

export interface HatLearner {
  /** A picture with the hat on, and the face when face tracking found one. */
  add(f: Frame, face: FaceBox | null): void;
  /** The hat learnt and checked at this sureness ("How sure before it counts"). */
  finish(sure: number): HatLearning;
}

/** Whether a sighting is on (or right by) a patch: within half its size of its box. */
function onPatch(s: { x: number; y: number }, c: CapPatch): boolean {
  const mx = (c.x1 - c.x0) / 2; const my = (c.y1 - c.y0) / 2;
  return s.x >= c.x0 - mx && s.x <= c.x1 + mx && s.y >= c.y0 - my && s.y <= c.y1 + my;
}

/** Step 2, a picture at a time, against the room from step 1 (null: step 1 not done). */
export function hatLearner(room: LearntRoom | null): HatLearner {
  const counts = new Float32Array(HAT_BINS);
  /** Each picture, and the hat's patch in it (null where it couldn't be told apart). */
  const seen: { f: Frame; at: CapPatch | null }[] = [];
  let used = 0;
  return {
    add(f, face) {
      if (!room) return;
      const bins = frameBins(f, lightGain(f, room.picture));
      // How much of each colour this picture shows, blurred like the room's.
      const raw = new Float32Array(HAT_BINS);
      for (let p = 0; p < bins.length; p++) raw[bins[p]]++;
      const now = blurHistogram(raw);
      const fresh = new Uint8Array(bins.length);
      for (let p = 0; p < bins.length; p++) {
        const b = bins[p];
        if (room.room[b] <= NEW_FLOOR + now[b] / NEW_RATIO) fresh[p] = 1;
      }
      // The biggest patch of new colour (at least the cap's size floor), on the head when
      // the face is known: that is the hat, and its pixels' colours are the hat's.
      const { patches, labels } = capPatches(fresh, f.width, f.height);
      let best: CapPatch | null = null;
      for (const c of patches) if ((!face || onTheHead(c, face)) && (!best || c.area > best.area)) best = c;
      seen.push({ f, at: best });
      if (!best) return;
      used++;
      for (let p = 0; p < bins.length; p++) if (labels[p] === best.id) counts[bins[p]]++;
    },
    finish(sure) {
      const none = (outcome: HatOutcome, found = 0, of = seen.length): HatLearning =>
        ({ outcome, model: null, found, of, lookAlike: null });
      if (!room) return none('no-room');
      if (used < MIN_HAT_FRAMES) return none('not-seen');
      const model: HatModel = { hat: blurHistogram(counts.map((v) => v / used)), room: room.room, picture: room.picture };

      // How often the learnt hat is found where the hat was — on its own, with no last
      // sighting to lean on, as in the very first picture of a piece.
      const check = spread(seen, CHECK_HAT_FRAMES);
      let found = 0;
      for (const { f, at } of check) {
        if (!at) continue;
        const s = pickCap(capPatches(hatMask(f, model, sure), f.width, f.height).patches, null);
        if (s && onPatch(s, at)) found++;
      }
      if (found < HARD_SHARE * check.length) return none('hard', found, check.length);

      // Anything in the room (hat off) that the learnt hat would take for itself: the biggest.
      let look: CapPatch | null = null;
      for (const f of room.check) {
        for (const c of capPatches(hatMask(f, model, sure), f.width, f.height).patches) if (!look || c.area > look.area) look = c;
      }
      return {
        outcome: look ? 'look-alike' : 'ok',
        model,
        found,
        of: check.length,
        lookAlike: look ? { x: look.x0, y: look.y0, w: look.x1 - look.x0, h: look.y1 - look.y0 } : null,
      };
    },
  };
}

/**
 * Step 2 from a list of pictures. `faces` (one per picture, when face tracking found one)
 * keeps the hat on the head.
 */
export function learnHat(
  room: LearntRoom | null, frames: readonly Frame[], sure: number, faces: readonly (FaceBox | null)[] = [],
): HatLearning {
  const l = hatLearner(room);
  frames.forEach((f, k) => l.add(f, faces[k] ?? null));
  return l.finish(sure);
}
