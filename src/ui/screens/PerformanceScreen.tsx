/**
 * Performance Screen - Main playing interface
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore, useIsMuted, useUserProfile, useAccessibilityMode, useSensitivity } from '../../state/store';
import WebcamView from '../components/WebcamView';
import VisualFeedback from '../components/VisualFeedback';
import VolumeControl from '../components/VolumeControl';
import SoundPresetSelector from '../components/SoundPresetSelector';
import { SignalSmoother } from '../../movement/SignalSmoother';
import { MovementDetector } from '../../movement/MovementDetector';
import { ContinuousMapper } from '../../mapping/ContinuousMapper';
import { LANDMARKS } from '../../utils/constants';
import type { PoseLandmarks } from '../../state/types';

function PerformanceScreen() {
  const smootherRef = useRef<SignalSmoother | null>(null);
  const detectorRef = useRef<MovementDetector | null>(null);
  const mapperRef = useRef<ContinuousMapper | null>(null);

  const [currentFrequency, setCurrentFrequency] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const isMuted = useIsMuted();
  const userProfile = useUserProfile();
  const accessibilityMode = useAccessibilityMode();
  const sensitivity = useSensitivity();

  const setCurrentMovement = useAppStore((s) => s.setCurrentMovement);
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // Initialize processing pipeline
  useEffect(() => {
    smootherRef.current = new SignalSmoother();
    detectorRef.current = new MovementDetector({
      trackedLandmark: LANDMARKS.RIGHT_WRIST,
      sensitivity,
    });
    mapperRef.current = new ContinuousMapper();

    // Apply user profile settings
    if (userProfile) {
      detectorRef.current.setRestPosition(userProfile.restPosition);
      smootherRef.current.setAccessibilityMode(userProfile.accessibilityMode);
    }

    return () => {
      mapperRef.current?.reset();
    };
  }, [userProfile, sensitivity]);

  // Update accessibility mode
  useEffect(() => {
    smootherRef.current?.setAccessibilityMode(accessibilityMode);
    detectorRef.current?.setAccessibilityMode(accessibilityMode);
  }, [accessibilityMode]);

  // Handle pose updates
  const handlePose = useCallback(
    (landmarks: PoseLandmarks | null) => {
      if (!landmarks || !smootherRef.current || !detectorRef.current || !mapperRef.current) {
        return;
      }

      // Smooth the landmarks
      const smoothed = smootherRef.current.smooth(landmarks);

      // Detect movement
      const movement = detectorRef.current.detect(smoothed);

      if (movement) {
        setCurrentMovement(movement);
        setIsActive(movement.isActive);

        // Map to sound
        mapperRef.current.map(movement, isMuted);

        // Update frequency display
        const freq = mapperRef.current.getFrequency(movement.position.y);
        setCurrentFrequency(movement.isActive ? freq : 0);
      }
    },
    [isMuted, setCurrentMovement]
  );

  // Stop sound when muted
  useEffect(() => {
    if (isMuted && mapperRef.current) {
      mapperRef.current.stopNote();
      setCurrentFrequency(0);
      setIsActive(false);
    }
  }, [isMuted]);

  return (
    <div className="screen" style={{ padding: 'var(--space-lg)' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <h1 style={{ fontSize: 'var(--font-size-xl)' }}>Performance</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn btn--secondary"
            onClick={() => setCurrentScreen('calibration')}
          >
            Calibrate
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => setCurrentScreen('welcome')}
          >
            Home
          </button>
        </div>
      </header>

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: 'var(--space-xl)',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        {/* Video feed */}
        <div style={{ flex: '1 1 400px', maxWidth: '640px' }}>
          <WebcamView onPose={handlePose} trackedLandmark={LANDMARKS.RIGHT_WRIST} />

          {/* Quick instructions */}
          <div
            style={{
              marginTop: 'var(--space-md)',
              padding: 'var(--space-md)',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {isMuted
                ? 'Sound is muted. Click the speaker button to unmute.'
                : 'Move your right hand up and down to change pitch. The speed of your movement affects volume.'}
            </p>
          </div>
        </div>

        {/* Visual feedback and controls */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <VisualFeedback frequency={currentFrequency} isActive={isActive} />

          {/* Sound controls */}
          <VolumeControl />
          <SoundPresetSelector />

          {/* Mode indicator */}
          <div
            style={{
              padding: 'var(--space-md)',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Mode: <span style={{ color: 'var(--color-secondary)' }}>{accessibilityMode}</span>
            </p>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Sensitivity: <span style={{ color: 'var(--color-secondary)' }}>{sensitivity.toFixed(1)}x</span>
            </p>
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <footer
        style={{
          marginTop: 'auto',
          paddingTop: 'var(--space-lg)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        <p>
          <kbd style={{ padding: '2px 6px', backgroundColor: 'var(--color-surface)', borderRadius: 0 }}>
            Space
          </kbd>{' '}
          Toggle mute •{' '}
          <kbd style={{ padding: '2px 6px', backgroundColor: 'var(--color-surface)', borderRadius: 0 }}>
            D
          </kbd>{' '}
          Debug panel
        </p>
      </footer>
    </div>
  );
}

export default PerformanceScreen;
