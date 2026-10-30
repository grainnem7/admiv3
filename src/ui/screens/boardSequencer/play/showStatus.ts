/**
 * Show's status row (audit 2026-10-30, B1 and B14): one line of fixed height under the
 * clock that says what the owner needs to know mid-piece, and never moves the board.
 *
 * Each item appears only when it is relevant: the camera (camera board only), the hat
 * (when it is on), the iPad (when its link is on) and Ableton (when the sound comes from
 * it). Calm with ✓ when fine; amber, starting with "!" and a word, when not. The notices
 * that used to stack above the clock (keeping time, the Ableton port, the reload offer)
 * and the Muted and Simplified states live here too. Pure: the screen gathers the input.
 */

export type ShowStatusTone = 'ok' | 'warn' | 'note';
/** A button an item carries; the screen gives each its words and its work. */
export type ShowStatusAction = 'retryCamera' | 'switchToAbleton' | 'restoreExtras' | 'carryOn' | 'dismissReload';

export interface ShowStatusItem {
  key: string;
  tone: ShowStatusTone;
  /** The words; a warning's start with "!". */
  text: string;
  /** Numbers that change as it plays (the hat's Speed): shown, never announced. */
  detail?: string;
  /** For the ones that are their own live region (Simplify, Keeping time). */
  label?: string;
  actions?: ShowStatusAction[];
}

export type ShowHatState = 'found' | 'followed' | 'face' | 'holding' | 'paused' | 'starting' | 'noCamera' | 'mouse';

export interface ShowStatusInput {
  /** The camera board's camera; null on the laptop board. */
  camera: 'ok' | 'stopped' | null;
  /** The hat, when it is on. `why` is the pause's reason in words; `values` its controls now. */
  hat: { state: ShowHatState; why?: string; locked: boolean; values: string[] } | null;
  /** The iPad, when its link is on. */
  ipad: { reaching: boolean; endPressedOnce: boolean } | null;
  /** Ableton's port, when the sound comes from Ableton. */
  sound: 'ok' | 'lost' | 'notFound' | 'back' | null;
  muted: boolean;
  /** Simplify's line, when it is on or leaving ("Simplified: …"). */
  simplify: string | null;
  /** The keeping-time meter's notice, when there is one. */
  keepingTime: { text: string; canRestore: boolean } | null;
  /** The page reloaded mid-piece: the Carry on offer, or "it has ended". */
  reload: { kind: 'carryOn'; at: string } | { kind: 'ended' } | null;
  /** The audience screen is open: say once to keep this window in front. */
  keepInFront: boolean;
}

function hatItem(h: NonNullable<ShowStatusInput['hat']>): ShowStatusItem {
  const locked = h.locked ? ' · locked' : '';
  const detail = h.values.length > 0 ? h.values.join(' · ') : undefined;
  const base = { key: 'hat', ...(detail ? { detail } : {}) };
  switch (h.state) {
    case 'found': return { ...base, tone: 'ok', text: `Hat ✓${locked}` };
    // Not learnt: a red thing is followed, which may not be the hat (B7). Calm, never a ✓.
    case 'followed': return { ...base, tone: 'note', text: `Hat: not learnt (a red thing is followed)${locked}` };
    case 'face': return { ...base, tone: 'ok', text: `Hat ✓ (following the face)${locked}` };
    case 'mouse': return { ...base, tone: 'ok', text: `Hat ✓ (the mouse)${locked}` };
    case 'holding': return { ...base, tone: 'warn', text: `! Hat not in sight: holding${locked}` };
    case 'paused': return { ...base, tone: 'note', text: `Hat ${h.why ?? 'paused'}${locked}` };
    case 'starting': return { ...base, tone: 'note', text: `Hat: starting…${locked}` };
    default: return { ...base, tone: 'warn', text: `! Hat: no camera${locked}` };
  }
}

/** The row's items: warnings first (so a narrow screen never hides one), then notes, then what is fine. */
export function showStatusItems(i: ShowStatusInput): ShowStatusItem[] {
  const out: ShowStatusItem[] = [];
  if (i.reload?.kind === 'carryOn') {
    out.push({
      key: 'reload', tone: 'warn',
      text: `! The piece was playing when the page closed or reloaded. The clock would be at ${i.reload.at} now.`,
      label: 'The piece after a reload', actions: ['carryOn', 'dismissReload'],
    });
  } else if (i.reload?.kind === 'ended') {
    out.push({
      key: 'reload', tone: 'note', text: 'The piece was ending when the page closed or reloaded, so it has ended.',
      label: 'The piece after a reload', actions: ['dismissReload'],
    });
  }
  if (i.camera === 'ok') out.push({ key: 'camera', tone: 'ok', text: 'Camera ✓' });
  else if (i.camera === 'stopped') out.push({ key: 'camera', tone: 'warn', text: '! Camera stopped', actions: ['retryCamera'] });
  if (i.hat) out.push(hatItem(i.hat));
  if (i.ipad) {
    out.push(i.ipad.reaching
      ? { key: 'ipad', tone: 'ok', text: 'iPad ✓' }
      : { key: 'ipad', tone: 'warn', text: '! iPad not reaching' });
    if (i.ipad.endPressedOnce) out.push({ key: 'ipadEnd', tone: 'note', text: 'iPad: End piece pressed once' });
  }
  if (i.sound === 'ok') out.push({ key: 'sound', tone: 'ok', text: 'Ableton ✓' });
  else if (i.sound === 'lost') out.push({ key: 'sound', tone: 'warn', text: "! Ableton's port has gone, so ADMI is playing its own sound." });
  else if (i.sound === 'notFound') out.push({ key: 'sound', tone: 'warn', text: '! Ableton port not found' });
  else if (i.sound === 'back') {
    out.push({ key: 'sound', tone: 'note', text: 'Ableton is back. ADMI is still playing its own sound until you switch.', actions: ['switchToAbleton'] });
  }
  if (i.keepingTime) {
    out.push({
      key: 'keepingTime', tone: 'warn', text: `! ${i.keepingTime.text}`, label: 'Keeping time',
      ...(i.keepingTime.canRestore ? { actions: ['restoreExtras'] as ShowStatusAction[] } : {}),
    });
  }
  if (i.muted) out.push({ key: 'muted', tone: 'note', text: 'Muted: nothing is sounding' });
  if (i.simplify) out.push({ key: 'simplify', tone: 'note', text: i.simplify, label: 'Simplify' });
  if (i.keepInFront) out.push({ key: 'keepInFront', tone: 'note', text: 'Keep this window in front: covering it pauses the camera.' });
  const rank: Record<ShowStatusTone, number> = { warn: 0, note: 1, ok: 2 };
  // A stable sort: within each tone the order above holds.
  return out.map((x, n) => ({ x, n })).sort((a, b) => rank[a.x.tone] - rank[b.x.tone] || a.n - b.n).map(({ x }) => x);
}

/**
 * ■ Stop ignores presses for this long after the piece starts (B3): Enter pressed
 * repeatedly on ▶ Start the piece started it, then landed on Stop and stopped it again
 * about 1.5 s later.
 */
export const STOP_GUARD_MS = 2000;

/** Is ■ Stop held back now? `pieceStartedAt` is when the piece's clock last started (ms), or null. */
export function stopGuarded(pieceStartedAt: number | null, now: number): boolean {
  return pieceStartedAt !== null && now - pieceStartedAt < STOP_GUARD_MS;
}

/** An Esc this soon after full screen ended is the one that ended it. */
const FULLSCREEN_ESC_MS = 500;

/**
 * Show closes on Leave Show, or on Esc when the browser was not in full screen (B5). It no
 * longer closes when full screen ends: clicking the projector window, or the browser's own
 * Esc, ended full screen and dropped Show mid-piece.
 */
export function escLeavesShow(fullscreenNow: boolean, fullscreenEndedAt: number | null, now: number): boolean {
  if (fullscreenNow) return false;
  return fullscreenEndedAt === null || now - fullscreenEndedAt > FULLSCREEN_ESC_MS;
}

/**
 * Simplify's line (B23): who and what is left, by name. "the bed" was a word only the code
 * used: now the loop's own name, or the player alone when no loop plays.
 */
export function simplifiedLine(playerName: string | null, bedLoop: string | null): string {
  const who = playerName && playerName.trim().length > 0 ? playerName.trim() : 'the player';
  return bedLoop === null ? `Simplified: ${who} alone` : `Simplified: ${who} and ${bedLoop}`;
}
