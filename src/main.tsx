import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import IPadRemoteScreen from './ui/screens/IPadRemoteScreen';
import { isRemoteCode } from './remote/protocol';
import { restoreFromDisk } from './storage/diskSync';
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

// The laptop keeps a copy of the saved loops and setup (src/storage/diskSync.ts). The
// browser keeps its own per address, so a different port or browser would otherwise open
// empty: the newer copy is put in place before anything reads it.
if (isRemoteCode(remoteCode)) render();
else void restoreFromDisk().finally(render);
