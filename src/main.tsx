import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import IPadRemoteScreen from './ui/screens/IPadRemoteScreen';
import { isRemoteCode } from './remote/protocol';
import { restoreFromDisk } from './storage/diskSync';
import { claimSaving } from './storage/tabSaving';
import { useAppStore } from './state/store';
import { readPieceRunning } from './songs/performance/pieceRunning';
// Design system CSS is imported in App.tsx via './design-system/index'

// The iPad remote is its own small page (`/?remote=1234`), not a screen inside the app:
// the iPad needs none of the camera, tracking or sound, only the strips and pads.
const remoteCode = new URLSearchParams(window.location.search).get('remote');

const render = (): void => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isRemoteCode(remoteCode) ? <IPadRemoteScreen code={remoteCode} /> : <App />}
    </React.StrictMode>
  );
};

// One tab saves (src/storage/tabSaving.ts). A tab that waits for another shows why; when
// the other one closes, this one reads what it saved before ADMI opens here: the laptop's
// copy, the app's own settings, and a piece that was playing there (to carry on).
const takeOver = async (): Promise<void> => {
  await restoreFromDisk();
  await useAppStore.persist.rehydrate();
  if (readPieceRunning() !== null) useAppStore.getState().setCurrentScreen('boardSequencer');
};

// The laptop keeps a copy of the saved loops and setup (src/storage/diskSync.ts). The
// browser keeps its own per address, so a different port or browser would otherwise open
// empty: the newer copy is put in place before anything reads it. (The iPad page saves
// nothing and never waits for the lock.)
if (isRemoteCode(remoteCode)) render();
else {
  void claimSaving({ onTakeOver: takeOver })
    .then((state) => (state === 'saving' ? restoreFromDisk() : undefined))
    .finally(render);
}
