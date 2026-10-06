/**
 * Main Application Component
 *
 * ADMIv3 - Accessible Digital Musical Instrument
 * Pro-audio inspired interface with DAW-like layout.
 */

import { useEffect } from 'react';
import { useAppStore, useCurrentScreen, useShowDebugPanel, useIsMuted, useUISize } from '../state/store';
import { getAudioEngine } from '../sound/AudioEngine';

// Import the design system (includes all CSS)
import './design-system/index';

// Screens
import WelcomeScreen from './screens/WelcomeScreen';
import SetupWizard from './screens/SetupWizard';
import CalibrationScreen from './screens/CalibrationScreen';
import PerformanceScreen from './screens/PerformanceScreenV2';
import BetweenUsScreen from './screens/BetweenUsScreen';
import HarmonicBlendingScreen from './screens/HarmonicBlendingScreen';
import SongPresetScreen from './screens/SongPresetScreen';
import RemixScreen from './screens/RemixScreen';
import SurfaceKeyboardScreen from './screens/SurfaceKeyboardScreen';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import BoardSequencerScreen from './screens/BoardSequencerScreen';
import InfoScreen from './screens/InfoScreen';

// Components
import MuteButton from './components/MuteButton';
import { globalSpaceTogglesMute, showGlobalMuteButton } from './globalShortcuts';
import DebugPanel from './facilitator/DebugPanel';
import GuidedOverlay from './components/performance/GuidedOverlay';
import CalibrationModal from './components/performance/CalibrationModal';
import AriaLiveAnnouncer from './components/AriaLiveAnnouncer';
import ScreenTransition from './components/ScreenTransition';

function App() {
  const screen = useCurrentScreen();
  const showDebug = useShowDebugPanel();
  const isMuted = useIsMuted();
  const uiSize = useUISize();
  const toggleMute = useAppStore((s) => s.toggleMute);
  const toggleDebugPanel = useAppStore((s) => s.toggleDebugPanel);

  // Apply UI size to document
  useEffect(() => {
    document.documentElement.dataset.uiSize = uiSize;
  }, [uiSize]);

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
          if (!globalSpaceTogglesMute(useAppStore.getState().currentScreen)) break;
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
      case 'setup':
        return <SetupWizard />;
      case 'calibration':
        return <CalibrationScreen />;
      case 'performance':
        return <PerformanceScreen />;
      case 'betweenUs':
        return <BetweenUsScreen />;
      case 'harmonicBlending':
        return <HarmonicBlendingScreen />;
      case 'songPreset':
        return <SongPresetScreen />;
      case 'remix':
        return <RemixScreen />;
      case 'surfaceKeyboard':
        return <SurfaceKeyboardScreen />;
      case 'boardSequencer':
        return <BoardSequencerScreen />;
      case 'info':
        return <InfoScreen />;
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
        <ScreenTransition screenKey={screen}>
          <ScreenErrorBoundary resetKey={screen}>
            {renderScreen()}
          </ScreenErrorBoundary>
        </ScreenTransition>
      </main>

      {/* Guided tutorial overlay (performance screen only, first visit) */}
      {screen === 'performance' && <GuidedOverlay />}

      {/* Calibration overlay (can be triggered from performance) */}
      <CalibrationModal />

      {/* Always visible mute button (not on the board, which has its own) */}
      {showGlobalMuteButton(screen) && <MuteButton />}

      {/* Debug panel for facilitators */}
      {showDebug && <DebugPanel />}

      {/* Screen reader announcements */}
      <AriaLiveAnnouncer />
    </>
  );
}

export default App;
