/**
 * Welcome Screen
 *
 * Minimal landing page for ADMIv3.
 */

import { useAppStore } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';

function WelcomeScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setMuted = useAppStore((s) => s.setMuted);

  const handleStart = async () => {
    const audioEngine = getAudioEngine();
    await audioEngine.resume();
    setMuted(false);
    setCurrentScreen('performance');
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-hero">
        <div className="welcome-logo">A</div>
        <h1 className="welcome-title">ADMIv3</h1>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexDirection: 'column', alignItems: 'center' }}>
        <button
          className="btn btn--primary btn--lg"
          onClick={handleStart}
          style={{ minWidth: 200 }}
        >
          Start Playing
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => setCurrentScreen('info')}
          style={{ minWidth: 200 }}
        >
          How It Works
        </button>
      </div>
    </div>
  );
}

export default WelcomeScreen;
