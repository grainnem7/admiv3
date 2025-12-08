/**
 * Main Application Component
 */

import { useEffect } from 'react';
import { useAppStore, useCurrentScreen, useShowDebugPanel, useIsMuted } from '../state/store';
import { getAudioEngine } from '../sound/AudioEngine';
import WelcomeScreen from './screens/WelcomeScreen';
import CalibrationScreen from './screens/CalibrationScreen';
import PerformanceScreen from './screens/PerformanceScreenV2';
import MuteButton from './components/MuteButton';
import DebugPanel from './facilitator/DebugPanel';

function App() {
  const screen = useCurrentScreen();
  const showDebug = useShowDebugPanel();
  const isMuted = useIsMuted();
  const toggleMute = useAppStore((s) => s.toggleMute);
  const toggleDebugPanel = useAppStore((s) => s.toggleDebugPanel);

  // Initialize audio engine on mount
  useEffect(() => {
    const audioEngine = getAudioEngine();
    audioEngine.initialize().catch(console.error);

    return () => {
      audioEngine.dispose();
    };
  }, []);

  // Sync mute state with audio engine
  useEffect(() => {
    const audioEngine = getAudioEngine();
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          await getAudioEngine().resume();
          toggleMute();
          break;
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            toggleDebugPanel();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMute, toggleDebugPanel]);

  // Render current screen
  const renderScreen = () => {
    switch (screen) {
      case 'welcome':
        return <WelcomeScreen />;
      case 'calibration':
        return <CalibrationScreen />;
      case 'performance':
        return <PerformanceScreen />;
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <>
      {/* Skip link for keyboard navigation */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main id="main-content">
        {renderScreen()}
      </main>

      {/* Always visible mute button */}
      <MuteButton />

      {/* Debug panel for facilitators */}
      {showDebug && <DebugPanel />}
    </>
  );
}

export default App;
