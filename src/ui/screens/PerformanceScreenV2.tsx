/**
 * Performance Screen V2 - Redesigned for cleaner UX
 *
 * Simplified layout with:
 * - Larger video feed as the focus
 * - Collapsible controls panel
 * - Cleaner profile selection grouped by category
 * - Quick-access sound controls
 * - Drag-and-drop instrument zones
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore, useIsMuted } from '../../state/store';
import type { TrackingFrame, InputProfile } from '../../state/types';
import type { InstrumentZone, InstrumentDefinition, GestureSoundMapping } from '../../state/instrumentZones';
import { getInstrumentDefinition } from '../../state/instrumentZones';
import { TrackingManager, getTrackingManager } from '../../tracking/TrackingManager';
import { MultiModalProcessor, getMultiModalProcessor } from '../../movement/MultiModalProcessor';
import { MappingEngine, getMappingEngine } from '../../mapping/MappingEngine';
import { MusicController, getMusicController } from '../../core/MusicController';
import { DEFAULT_PRESETS } from '../../profiles/presets';
import { useZoneCollision } from '../../hooks/useZoneCollision';
import { useGestureSounds } from '../../hooks/useGestureSounds';
import TrackingOverlay from '../components/TrackingOverlay';
import InputProfileSelector from '../components/InputProfileSelector';
import VolumeControl from '../components/VolumeControl';
import SoundPresetSelector from '../components/SoundPresetSelector';
import InstrumentPalette from '../components/InstrumentPalette';
import InstrumentZoneOverlay from '../components/InstrumentZoneOverlay';
import GestureMappingPanel from '../components/GestureMappingPanel';
import MIDISettingsPanel from '../components/MIDISettingsPanel';
import { MusicalModulesPanel } from '../components/MusicalModulesPanel';

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
  const [currentFrequency, setCurrentFrequency] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Instrument zones state - start fresh (no localStorage persistence for now)
  const [instrumentZones, setInstrumentZones] = useState<InstrumentZone[]>([]);
  const instrumentZonesRef = useRef<InstrumentZone[]>([]); // Ref for callback access
  const [activeZoneIds, setActiveZoneIds] = useState<Set<string>>(new Set());
  const [isPaletteExpanded, setIsPaletteExpanded] = useState(false);

  // Gesture sound mappings state
  const [gestureMappings, setGestureMappings] = useState<GestureSoundMapping[]>([]);
  const gestureMappingsRef = useRef<GestureSoundMapping[]>([]);
  const [isGesturePanelExpanded, setIsGesturePanelExpanded] = useState(false);

  // MIDI settings state
  const [isMidiPanelExpanded, setIsMidiPanelExpanded] = useState(false);

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

  // Log zone changes (localStorage persistence disabled for debugging)
  useEffect(() => {
    console.log(`[PerformanceScreen] instrumentZones state updated: ${instrumentZones.length} zones`);
  }, [instrumentZones]);

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

        // Initialize music controller (new Tone.js-based sound engine)
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

        // Get camera stream
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

        // Update video size (native resolution)
        setVideoSize({
          width: videoRef.current.videoWidth || 640,
          height: videoRef.current.videoHeight || 480,
        });

        // Update container size for proper overlay positioning
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

        // Subscribe to tracking frames
        frameCallback = trackingManager.onFrame((frame) => {
          if (!mounted) return;
          handleTrackingFrame(frame);
        });

        // Start tracking
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

      // Stop camera
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      // Clean up resize listener
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

      // Process through movement processor
      const processedFrame = processorRef.current?.process(frame);
      if (!processedFrame) return;

      // Process through mapping engine
      const mappingOutput = mappingEngineRef.current?.process(processedFrame);
      if (!mappingOutput) return;

      // Update UI state
      setCurrentFrequency(mappingOutput.result.pitch ?? 0);
      setIsActive(mappingOutput.result.volume !== undefined && mappingOutput.result.volume > 0.01);

      // Check for zone collisions - use ref to get current zones
      const currentZones = instrumentZonesRef.current;
      const { activeZoneIds: newActiveIds, triggeredZones } = checkCollisions(frame, currentZones);
      setActiveZoneIds(newActiveIds);

      // Trigger sounds for newly entered zones
      if (triggeredZones.length > 0) {
        console.log(`[PerformanceScreen] Zone triggered: ${triggeredZones.map(z => z.type).join(', ')}, muted=${isMuted}, controller=${!!musicControllerRef.current}`);
        if (!isMuted && musicControllerRef.current) {
          for (const zone of triggeredZones) {
            const def = getInstrumentDefinition(zone.type);
            musicControllerRef.current.triggerZoneSound(zone, def);
          }
        }
      }

      // Check for gesture triggers - use ref to get current mappings
      const currentMappings = gestureMappingsRef.current;
      if (currentMappings.length > 0) {
        checkGestures(frame, currentMappings, isMuted);
      }

      // Send to music controller (new Tone.js-based system)
      if (!isMuted && musicControllerRef.current) {
        musicControllerRef.current.processFrame(frame);
        musicControllerRef.current.processProcessedFrame(processedFrame);
      }
    },
    [isMuted, checkCollisions, checkGestures]
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
    if (audioEnabled) return; // Already enabled

    if (musicControllerRef.current) {
      try {
        await musicControllerRef.current.testSound();
        setAudioEnabled(true);
        console.log('[PerformanceScreen] Audio enabled by user interaction');
      } catch (err) {
        console.error('[PerformanceScreen] Failed to enable audio:', err);
      }
    }
  }, [audioEnabled]);

  // Get note name from frequency
  const getNoteName = (freq: number): string => {
    if (freq === 0) return '--';
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    const noteName = noteNames[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}${octave}`;
  };

  // Get active modality indicators
  const getActiveModalityText = () => {
    const parts: string[] = [];
    if (currentProfile.activeModalities.pose) parts.push('Body');
    if (currentProfile.activeModalities.leftHand || currentProfile.activeModalities.rightHand) parts.push('Hands');
    if (currentProfile.activeModalities.face) parts.push('Face');
    return parts.join(' + ');
  };

  // Handle instrument drag start
  const handleInstrumentDragStart = useCallback(
    (_instrument: InstrumentDefinition, _e: React.DragEvent) => {
      // Could show visual feedback here
    },
    []
  );

  // Handle zones change
  const handleZonesChange = useCallback((newZones: InstrumentZone[]) => {
    console.log(`[PerformanceScreen] handleZonesChange called with ${newZones.length} zones`);
    setInstrumentZones(newZones);
  }, []);

  return (
    <div className="performance-screen" onClick={handleUserInteraction}>
      {/* Main video area */}
      <div className="performance-main">
        <div className="performance-content">
        <div className="video-wrapper" ref={containerRef}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="performance-video"
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
            <div className="video-overlay-message">
              <div className="loading-spinner" />
              <p>Initializing camera and tracking...</p>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="video-overlay-message video-overlay-message--error">
              <p>Unable to start camera</p>
              <p className="error-detail">{error}</p>
              <button className="btn" onClick={() => window.location.reload()}>
                Try Again
              </button>
            </div>
          )}

          {/* Current note display - floating */}
          <div className={`note-display ${isActive && !isMuted ? 'note-display--active' : ''}`}>
            <span className="note-name">{getNoteName(currentFrequency)}</span>
            {currentFrequency > 0 && (
              <span className="note-freq">{Math.round(currentFrequency)} Hz</span>
            )}
          </div>

          {/* Audio enable prompt - shows until user clicks */}
          {!audioEnabled && !isLoading && !error && (
            <div className="audio-enable-prompt" onClick={handleUserInteraction}>
              <div className="audio-enable-content">
                <span className="audio-enable-icon">🔊</span>
                <span>Click anywhere to enable audio</span>
              </div>
            </div>
          )}

          {/* Mute indicator overlay */}
          {isMuted && audioEnabled && (
            <div className="mute-indicator">
              Sound Muted - Press Space to unmute
            </div>
          )}
        </div>

        {/* Status bar below video */}
        <div className="status-bar">
          <div className="status-item">
            <span className={`status-dot ${isActive ? 'status-dot--active' : ''}`} />
            <span>{isActive ? 'Playing' : 'Ready'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Mode:</span>
            <span className="status-value">{currentProfile.name}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Tracking:</span>
            <span className="status-value">{getActiveModalityText()}</span>
          </div>
        </div>
        </div>
      </div>

      {/* Compact top bar */}
      <header className="performance-header">
        <button
          className="btn btn--icon btn--ghost"
          onClick={() => setCurrentScreen('welcome')}
          aria-label="Go home"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
          </svg>
        </button>

        <h1 className="performance-title">ADMIv3</h1>

        <button
          className={`btn btn--icon ${showControls ? 'btn--active' : 'btn--ghost'}`}
          onClick={() => setShowControls(!showControls)}
          aria-label={showControls ? 'Hide controls' : 'Show controls'}
          aria-expanded={showControls}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
          </svg>
        </button>
      </header>

      {/* Slide-out controls panel */}
      <aside className={`controls-panel ${showControls ? 'controls-panel--open' : ''}`}>
        <div className="controls-content">
          <div className="controls-section">
            <h3 className="controls-section-title">Input Mode</h3>
            <InputProfileSelector
              currentProfile={currentProfile}
              onProfileSelect={handleProfileChange}
              showDetails={false}
            />
          </div>

          <div className="controls-section">
            <h3 className="controls-section-title">Sound</h3>
            <VolumeControl />
            <SoundPresetSelector />
          </div>

          <div className="controls-section">
            <h3 className="controls-section-title">Gesture Triggers</h3>
            <GestureMappingPanel
              mappings={gestureMappings}
              onMappingsChange={setGestureMappings}
              isExpanded={isGesturePanelExpanded}
              onToggle={() => setIsGesturePanelExpanded(!isGesturePanelExpanded)}
            />
          </div>

          <div className="controls-section">
            <h3 className="controls-section-title">Musical Modules</h3>
            <MusicalModulesPanel />
          </div>

          <div className="controls-section">
            <h3 className="controls-section-title">MIDI Output</h3>
            <MIDISettingsPanel
              isExpanded={isMidiPanelExpanded}
              onToggle={() => setIsMidiPanelExpanded(!isMidiPanelExpanded)}
            />
          </div>

          <div className="controls-section">
            <h3 className="controls-section-title">Keyboard Shortcuts</h3>
            <div className="shortcuts-list">
              <div className="shortcut">
                <kbd>Space</kbd>
                <span>Toggle mute</span>
              </div>
              <div className="shortcut">
                <kbd>D</kbd>
                <span>Debug panel</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay to close controls when clicking outside */}
      {showControls && (
        <div
          className="controls-overlay"
          onClick={() => setShowControls(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default PerformanceScreenV2;
