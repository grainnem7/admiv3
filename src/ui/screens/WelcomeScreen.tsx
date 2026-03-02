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

  const handleBetweenUs = async () => {
    const audioEngine = getAudioEngine();
    await audioEngine.resume();
    setMuted(true); // Start muted, unmute when ready
    setCurrentScreen('betweenUs');
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-hero">
        <h1 className="welcome-title">ADMIv3</h1>
        <p className="welcome-tagline">Movement to music</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', alignItems: 'center' }}>
        <button className="btn btn--large welcome-start-btn" onClick={handleStart}>
          Start
        </button>

        <button
          className="btn btn--large"
          onClick={handleBetweenUs}
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
            border: 'none',
          }}
        >
          Between Us
        </button>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
          Participatory performance mode
        </p>
      </div>

      <p className="welcome-note">Webcam required</p>
    </div>
  );
}

export default WelcomeScreen;
