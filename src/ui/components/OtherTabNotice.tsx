/**
 * What a tab shows while another tab of ADMI is the one that saves (src/storage/tabSaving.ts).
 * Nothing here can change or save anything: it says why, and what to do. When the other tab
 * closes, App swaps this for ADMI by itself, after reading what that tab saved.
 *
 * It also says hello on the tabs' channel, so the tab that saves can say another is open.
 */

import { useEffect } from 'react';

/** The channel the Board Sequencer listens on for other tabs of ADMI. */
export const TABS_CHANNEL = 'admi-board-tabs';

export default function OtherTabNotice() {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(TABS_CHANNEL);
    ch.onmessage = (e: MessageEvent) => { if (e.data === 'hello') ch.postMessage('here'); };
    ch.postMessage('hello');
    const bye = (): void => ch.postMessage('bye');
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); bye(); ch.close(); };
  }, []);

  return (
    <main
      id="main-content"
      style={{ maxWidth: 640, margin: '0 auto', padding: '15vh 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0 }}>ADMI is open in another tab</h1>
        <p style={{ margin: 0, fontSize: '1.25rem' }}>This one can&apos;t save: close the other tab to save here.</p>
      </div>
      <p style={{ margin: 0 }}>
        Once the other tab is closed, this one opens ADMI by itself, with everything saved there.
      </p>
    </main>
  );
}
