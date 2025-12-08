/**
 * Calibration Screen - Creative calibration workflow
 */

import { useState, useCallback } from 'react';
import { useAppStore } from '../../state/store';
import WebcamView from '../components/WebcamView';
import type { PoseLandmarks } from '../../state/types';
import { LANDMARKS } from '../../utils/constants';

type CalibrationStep = 'intro' | 'rest' | 'range' | 'complete';

function CalibrationScreen() {
  const [step, setStep] = useState<CalibrationStep>('intro');
  const [restPosition, setRestPosition] = useState<{ x: number; y: number } | null>(null);
  const [samples, setSamples] = useState<{ x: number; y: number }[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const saveProfile = useAppStore((s) => s.saveProfile);

  const handlePose = useCallback(
    (landmarks: PoseLandmarks | null) => {
      if (!landmarks || !isRecording) return;

      const wrist = landmarks.landmarks[LANDMARKS.RIGHT_WRIST];
      if (!wrist || (wrist.visibility ?? 0) < 0.5) return;

      setSamples((prev) => {
        const newSamples = [...prev, { x: wrist.x, y: wrist.y }];
        // Keep last 30 samples
        return newSamples.slice(-30);
      });
    },
    [isRecording]
  );

  const startRecording = () => {
    setSamples([]);
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  const captureRestPosition = () => {
    if (samples.length < 10) return;

    // Average the samples
    const avg = samples.reduce(
      (acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y }),
      { x: 0, y: 0 }
    );
    setRestPosition({
      x: avg.x / samples.length,
      y: avg.y / samples.length,
    });
    stopRecording();
    setStep('range');
  };

  const completeCalibration = () => {
    if (!restPosition) return;

    // Calculate movement range from samples
    const range = samples.reduce(
      (acc, s) => ({
        minX: Math.min(acc.minX, s.x),
        maxX: Math.max(acc.maxX, s.x),
        minY: Math.min(acc.minY, s.y),
        maxY: Math.max(acc.maxY, s.y),
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );

    // Save profile
    saveProfile({
      id: `profile_${Date.now()}`,
      name: 'My Profile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      restPosition,
      movementRange: range,
      gestures: [],
      accessibilityMode: 'standard',
      sensitivity: 1.0,
      soundPreset: 'default',
    });

    setStep('complete');
  };

  const goToPerformance = () => {
    setCurrentScreen('performance');
  };

  const renderIntro = () => (
    <div style={{ textAlign: 'center', maxWidth: '500px' }}>
      <h2 style={{ marginBottom: 'var(--space-lg)' }}>Calibration</h2>
      <p style={{ marginBottom: 'var(--space-xl)', lineHeight: 1.7 }}>
        Let's set up the instrument to work with your movements. This will only take a moment.
      </p>
      <p style={{ marginBottom: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
        First, we'll capture your rest position — where your hand naturally sits when you're not
        playing.
      </p>
      <button className="btn btn--large" onClick={() => setStep('rest')}>
        Begin Calibration
      </button>
    </div>
  );

  const renderRestCapture = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
      <h2>Step 1: Rest Position</h2>
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '400px' }}>
        Hold your right hand in a comfortable rest position. This is where you'll return when
        you're not making sound.
      </p>

      <WebcamView onPose={handlePose} trackedLandmark={LANDMARKS.RIGHT_WRIST} />

      {/* Progress bar */}
      {isRecording && (
        <div style={{ width: '100%', maxWidth: '640px' }}>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${(samples.length / 30) * 100}%` }}
            />
          </div>
          <p style={{ textAlign: 'center', marginTop: 'var(--space-sm)', color: 'var(--color-text-muted)' }}>
            Hold steady... ({samples.length}/30)
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        {!isRecording ? (
          <button className="btn btn--large" onClick={startRecording}>
            Capture Rest Position
          </button>
        ) : samples.length >= 30 ? (
          <button className="btn btn--large" onClick={captureRestPosition}>
            Confirm Position
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderRangeCapture = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
      <h2>Step 2: Movement Range</h2>
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '400px' }}>
        Move your hand around to show your comfortable range of motion. Move up, down, left,
        and right.
      </p>

      <WebcamView onPose={handlePose} trackedLandmark={LANDMARKS.RIGHT_WRIST} />

      {/* Progress indicator */}
      {isRecording && (
        <div style={{ width: '100%', maxWidth: '640px' }}>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${Math.min((samples.length / 60) * 100, 100)}%` }}
            />
          </div>
          <p style={{ textAlign: 'center', marginTop: 'var(--space-sm)', color: 'var(--color-text-muted)' }}>
            Keep moving... ({samples.length} samples)
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        {!isRecording ? (
          <button className="btn btn--large" onClick={startRecording}>
            Start Recording Range
          </button>
        ) : samples.length >= 30 ? (
          <button className="btn btn--large" onClick={completeCalibration}>
            Complete Calibration
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderComplete = () => (
    <div style={{ textAlign: 'center', maxWidth: '500px' }}>
      <h2 style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-success)' }}>
        Calibration Complete!
      </h2>
      <p style={{ marginBottom: 'var(--space-xl)', lineHeight: 1.7 }}>
        The instrument is now configured for your movements. You can recalibrate at any time
        from the settings.
      </p>
      <button className="btn btn--large" onClick={goToPerformance}>
        Start Playing
      </button>
    </div>
  );

  return (
    <div className="screen screen--centered">
      {step === 'intro' && renderIntro()}
      {step === 'rest' && renderRestCapture()}
      {step === 'range' && renderRangeCapture()}
      {step === 'complete' && renderComplete()}

      {/* Back button */}
      {step !== 'intro' && step !== 'complete' && (
        <button
          className="btn btn--secondary"
          onClick={() => setCurrentScreen('welcome')}
          style={{ position: 'absolute', top: 'var(--space-lg)', left: 'var(--space-lg)' }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export default CalibrationScreen;
