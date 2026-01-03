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
        <h1 className="welcome-title">ADMIv3</h1>
        <p className="welcome-tagline">Movement to music</p>
      </div>

      <button className="btn btn--large welcome-start-btn" onClick={handleStart}>
        Start
      </button>

      <p className="welcome-note">Webcam required</p>
    </div>
  );
}

export default WelcomeScreen;
