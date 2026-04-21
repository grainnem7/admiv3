/**
 * Performance Screen V2 - DAW-like Pro Audio Interface
 *
 * Composed from extracted child components:
 * - SidebarNav: Tiered navigation with progressive disclosure
 * - PerformanceToolbar: Transport controls, profile info
 * - VideoStage: Camera feed + overlays
 * - ContextPanel: Right panel with section-specific controls
 * - StatusBar: Bottom status bar
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore, useIsMuted, useExperienceLevel, useSidebarCollapsed, useRightPanelOpen } from '../../state/store';
import type { InputProfile, TrackedBodyPoint } from '../../state/types';
import type { InstrumentZone, GestureSoundMapping } from '../../state/instrumentZones';
import { DEFAULT_PRESETS } from '../../profiles/presets';
import { usePerformanceSystems } from '../../hooks/usePerformanceSystems';
import { useFrameProcessor } from '../../hooks/useFrameProcessor';
import type { InputMethod } from '../components/InputMethodPanel';

// Extracted child components
import SidebarNav from '../components/performance/SidebarNav';
import PerformanceToolbar from '../components/performance/PerformanceToolbar';
import VideoStage from '../components/performance/VideoStage';
import ContextPanel from '../components/performance/ContextPanel';
import StatusBar from '../components/performance/StatusBar';
import type { SidebarSection } from '../components/performance/sidebarConfig';

function PerformanceScreenV2() {
  // Current profile
  const [currentProfile, setCurrentProfile] = useState<InputProfile>(DEFAULT_PRESETS[0]);

  // UI state (sidebar/panel persisted via Zustand)
  const [activeSection, setActiveSection] = useState<SidebarSection>('input');
  const sidebarCollapsed = useSidebarCollapsed();
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const rightPanelOpen = useRightPanelOpen();
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

  // Instrument zones state
  const [instrumentZones, setInstrumentZones] = useState<InstrumentZone[]>([]);
  const instrumentZonesRef = useRef<InstrumentZone[]>([]);

  // Gesture sound mappings state
  const [gestureMappings, setGestureMappings] = useState<GestureSoundMapping[]>([]);
  const gestureMappingsRef = useRef<GestureSoundMapping[]>([]);

  // Body point tracking state
  const [trackedPoints, setTrackedPoints] = useState<TrackedBodyPoint[]>([]);

  // Color calibration state
  const [colorCalibrationMode, setColorCalibrationMode] = useState(false);
  const [calibratingColorId, setCalibratingColorId] = useState<string | null>(null);

  // Panel expansion states
  const [isMidiPanelExpanded, setIsMidiPanelExpanded] = useState(false);
  const [isEffectPanelExpanded, setIsEffectPanelExpanded] = useState(false);
  const [isGesturePanelExpanded, setIsGesturePanelExpanded] = useState(true);

  // Input method state
  const [activeInputMethod, setActiveInputMethod] = useState<InputMethod>('body');

  // Keep refs in sync with state
  useEffect(() => {
    instrumentZonesRef.current = instrumentZones;
  }, [instrumentZones]);

  useEffect(() => {
    gestureMappingsRef.current = gestureMappings;
  }, [gestureMappings]);

  // Initialize all performance systems
  const {
    refs: systemRefs,
    videoRef,
    containerRef,
    isLoading,
    error,
    videoSize,
    containerSize,
    audioEnabled,
    setAudioEnabled,
    handleUserInteraction,
  } = usePerformanceSystems(currentProfile, (frame) => {
    frameProcessor.handleTrackingFrame(frame);
  });

  // Frame processing pipeline
  const frameProcessor = useFrameProcessor(
    systemRefs,
    instrumentZonesRef,
    gestureMappingsRef,
    activeInputMethod
  );

  const isMuted = useIsMuted();

  // Sync music settings to MusicController
  const musicSettings = useAppStore((s) => s.musicSettings);
  useEffect(() => {
    if (systemRefs.musicController.current) {
      systemRefs.musicController.current.applyMusicSettings(musicSettings);
    }
  }, [musicSettings, systemRefs.musicController]);

  // Handle profile changes
  const handleProfileChange = useCallback(
    async (profile: InputProfile) => {
      setCurrentProfile(profile);

      if (systemRefs.processor.current) {
        systemRefs.processor.current.setProfile(profile);
      }

      if (systemRefs.mappingEngine.current) {
        systemRefs.mappingEngine.current.configureFromProfile(profile);
      }

      if (systemRefs.trackingManager.current) {
        await systemRefs.trackingManager.current.setActiveModalities(profile.activeModalities);
      }
    },
    [systemRefs]
  );

  // Sync mute state with music controller and theremin
  useEffect(() => {
    if (systemRefs.musicController.current) {
      if (isMuted) {
        systemRefs.musicController.current.stop();
        const soundEngine = systemRefs.musicController.current.getSoundEngine();
        if (soundEngine?.isThereminPlaying()) {
          soundEngine.thereminStop();
        }
      } else {
        systemRefs.musicController.current.start();
      }
    }
  }, [isMuted, systemRefs.musicController]);

  // Handle zones change
  const handleZonesChange = useCallback((newZones: InstrumentZone[]) => {
    setInstrumentZones(newZones);
  }, []);

  // Handle sidebar section change
  const handleSectionChange = useCallback((section: SidebarSection) => {
    setActiveSection(section);
    setRightPanelOpen(true);
  }, []);

  const experienceLevel = useExperienceLevel();

  return (
    <div className="app-shell app-shell--with-sidebar" onClick={handleUserInteraction}>
      <SidebarNav
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        experienceLevel={experienceLevel}
      />

      <div className="main-content">
        <PerformanceToolbar
          currentProfile={currentProfile}
          isActive={frameProcessor.isActive}
          currentFrame={frameProcessor.currentFrame}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen(!rightPanelOpen)}
        />

        <div className="content-area">
          <VideoStage
            videoRef={videoRef}
            containerRef={containerRef}
            systemRefs={systemRefs}
            currentFrame={frameProcessor.currentFrame}
            currentProfile={currentProfile}
            videoSize={videoSize}
            containerSize={containerSize}
            isLoading={isLoading}
            error={error}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            activeInputMethod={activeInputMethod}
            instrumentZones={instrumentZones}
            onZonesChange={handleZonesChange}
            activeZoneIds={frameProcessor.activeZoneIds}
            trackedPoints={trackedPoints}
            recentTriggers={frameProcessor.recentTriggers}
            isActive={frameProcessor.isActive}
            colorCalibrationMode={colorCalibrationMode}
            setColorCalibrationMode={setColorCalibrationMode}
            calibratingColorId={calibratingColorId}
            setCalibratingColorId={setCalibratingColorId}
          />

          <ContextPanel
            activeSection={activeSection}
            isOpen={rightPanelOpen}
            isExpanded={rightPanelExpanded}
            onToggleOpen={() => setRightPanelOpen(false)}
            onToggleExpanded={() => setRightPanelExpanded(!rightPanelExpanded)}
            currentProfile={currentProfile}
            onProfileChange={handleProfileChange}
            activeInputMethod={activeInputMethod}
            onInputMethodChange={setActiveInputMethod}
            onRequestColorCalibration={(colorId) => {
              setCalibratingColorId(colorId);
              setColorCalibrationMode(true);
            }}
            instrumentZones={instrumentZones}
            gestureMappings={gestureMappings}
            onGestureMappingsChange={setGestureMappings}
            isGesturePanelExpanded={isGesturePanelExpanded}
            onToggleGesturePanel={() => setIsGesturePanelExpanded(!isGesturePanelExpanded)}
            trackedPoints={trackedPoints}
            onPointsChange={setTrackedPoints}
            isEffectPanelExpanded={isEffectPanelExpanded}
            onToggleEffectPanel={() => setIsEffectPanelExpanded(!isEffectPanelExpanded)}
            isMidiPanelExpanded={isMidiPanelExpanded}
            onToggleMidiPanel={() => setIsMidiPanelExpanded(!isMidiPanelExpanded)}
          />
        </div>

        <StatusBar
          isActive={frameProcessor.isActive}
          currentProfile={currentProfile}
          instrumentZones={instrumentZones}
          trackedPoints={trackedPoints}
        />
      </div>
    </div>
  );
}

export default PerformanceScreenV2;
