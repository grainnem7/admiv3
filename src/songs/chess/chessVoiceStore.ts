/** Which sound each chess voice plays, and which are muted. Changeable on screen. */
import { create } from 'zustand';
import { DEFAULT_CHESS_SOUNDS } from './chessVoices';

export interface ChessVoiceState {
  sounds: Record<string, string>;
  muted: ReadonlySet<string>;
  setSound: (voice: string, key: string) => void;
  toggleMute: (voice: string) => void;
  resetSounds: () => void;
}

export const useChessVoices = create<ChessVoiceState>((set) => ({
  sounds: { ...DEFAULT_CHESS_SOUNDS },
  muted: new Set(),
  setSound: (voice, key) => set((s) => ({ sounds: { ...s.sounds, [voice]: key } })),
  toggleMute: (voice) => set((s) => {
    const muted = new Set(s.muted);
    if (muted.has(voice)) muted.delete(voice); else muted.add(voice);
    return { muted };
  }),
  resetSounds: () => set({ sounds: { ...DEFAULT_CHESS_SOUNDS }, muted: new Set() }),
}));
