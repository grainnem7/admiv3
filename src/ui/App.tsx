/**
 * Main Application Component
 *
 * ADMIv3 - Accessible Digital Musical Instrument
 * Pro-audio inspired interface with DAW-like layout.
 */

import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
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
import ChessMusicScreen from './screens/ChessMusicScreen';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import BoardSequencerScreen from './screens/BoardSequencerScreen';
import InfoScreen from './screens/InfoScreen';

// Components
import MuteButton from './components/MuteButton';
import { debugPanelAllowed, globalSpaceTogglesMute, isDebugKey, showGlobalMuteButton } from './globalShortcuts';
import GuidedOverlay from './components/performance/GuidedOverlay';
import CalibrationModal from './components/performance/CalibrationModal';
import AriaLiveAnnouncer from './components/AriaLiveAnnouncer';
import ScreenTransition from './components/ScreenTransition';
import OtherTabNotice from './components/OtherTabNotice';
import { onTabState, tabState } from '../storage/tabSaving';

// The Debug Panel is a programmer's tool. import.meta.env.DEV is false in the production
// build, so the panel's code is left out of it entirely; in development it opens only with
// ?debug in the address (T4-11).
const DebugPanel = import.meta.env.DEV ? lazy(() => import('./facilitator/DebugPanel')) : null;
const debugAllowed = DebugPanel !== null
  && debugPanelAllowed({ dev: import.meta.env.DEV, search: typeof window === 'undefined' ? '' : window.location.search });

/**
 * One tab of ADMI saves (src/storage/tabSaving.ts). Any other shows why, and nothing else:
 * no screen, no camera, no sound, no iPad link, nothing that could save. When the tab that
 * saves closes, this one has read what it saved and ADMI opens here, fresh from that.
 */
function App() {
  const tab = useSyncExternalStore(onTabState, tabState);
  return tab === 'waiting' ? <OtherTabNotice /> : <AppScreens />;
}

function AppScreens() {
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
      if (debugAllowed && isDebugKey(e, document.activeElement)) {
        toggleDebugPanel();
        return;
      }
      // Don't trigger if typing in an input
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === ' ' && globalSpaceTogglesMute(useAppStore.getState().currentScreen)) {
        e.preventDefault();
        await getAudioEngine().resume();
        toggleMute();
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
      case 'chessMusic':
        return <ChessMusicScreen />;
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

      {/* Debug panel for facilitators: development only, with ?debug in the address */}
      {DebugPanel && debugAllowed && showDebug && (
        <Suspense fallback={null}><DebugPanel /></Suspense>
      )}

      {/* Screen reader announcements */}
      <AriaLiveAnnouncer />
    </>
  );
}

export default App;
