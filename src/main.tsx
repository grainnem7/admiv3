import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import IPadRemoteScreen from './ui/screens/IPadRemoteScreen';
import { isRemoteCode } from './remote/protocol';
// Design system CSS is imported in App.tsx via './design-system/index'

// The iPad remote is its own small page (`/?remote=1234`), not a screen inside the app:
// the iPad needs none of the camera, tracking or sound, only the strips and pads.
const remoteCode = new URLSearchParams(window.location.search).get('remote');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isRemoteCode(remoteCode) ? <IPadRemoteScreen code={remoteCode} /> : <App />}
  </React.StrictMode>
);
