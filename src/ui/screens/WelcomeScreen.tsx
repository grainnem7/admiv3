/**
 * Welcome Screen - Redesigned for cleaner onboarding
 *
 * Simplified flow with:
 * - Clear value proposition
 * - Quick start as primary action
 * - Visual preview of input modes
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
      {/* Hero section */}
      <div className="welcome-hero">
        <h1 className="welcome-title">ADMIv3</h1>
        <p className="welcome-tagline">Create music through movement</p>
      </div>

      {/* Main content */}
      <div className="welcome-content">
        <div className="welcome-card">
          <p className="welcome-description">
            Use your webcam to control sound with your body, hands, and face.
            The instrument adapts to you.
          </p>

          {/* Feature highlights */}
          <div className="welcome-features">
            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div className="welcome-feature-text">
                <strong>Body Movement</strong>
                <span>Arms control pitch and volume</span>
              </div>
            </div>
            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                  <line x1="6" y1="1" x2="6" y2="4"/>
                  <line x1="10" y1="1" x2="10" y2="4"/>
                  <line x1="14" y1="1" x2="14" y2="4"/>
                </svg>
              </div>
              <div className="welcome-feature-text">
                <strong>Hand Gestures</strong>
                <span>Pinch to trigger notes</span>
              </div>
            </div>
            <div className="welcome-feature">
              <div className="welcome-feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </div>
              <div className="welcome-feature-text">
                <strong>Facial Expressions</strong>
                <span>Blink and eyebrows for effects</span>
              </div>
            </div>
          </div>

          {/* Primary action */}
          <button className="btn btn--large welcome-start-btn" onClick={handleStart}>
            Start Playing
          </button>

          {/* Requirements note */}
          <p className="welcome-note">
            Requires webcam access. Works best in good lighting.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="welcome-footer">
        <span>Press <kbd>Space</kbd> to mute/unmute</span>
        <span>Press <kbd>D</kbd> for debug panel</span>
      </footer>
    </div>
  );
}

export default WelcomeScreen;
