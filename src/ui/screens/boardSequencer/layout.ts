/**
 * Handedness layout. It mirrors WHERE things sit (grid areas, alignment) but never the
 * DOM/focus order, the camera, the board, or slider direction. Never use dir="rtl".
 */
export type Hand = 'left' | 'right';

export interface BoardLayout {
  mode: 'side' | 'stacked';
  playAreas: string;
  setupAreas: string;
  transport: 'panel-top' | 'bottom-bar';
  transportAlign: 'start' | 'end';
  footerAlign: 'start' | 'end';
  pip: 'bottom-left' | 'bottom-right';
  nudgePad: 'left' | 'right';
  bigBoardControls: 'left' | 'right';
  domOrder: readonly string[];
}

export const LAYOUT_BREAKPOINT_PX = 1024;
const DOM_ORDER = ['header', 'stage', 'panel', 'transport'] as const;

export function layoutFor(hand: Hand, widthPx: number, uiSize: 'standard' | 'large'): BoardLayout {
  const left = hand === 'left';
  const stacked = widthPx < LAYOUT_BREAKPOINT_PX || uiSize === 'large';
  return {
    mode: stacked ? 'stacked' : 'side',
    playAreas: stacked ? '"stage" "panel"' : left ? '"panel stage"' : '"stage panel"',
    setupAreas: stacked ? '"camera" "panel"' : left ? '"panel camera"' : '"camera panel"',
    transport: stacked ? 'bottom-bar' : 'panel-top',
    transportAlign: left ? 'start' : 'end',
    footerAlign: left ? 'start' : 'end',
    pip: left ? 'bottom-right' : 'bottom-left',
    nudgePad: left ? 'left' : 'right',
    bigBoardControls: left ? 'left' : 'right',
    domOrder: DOM_ORDER,
  };
}
