/**
 * The audience screen's own page (audience.html): only the picture for the projector. It
 * loads nothing of ADMI itself (no saving, no tab lock, no camera, no sound); the laptop
 * page tells it what to show (src/audience/protocol.ts).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import AudienceScreen from './AudienceScreen';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AudienceScreen />
  </React.StrictMode>,
);
