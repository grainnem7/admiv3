/**
 * Performance Screen V2 - DAW-like Pro Audio Interface
 *
 * Redesigned with:
 * - Left sidebar navigation
 * - Main video/camera view
 * - Right panel for contextual controls
 * - Status bar with meters and indicators
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore, useIsMuted } from '../../state/store';
import type { TrackingFrame, InputProfile, TrackedBodyPoint, TriggerEvent } from '../../state/types';
import type { InstrumentZone, InstrumentDefinition, GestureSoundMapping } from '../../state/instrumentZones';
import { getInstrumentDefinition } from '../../state/instrumentZones';
import { TrackingManager, getTrackingManager } from '../../tracking/TrackingManager';
import { MultiModalProcessor, getMultiModalProcessor } from '../../movement/MultiModalProcessor';
import { MappingEngine, getMappingEngine } from '../../mapping/MappingEngine';
import { MusicController, getMusicController } from '../../core/MusicController';
import { DEFAULT_PRESETS } from '../../profiles/presets';
import { useZoneCollision } from '../../hooks/useZoneCollision';
import { useGestureSounds } from '../../hooks/useGestureSounds';

// Components
import TrackingOverlay from '../components/TrackingOverlay';
import InputProfileSelector from '../components/InputProfileSelector';
import VolumeControl from '../components/VolumeControl';
import SoundPresetSelector from '../components/SoundPresetSelector';
import InstrumentPalette from '../components/InstrumentPalette';
import InstrumentZoneOverlay from '../components/InstrumentZoneOverlay';
import GestureMappingPanel from '../components/GestureMappingPanel';
import MIDISettingsPanel from '../components/MIDISettingsPanel';
import EffectChainSelector from '../components/EffectChainSelector';
import { MusicalModulesPanel } from '../components/MusicalModulesPanel';
import InputMethodPanel, { type InputMethod } from '../components/InputMethodPanel';
import ThereminDisplay from '../components/ThereminDisplay';
import TrackingStatusOverlay from '../components/TrackingStatusOverlay';
import BodyPointsPanel from '../components/BodyPointsPanel';
import MusicSettingsPanel from '../components/MusicSettingsPanel';

// Design system
import {
  IconHome,
  IconSettings,
  IconBody,
  IconMusic,
  IconSliders,
  IconGesture,
  IconMidi,
  IconEffects,
  IconSequencer,
  IconChevronRight,
  IconChevronLeft,
  IconVolume,
  IconVolumeMute,
  IconPlay,
  IconPause,
} from '../design-system/Icons';
import { Panel } from '../design-system/Panel';
import { StatusDot, Spinner, TrackingStatus } from '../design-system/StatusIndicators';

// Sidebar sections
type SidebarSection = 'input' | 'sound' | 'zones' | 'gestures' | 'effects' | 'midi' | 'modules' | 'points' | 'music';

function PerformanceScreenV2() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });
  const [containerSize, setContainerSize] = useState({ width: 640, height: 480 });

  // Systems refs
  const trackingManagerRef = useRef<TrackingManager | null>(null);
  const processorRef = useRef<MultiModalProcessor | null>(null);
  const mappingEngineRef = useRef<MappingEngine | null>(null);
  const musicControllerRef = useRef<MusicController | null>(null);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState<TrackingFrame | null>(null);
  const [currentProfile, setCurrentProfile] = useState<InputProfile>(DEFAULT_PRESETS[0]);
  const [, setCurrentFrequency] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // UI State
  const [activeSection, setActiveSection] = useState<SidebarSection>('input');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

  // Instrument zones state
  const [instrumentZones, setInstrumentZones] = useState<InstrumentZone[]>([]);
  const instrumentZonesRef = useRef<InstrumentZone[]>([]);
  const [activeZoneIds, setActiveZoneIds] = useState<Set<string>>(new Set());
  const [isPaletteExpanded, setIsPaletteExpanded] = useState(false);

  // Gesture sound mappings state
  const [gestureMappings, setGestureMappings] = useState<GestureSoundMapping[]>([]);
  const gestureMappingsRef = useRef<GestureSoundMapping[]>([]);

  // Body point tracking state
  const [trackedPoints, setTrackedPoints] = useState<TrackedBodyPoint[]>([]);
  const [recentTriggers, setRecentTriggers] = useState<TriggerEvent[]>([]);

  // Landmark labels toggle
  const [showLandmarkLabels, setShowLandmarkLabels] = useState(false);

  // Panel expansion states
  const [isMidiPanelExpanded, setIsMidiPanelExpanded] = useState(false);
  const [isEffectPanelExpanded, setIsEffectPanelExpanded] = useState(false);
  const [isGesturePanelExpanded, setIsGesturePanelExpanded] = useState(true);

  // Input method state
  const [isInputMethodPanelExpanded] = useState(false);
  const [activeInputMethod, setActiveInputMethod] = useState<InputMethod>('body');

  // Keep refs in sync with state
  useEffect(() => {
    instrumentZonesRef.current = instrumentZones;
  }, [instrumentZones]);

  useEffect(() => {
    gestureMappingsRef.current = gestureMappings;
  }, [gestureMappings]);

  // Hooks
  const { checkCollisions } = useZoneCollision();
  const { checkGestures } = useGestureSounds();
  const isMuted = useIsMuted();
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setTrackingFrame = useAppStore((s) => s.setTrackingFrame);

  // Sync music settings to SoundEngine and MusicController
  const musicSettings = useAppStore((s) => s.musicSettings);
  useEffect(() => {
    if (musicControllerRef.current) {
      musicControllerRef.current.applyMusicSettings(musicSettings);
    }
  }, [musicSettings]);

  // Initialize all systems
  useEffect(() => {
    let mounted = true;
    let frameCallback: (() => void) | null = null;

    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize tracking manager
        const trackingManager = getTrackingManager();
        trackingManagerRef.current = trackingManager;
        await trackingManager.initialize();

        if (!mounted) return;

        // Initialize movement processor
        const processor = getMultiModalProcessor();
        processorRef.current = processor;

        // Initialize mapping engine
        const mappingEngine = getMappingEngine();
        mappingEngineRef.current = mappingEngine;

        // Initialize music controller
        const musicController = getMusicController();
        musicControllerRef.current = musicController;
        await musicController.initialize();
        musicController.start();

        if (!mounted) return;

        // Apply initial profile
        processor.setProfile(currentProfile);
        mappingEngine.configureFromProfile(currentProfile);
        await trackingManager.setActiveModalities(currentProfile.activeModalities);

        // Start camera
        if (!videoRef.current) {
          throw new Error('Video element not found');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 60, min: 30 },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setVideoSize({
          width: videoRef.current.videoWidth || 640,
          height: videoRef.current.videoHeight || 480,
        });

        const updateContainerSize = () => {
          if (containerRef.current) {
            setContainerSize({
              width: containerRef.current.clientWidth,
              height: containerRef.current.clientHeight,
            });
          }
        };
        updateContainerSize();
        window.addEventListener('resize', updateContainerSize);

        frameCallback = trackingManager.onFrame((frame) => {
          if (!mounted) return;
          handleTrackingFrame(frame);
        });

        trackingManager.start(videoRef.current);
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Failed to initialize';
        setError(message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      frameCallback?.();
      trackingManagerRef.current?.stop();

      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      window.removeEventListener('resize', () => {});
    };
  }, []);

  // Handle profile changes
  const handleProfileChange = useCallback(async (profile: InputProfile) => {
    setCurrentProfile(profile);

    if (processorRef.current) {
      processorRef.current.setProfile(profile);
    }

    if (mappingEngineRef.current) {
      mappingEngineRef.current.configureFromProfile(profile);
    }

    if (trackingManagerRef.current) {
      await trackingManagerRef.current.setActiveModalities(profile.activeModalities);
    }
  }, []);

  // Handle incoming tracking frames
  const handleTrackingFrame = useCallback(
    (frame: TrackingFrame) => {
      setCurrentFrame(frame);
      setTrackingFrame(frame);

      const isThereminMode = mappingEngineRef.current?.isThereminMode() ?? false;

      if (isThereminMode) {
        const thereminResult = mappingEngineRef.current?.processThereminFrame(frame);

        if (thereminResult && musicControllerRef.current) {
          const soundEngine = musicControllerRef.current.getSoundEngine();
          if (soundEngine && !isMuted) {
            if (thereminResult.shouldPlay) {
              if (!soundEngine.isThereminPlaying()) {
                soundEngine.thereminStart(thereminResult.frequency, thereminResult.volume);
              } else {
                soundEngine.thereminSetFrequency(thereminResult.frequency);
                soundEngine.thereminSetVolume(thereminResult.volume);
              }
            } else {
              if (soundEngine.isThereminPlaying()) {
                soundEngine.thereminStop();
              }
            }
          }

          setCurrentFrequency(thereminResult.frequency);
          setIsActive(thereminResult.handActive);
        }
        return;
      }

      const processedFrame = processorRef.current?.process(frame);
      if (!processedFrame) return;

      const mappingOutput = mappingEngineRef.current?.process(processedFrame);
      if (!mappingOutput) return;

      setCurrentFrequency(mappingOutput.result.pitch ?? 0);
      setIsActive(mappingOutput.result.volume !== undefined && mappingOutput.result.volume > 0.01);

      const currentZones = instrumentZonesRef.current;
      const { activeZoneIds: newActiveIds, triggeredZones } = checkCollisions(frame, currentZones);
      setActiveZoneIds(newActiveIds);

      if (triggeredZones.length > 0) {
        console.log(`[PerformanceScreen] Zone triggered! zones=${triggeredZones.length}, isMuted=${isMuted}, hasController=${!!musicControllerRef.current}`);
        if (!isMuted && musicControllerRef.current) {
          for (const zone of triggeredZones) {
            const def = getInstrumentDefinition(zone.type);
            console.log(`[PerformanceScreen] Playing zone sound: ${zone.type}`);
            musicControllerRef.current.triggerZoneSound(zone, def);
            // Record trigger event
            setRecentTriggers(prev => [
              { id: `${Date.now()}-${zone.id}`, source: 'zone', action: def.name, timestamp: Date.now() },
              ...prev.slice(0, 9)
            ]);
          }
        }
      }

      const currentMappings = gestureMappingsRef.current;
      if (currentMappings.length > 0) {
        checkGestures(frame, currentMappings, isMuted);
      } else {
        // Debug: Log occasionally if no gesture mappings
        if (frame.timestamp % 5000 < 50) {
          console.log('[PerformanceScreen] No gesture mappings configured - add mappings in Gestures panel');
        }
      }

      if (!isMuted && musicControllerRef.current) {
        musicControllerRef.current.processFrame(frame);
        musicControllerRef.current.processProcessedFrame(processedFrame);
      }
    },
    [isMuted, checkCollisions, checkGestures, setTrackingFrame]
  );

  // Sync mute state with music controller
  useEffect(() => {
    if (musicControllerRef.current) {
      if (isMuted) {
        musicControllerRef.current.stop();
      } else {
        musicControllerRef.current.start();
      }
    }
  }, [isMuted]);

  // Resume audio on user interaction
  const handleUserInteraction = useCallback(async () => {
    if (audioEnabled) return;

    if (musicControllerRef.current) {
      try {
        await musicControllerRef.current.testSound();
        setAudioEnabled(true);
      } catch (err) {
        console.error('[PerformanceScreen] Failed to enable audio:', err);
      }
    }
  }, [audioEnabled]);

  // Get active modality text
  const getActiveModalityText = () => {
    const parts: string[] = [];
    if (currentProfile.activeModalities.pose) parts.push('Body');
    if (currentProfile.activeModalities.leftHand || currentProfile.activeModalities.rightHand) parts.push('Hands');
    if (currentProfile.activeModalities.face) parts.push('Face');
    return parts.join(' + ') || 'None';
  };

  // Get tracking quality
  const getTrackingQuality = (): 'good' | 'okay' | 'poor' | 'none' => {
    if (!currentFrame) return 'none';
    const hasTracking = currentFrame.pose || currentFrame.leftHand || currentFrame.rightHand || currentFrame.face;
    if (!hasTracking) return 'none';
    // Simple heuristic - could be enhanced with actual confidence values
    if (isActive) return 'good';
    return 'okay';
  };

  // Handle zones change
  const handleZonesChange = useCallback((newZones: InstrumentZone[]) => {
    setInstrumentZones(newZones);
  }, []);

  // Handle instrument drag start
  const handleInstrumentDragStart = useCallback(
    (_instrument: InstrumentDefinition, _e: React.DragEvent) => {
      // Visual feedback handled by InstrumentPalette
    },
    []
  );

  // Sidebar nav items
  const sidebarItems = [
    { id: 'input' as const, label: 'Input', icon: IconBody },
    { id: 'points' as const, label: 'Points', icon: IconSliders },
    { id: 'sound' as const, label: 'Sound', icon: IconMusic },
    { id: 'zones' as const, label: 'Zones', icon: IconGesture },
    { id: 'gestures' as const, label: 'Gestures', icon: IconGesture },
    { id: 'effects' as const, label: 'Effects', icon: IconEffects },
    { id: 'modules' as const, label: 'Modules', icon: IconSequencer },
    { id: 'music' as const, label: 'Music', icon: IconSettings },
    { id: 'midi' as const, label: 'MIDI', icon: IconMidi },
  ];

  // Render right panel content based on active section
  const renderPanelContent = () => {
    switch (activeSection) {
      case 'input':
        return (
          <>
            <Panel title="Input Method" defaultExpanded={isInputMethodPanelExpanded}>
              <InputMethodPanel
                isExpanded={true}
                onToggle={() => {}}
                onInputMethodChange={setActiveInputMethod}
              />
              {activeInputMethod === 'theremin' && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <ThereminDisplay isActive={activeInputMethod === 'theremin'} />
                </div>
              )}
            </Panel>
            <Panel title="Input Profile" defaultExpanded={true}>
              <InputProfileSelector
                currentProfile={currentProfile}
                onProfileSelect={handleProfileChange}
                showDetails={false}
              />
            </Panel>
          </>
        );

      case 'sound':
        return (
          <>
            <Panel title="Volume" defaultExpanded={true}>
              <VolumeControl />
            </Panel>
            <Panel title="Sound Preset" defaultExpanded={true}>
              <SoundPresetSelector />
            </Panel>
          </>
        );

      case 'zones':
        return (
          <Panel title="Instrument Zones" collapsible={false}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
              Drag instruments from the palette onto the video to create trigger zones.
            </p>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Active zones: {instrumentZones.length}
            </div>
          </Panel>
        );

      case 'gestures':
        return (
          <Panel title="Gesture Triggers" collapsible={false}>
            <GestureMappingPanel
              mappings={gestureMappings}
              onMappingsChange={setGestureMappings}
              isExpanded={isGesturePanelExpanded}
              onToggle={() => setIsGesturePanelExpanded(!isGesturePanelExpanded)}
              parentExpanded={rightPanelExpanded}
            />
          </Panel>
        );

      case 'points':
        return (
          <Panel title="Body Points" collapsible={false}>
            <BodyPointsPanel
              trackedPoints={trackedPoints}
              onPointsChange={setTrackedPoints}
              parentExpanded={rightPanelExpanded}
            />
          </Panel>
        );

      case 'effects':
        return (
          <Panel title="Effect Chain" collapsible={false}>
            <EffectChainSelector
              isExpanded={isEffectPanelExpanded}
              onToggle={() => setIsEffectPanelExpanded(!isEffectPanelExpanded)}
            />
          </Panel>
        );

      case 'modules':
        return (
          <Panel title="Musical Modules" collapsible={false}>
            <MusicalModulesPanel />
          </Panel>
        );

      case 'music':
        return (
          <Panel title="Music Settings" collapsible={false}>
            <MusicSettingsPanel />
          </Panel>
        );

      case 'midi':
        return (
          <Panel title="MIDI Output" collapsible={false}>
            <MIDISettingsPanel
              isExpanded={isMidiPanelExpanded}
              onToggle={() => setIsMidiPanelExpanded(!isMidiPanelExpanded)}
            />
          </Panel>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-shell app-shell--with-sidebar" onClick={handleUserInteraction}>
      {/* Left Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__logo">A</div>
          <span className="sidebar__title">ADMIv3</span>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section">
            <button
              className="sidebar__item"
              onClick={() => setCurrentScreen('welcome')}
              title={sidebarCollapsed ? 'Home' : undefined}
            >
              <IconHome size={18} />
              <span className="sidebar__item-label">Home</span>
            </button>
          </div>

          <div className="sidebar__section">
            <div className="sidebar__section-title">Controls</div>
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                  onClick={() => {
                    setActiveSection(item.id);
                    setRightPanelOpen(true);
                  }}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon size={18} />
                  <span className="sidebar__item-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="sidebar__footer">
          <button
            className="sidebar__collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar__section toolbar__section--start">
            <div className="quick-actions">
              <button
                className={`quick-actions__btn ${isActive && !isMuted ? 'quick-actions__btn--active' : ''}`}
                title={isActive ? 'Playing' : 'Ready'}
              >
                {isActive && !isMuted ? <IconPlay size={16} /> : <IconPause size={16} />}
              </button>
              <button
                className={`quick-actions__btn ${isMuted ? '' : 'quick-actions__btn--active'}`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <IconVolumeMute size={16} /> : <IconVolume size={16} />}
              </button>
            </div>
          </div>

          <div className="toolbar__section toolbar__section--center">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {currentProfile.name}
            </span>
            <span className="toolbar__divider" />
            <TrackingStatus quality={getTrackingQuality()} compact />
          </div>

          <div className="toolbar__section toolbar__section--end">
            <button
              className={`btn btn--sm btn--ghost ${rightPanelOpen ? 'btn--active' : ''}`}
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
            >
              <IconSettings size={16} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="content-area">
          {/* Main View (Video) */}
          <div className="main-view">
            <div className="main-view__content" ref={containerRef}>
              <div className="video-container">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Camera feed showing your movements"
                />

                {/* Tracking overlay */}
                <TrackingOverlay
                  frame={currentFrame}
                  profile={currentProfile}
                  width={videoSize.width}
                  height={videoSize.height}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                  showAllLandmarks={true}
                  showConnections={true}
                  showLabels={showLandmarkLabels}
                />

                {/* Instrument zone overlay */}
                <InstrumentZoneOverlay
                  zones={instrumentZones}
                  onZonesChange={handleZonesChange}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                  videoWidth={videoSize.width}
                  videoHeight={videoSize.height}
                  activeZoneIds={activeZoneIds}
                />

                {/* Instrument palette */}
                <InstrumentPalette
                  onDragStart={handleInstrumentDragStart}
                  isExpanded={isPaletteExpanded}
                  onToggle={() => setIsPaletteExpanded(!isPaletteExpanded)}
                />

                {/* Loading overlay */}
                {isLoading && (
                  <div className="video-overlay" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    pointerEvents: 'auto',
                  }}>
                    <Spinner size="lg" label="Initializing camera..." />
                  </div>
                )}

                {/* Error overlay */}
                {error && (
                  <div className="video-overlay" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-4)',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    pointerEvents: 'auto',
                  }}>
                    <p style={{ color: 'var(--color-text)' }}>Unable to start camera</p>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>{error}</p>
                    <button className="btn btn--primary" onClick={() => window.location.reload()}>
                      Try Again
                    </button>
                  </div>
                )}

                {/* Audio enable prompt */}
                {!audioEnabled && !isLoading && !error && (
                  <div className="video-overlay" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-6)',
                      backgroundColor: 'var(--color-primary)',
                      borderRadius: 'var(--radius-xl)',
                      color: 'var(--color-text-inverse)',
                    }}>
                      <IconVolume size={32} />
                      <span style={{ fontWeight: 'var(--font-semibold)' }}>Click to enable audio</span>
                    </div>
                  </div>
                )}

                {/* Labels toggle button */}
                <button
                  className="labels-toggle-btn"
                  onClick={() => setShowLandmarkLabels(!showLandmarkLabels)}
                  title={showLandmarkLabels ? 'Hide landmark labels' : 'Show landmark labels'}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: showLandmarkLabels ? '#f97316' : 'rgba(0, 0, 0, 0.7)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    zIndex: 100,
                    fontWeight: 600,
                  }}
                >
                  {showLandmarkLabels ? 'LABELS ON' : 'LABELS OFF'}
                </button>

                {/* Mute indicator */}
                {isMuted && audioEnabled && (
                  <div style={{
                    position: 'absolute',
                    top: 'var(--space-4)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: 'var(--space-2) var(--space-4)',
                    backgroundColor: 'var(--color-error)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-medium)',
                    color: 'var(--color-text)',
                  }}>
                    Sound Muted - Press Space to unmute
                  </div>
                )}
              </div>
            </div>

            {/* Tracking Status - Outside video area */}
            <div className="tracking-info-bar">
              <TrackingStatusOverlay
                frame={currentFrame}
                trackedPoints={trackedPoints}
                recentTriggers={recentTriggers}
                isMuted={isMuted}
              />
            </div>
          </div>

          {/* Right Panel */}
          {rightPanelOpen && (
            <div className={`right-panel ${rightPanelExpanded ? 'right-panel--expanded' : ''}`}>
              <div className="right-panel__header">
                <span className="right-panel__title">
                  {sidebarItems.find(i => i.id === activeSection)?.label || 'Controls'}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className={`btn btn--sm btn--ghost ${rightPanelExpanded ? 'btn--active' : ''}`}
                    onClick={() => setRightPanelExpanded(!rightPanelExpanded)}
                    aria-label={rightPanelExpanded ? 'Collapse panel' : 'Expand panel'}
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    {rightPanelExpanded ? 'Collapse' : 'Expand'}
                  </button>
                  <button
                    className="btn btn--sm btn--icon btn--ghost"
                    onClick={() => setRightPanelOpen(false)}
                    aria-label="Close panel"
                  >
                    <IconChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div className="right-panel__content">
                <div className="panel-grid">
                  {renderPanelContent()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="status-bar">
          <div className="status-bar__item">
            <StatusDot status={isActive ? 'active' : 'inactive'} />
            <span className="status-bar__value">{isActive ? 'Playing' : 'Ready'}</span>
          </div>
          <span className="status-bar__divider" />
          <div className="status-bar__item">
            <span className="status-bar__label">Mode</span>
            <span className="status-bar__value">{currentProfile.name}</span>
          </div>
          <span className="status-bar__divider" />
          <div className="status-bar__item">
            <span className="status-bar__label">Tracking</span>
            <span className="status-bar__value">{getActiveModalityText()}</span>
          </div>
          <span className="status-bar__divider" />
          <div className="status-bar__item">
            <span className="status-bar__label">Zones</span>
            <span className="status-bar__value">{instrumentZones.length}</span>
          </div>
          <span className="status-bar__divider" />
          <div className="status-bar__item">
            <span className="status-bar__label">Points</span>
            <span className="status-bar__value">{trackedPoints.filter(p => p.enabled).length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PerformanceScreenV2;
