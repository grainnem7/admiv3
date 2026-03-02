/**
 * Between Us Screen - Participatory Improvisation Performance Mode
 *
 * Main interface for the "Between Us" ICMC 2026 performance.
 * Integrates presence detection, layered sound accumulation, and
 * visual feedback for musicians and participants.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useAppStore, useIsMuted } from '../../state/store';
import WebcamView from '../components/WebcamView';
import PresenceOverlay from '../components/PresenceOverlay';
import LayerOrbs from '../components/LayerOrbs';
import {
  LayerAccumulator,
  getLayerAccumulator,
  type SoundLayer,
  type SustainedLayerController,
} from '../../performance/LayerAccumulator';
import {
  PresenceDetector,
  getPresenceDetector,
  type PresenceState,
} from '../../performance/PresenceDetector';
import type { PoseLandmarks, TrackingFrame } from '../../state/types';
import FacilitatorPanel from '../components/FacilitatorPanel';

// Performance configuration
interface PerformanceConfig {
  /** How long sustained notes play before fading (seconds) */
  sustainDuration: number;
  /** Fade time for accumulated layers (seconds) */
  fadeTime: number;
  /** Delay before auto-fade (seconds) */
  autoFadeDelay: number;
  /** Reverb mix (0-1) */
  reverbMix: number;
  /** Delay mix (0-1) */
  delayMix: number;
  /** Master volume (0-1) */
  masterVolume: number;
  /** Note range for pitch mapping */
  noteRange: { min: number; max: number };
}

const DEFAULT_CONFIG: PerformanceConfig = {
  sustainDuration: 4,
  fadeTime: 8,
  autoFadeDelay: 4,
  reverbMix: 0.2,   // Less reverb for clearer, more direct sound
  delayMix: 0.1,    // Less delay for immediate response
  masterVolume: 0.75,
  noteRange: { min: 48, max: 84 }, // C3 to C6
};

function BetweenUsScreen() {
  // Refs
  const accumulatorRef = useRef<LayerAccumulator | null>(null);
  const presenceDetectorRef = useRef<PresenceDetector | null>(null);
  const sustainedLayerRef = useRef<SustainedLayerController | null>(null);
  const isMutedRef = useRef(true);
  const lastStaccatoTimeRef = useRef(0);
  const lastRightHandYRef = useRef(0.5);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [presenceState, setPresenceState] = useState<PresenceState | null>(null);
  const [layers, setLayers] = useState<SoundLayer[]>([]);
  const [showFacilitator, setShowFacilitator] = useState(false);
  const [config, setConfig] = useState<PerformanceConfig>(DEFAULT_CONFIG);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Store
  const isMuted = useIsMuted();
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setMuted = useAppStore((s) => s.setMuted);

  // Initialize audio systems
  useEffect(() => {
    let unsubscribeLayerChange: (() => void) | null = null;
    let unsubscribePresenceChange: (() => void) | null = null;

    const init = async () => {
      try {
        // Start Tone.js
        await Tone.start();

        // Initialize accumulator
        const accumulator = getLayerAccumulator();
        await accumulator.initialize();
        accumulatorRef.current = accumulator;

        // Subscribe to layer changes
        unsubscribeLayerChange = accumulator.onLayerChange((newLayers) => {
          setLayers([...newLayers]);
        });

        // Initialize presence detector
        const detector = getPresenceDetector();
        presenceDetectorRef.current = detector;

        // Subscribe to presence changes
        unsubscribePresenceChange = detector.onPresenceChange((isPresent) => {
          if (!isPresent && sustainedLayerRef.current) {
            // Participant left - fade the sustained layer into accumulation
            sustainedLayerRef.current.fadeAndRemove();
            sustainedLayerRef.current = null;
          }
        });

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize Between Us:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    init();

    return () => {
      // Cleanup subscriptions but don't dispose singletons
      unsubscribeLayerChange?.();
      unsubscribePresenceChange?.();
      if (sustainedLayerRef.current) {
        sustainedLayerRef.current.release();
        sustainedLayerRef.current = null;
      }
      // Stop all sounds but don't dispose the singleton
      accumulatorRef.current?.stopAll();
    };
  }, []);

  // Update accumulator settings when config changes
  useEffect(() => {
    const accumulator = accumulatorRef.current;
    if (!accumulator) return;

    accumulator.setFadeTime(config.fadeTime);
    accumulator.setEffectMix(config.reverbMix, config.delayMix);
    accumulator.setMasterGain(config.masterVolume);
  }, [config.fadeTime, config.reverbMix, config.delayMix, config.masterVolume]);

  // Update presence detector when note range changes
  useEffect(() => {
    presenceDetectorRef.current?.setNoteRange(config.noteRange.min, config.noteRange.max);
  }, [config.noteRange]);

  // Handle mute changes
  useEffect(() => {
    isMutedRef.current = isMuted;
    accumulatorRef.current?.setMuted(isMuted);

    // Resume audio context when unmuting
    if (!isMuted) {
      Tone.start().catch(console.error);
    }

    // Release sustained layer when muting
    if (isMuted && sustainedLayerRef.current) {
      sustainedLayerRef.current.release();
      sustainedLayerRef.current = null;
    }
  }, [isMuted]);

  // Handle pose updates from webcam
  const handlePose = useCallback(
    (landmarks: PoseLandmarks | null) => {
      if (!presenceDetectorRef.current || !accumulatorRef.current) {
        return;
      }

      // Create tracking frame from pose
      const frame: TrackingFrame = {
        pose: landmarks,
        leftHand: null,
        rightHand: null,
        face: null,
        timestamp: Date.now(),
      };

      // Detect presence (always detect for visualization, even if muted)
      const state = presenceDetectorRef.current.detect(frame);
      setPresenceState(state);

      // Don't produce sound if muted
      if (isMutedRef.current) {
        return;
      }

      if (!state.isPresent) {
        return;
      }

      // Left hand controls sustain (raised = hold note)
      const leftHandRaised = state.leftHand.visible && state.leftHand.raised;
      const rightHandRaised = state.rightHand.visible && state.rightHand.raised;

      // Right hand controls expression/dynamics
      // Lower position = more intense/brighter
      const rightHandExpression = state.rightHand.visible
        ? 1 - state.rightHand.y  // Invert: lower hand = higher expression
        : 0.5;

      // Use head position directly for pitch - more responsive
      // state.musicalParams.frequency already derives from nose Y position
      const baseFrequency = state.musicalParams.frequency;

      // Left hand can add vibrato/pitch bend when visible
      const pitchBend = state.leftHand.visible
        ? 1 + (0.5 - state.leftHand.y) * 0.15  // Subtle pitch bend from left hand height
        : 1;
      const frequency = baseFrequency * pitchBend;

      // Velocity influenced by activity and right hand
      const baseVelocity = state.musicalParams.velocity;
      const velocity = Math.min(1, baseVelocity * (0.7 + state.activityLevel * 0.3 + rightHandExpression * 0.2));

      const { waveform } = state.musicalParams;

      // === STACCATO MODE: Right hand raised + fast movement = rapid notes ===
      if (rightHandRaised && state.rightHand.visible) {
        const now = Date.now();
        const rightHandSpeed = Math.abs(state.rightHand.y - lastRightHandYRef.current);
        lastRightHandYRef.current = state.rightHand.y;

        // Trigger staccato if moving fast enough and enough time has passed
        const minTimeBetweenNotes = 80; // ms - allows up to ~12 notes/second
        const speedThreshold = 0.015;   // Movement threshold to trigger

        if (rightHandSpeed > speedThreshold && now - lastStaccatoTimeRef.current > minTimeBetweenNotes) {
          // Use right hand Y position for pitch of staccato notes
          const staccatoMidi = Math.round(48 + (1 - state.rightHand.y) * 36); // C3 to C6
          const staccatoFreq = 440 * Math.pow(2, (staccatoMidi - 69) / 12);
          const staccatoVel = Math.min(1, 0.5 + rightHandSpeed * 10); // Faster = louder

          accumulatorRef.current.playStaccato(staccatoFreq, staccatoVel, 'triangle');
          lastStaccatoTimeRef.current = now;
        }
      }

      // === SUSTAIN MODE: Left hand raised = continuous tone ===
      if (leftHandRaised) {
        // Left hand raised - create or update sustained layer
        if (!sustainedLayerRef.current) {
          sustainedLayerRef.current = accumulatorRef.current.addSustainedLayer(
            frequency,
            velocity,
            waveform
          );
        } else {
          // Update all expressive parameters
          sustainedLayerRef.current.updatePitch(frequency);
          sustainedLayerRef.current.updateVelocity(velocity);

          // Right hand controls filter and expression
          if (state.rightHand.visible) {
            sustainedLayerRef.current.updateExpression(rightHandExpression);
            // Also use horizontal position for subtle filter sweep
            sustainedLayerRef.current.updateFilter(state.rightHand.x);
          }
        }
      } else if (sustainedLayerRef.current) {
        // Left hand lowered - fade the sustained layer into accumulation
        sustainedLayerRef.current.fadeAndRemove();
        sustainedLayerRef.current = null;
      }
    },
    [] // No dependencies - uses refs
  );

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setMuted(!isMuted);
          break;
        case 'f':
          e.preventDefault();
          setShowFacilitator(!showFacilitator);
          break;
        case 'escape':
          if (showFacilitator) {
            setShowFacilitator(false);
          }
          break;
        case 'c':
          // Clear all layers
          accumulatorRef.current?.clearAll();
          break;
        case 's':
          // Stop all layers immediately
          accumulatorRef.current?.stopAll();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMuted, showFacilitator, setMuted]);

  // Config update handlers
  const updateConfig = useCallback((updates: Partial<PerformanceConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  if (!isInitialized) {
    return (
      <div
        className="screen"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-lg)',
        }}
      >
        <h1>Between Us</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Participatory improvisation performance
        </p>
        {initError ? (
          <>
            <p style={{ color: '#ff4444', fontSize: 'var(--font-size-sm)' }}>
              Error: {initError}
            </p>
            <button
              className="btn btn--secondary"
              onClick={() => setCurrentScreen('welcome')}
            >
              Back to Home
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Initializing audio system...
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="screen between-us-screen"
      style={{
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0a0a0f',
      }}
    >
      {/* Header - minimal for performance */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-sm) var(--space-md)',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          opacity: showFacilitator ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        onMouseEnter={() => !showFacilitator && undefined}
      >
        <h1 style={{ fontSize: 'var(--font-size-md)', margin: 0 }}>Between Us</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => setShowFacilitator(!showFacilitator)}
          >
            {showFacilitator ? 'Hide Controls' : 'Controls (F)'}
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => setCurrentScreen('welcome')}
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main content area - full width webcam */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          position: 'relative',
          padding: 0,
        }}
      >
        {/* Full-width camera feed with presence overlay */}
        <div
          className="between-us-webcam"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WebcamView onPose={handlePose} showOverlay={false} />
          <PresenceOverlay presenceState={presenceState} layers={layers} />
        </div>

        {/* Layer orbs overlay - bottom right corner */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 20,
            zIndex: 20,
            opacity: 0.9,
          }}
        >
          <LayerOrbs layers={layers} width={200} height={200} />
        </div>

        {/* Minimal status indicator - top left */}
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 20,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            borderRadius: 20,
            backdropFilter: 'blur(4px)',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: presenceState?.isPresent ? '#00ff88' : '#666',
              boxShadow: presenceState?.isPresent ? '0 0 8px #00ff88' : 'none',
            }}
          />
          <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
            {isMuted
              ? 'MUTED'
              : presenceState?.rightHand?.raised
                ? 'Staccato'
                : presenceState?.leftHand?.raised && presenceState?.rightHand?.visible
                  ? 'Expressive'
                  : presenceState?.leftHand?.raised
                    ? 'Sustaining'
                    : presenceState?.isPresent
                      ? 'Active'
                      : 'Waiting'}
          </span>
        </div>
      </main>

      {/* Facilitator panel (overlay) */}
      {showFacilitator && (
        <FacilitatorPanel
          config={config}
          onConfigChange={updateConfig}
          presenceState={presenceState}
          layers={layers}
          onClearLayers={() => accumulatorRef.current?.clearAll()}
          onStopAll={() => accumulatorRef.current?.stopAll()}
          onClose={() => setShowFacilitator(false)}
        />
      )}

      {/* Keyboard shortcuts hint */}
      <footer
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 'var(--space-sm) var(--space-md)',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-xs)',
          opacity: showFacilitator ? 1 : 0.3,
          transition: 'opacity 0.3s ease',
        }}
      >
        <kbd>Space</kbd> Mute/Unmute • <kbd>F</kbd> Facilitator Panel •{' '}
        <kbd>C</kbd> Clear Layers • <kbd>S</kbd> Stop All
      </footer>
    </div>
  );
}

export default BetweenUsScreen;
