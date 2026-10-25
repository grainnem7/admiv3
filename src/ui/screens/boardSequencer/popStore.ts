/**
 * The notes sounding right now, outside React state. They change every frame while
 * anything plays; as screen state they re-rendered the whole Board Sequencer screen 60
 * times a second, on the thread that also reads the camera and schedules the sound. Only
 * the board drawing needs them that often, so only it subscribes.
 */
import { useSyncExternalStore } from 'react';
import type { Pop } from './components/boardViewModel';

export interface PopStore {
  get(): Pop[];
  set(pops: Pop[]): void;
  subscribe(listener: () => void): () => void;
}

const NONE: Pop[] = [];

export function createPopStore(): PopStore {
  let pops = NONE;
  const listeners = new Set<() => void>();
  return {
    get: () => pops,
    set: (next) => {
      // Nothing sounding, and nothing was: no news.
      if (next.length === 0 && pops.length === 0) return;
      pops = next.length === 0 ? NONE : next;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export function usePops(store: PopStore): Pop[] {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** What is sounding, by colour and kind: changes only when that does, not every frame. */
export function soundingKey(pops: readonly Pop[]): string {
  return [...new Set(pops.map((p) => `${p.colour}|${p.origin ?? ''}`))].sort().join(',');
}
