/**
 * Calibration Screen - Accessible calibration workflow.
 *
 * Key accessibility improvements:
 * - Body part selector (not just right wrist)
 * - Skip option on every step
 * - Reduced thresholds (15 samples, 1 target minimum)
 * - Clear explanatory text
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../../state/store';
import WebcamView from '../components/WebcamView';
import CalibrationTargetOverlay from '../components/calibration/CalibrationTargetOverlay';
import type { PoseLandmarks } from '../../state/types';
import { LANDMARKS } from '../../utils/constants';
import { IconChevronLeft, IconChevronRight, IconCheck, IconRefresh } from '../design-system/Icons';

type CalibrationStep = 'setup' | 'rest' | 'range' | 'validate' | 'complete';
const VISIBLE_STEPS: CalibrationStep[] = ['rest', 'range', 'validate'];

const REST_SAMPLES = 15;
const TARGET_THRESHOLD = 0.18;
const MIN_TARGETS_TO_ADVANCE = 1;

/** Body parts available for calibration tracking */
const TRACKABLE_PARTS = [
  { id: LANDMARKS.RIGHT_WRIST, label: 'Right hand' },
  { id: LANDMARKS.LEFT_WRIST, label: 'Left hand' },
  { id: LANDMARKS.NOSE, label: 'Head (nose)' },
  { id: LANDMARKS.RIGHT_INDEX, label: 'Right finger' },
  { id: LANDMARKS.LEFT_INDEX, label: 'Left finger' },
] as const;

function CalibrationScreen() {
  const [step, setStep] = useState<CalibrationStep>('setup');
  const [trackedLandmark, setTrackedLandmark] = useState<number>(LANDMARKS.RIGHT_WRIST);
  const [trackedLabel, setTrackedLabel] = useState('Right hand');
  const [restPosition, setRestPosition] = useState<{ x: number; y: number } | null>(null);
  const [samples, setSamples] = useState<{ x: number; y: number }[]>([]);
  const [heatPoints, setHeatPoints] = useState<{ x: number; y: number }[]>([]);
  const [handDetected, setHandDetected] = useState(false);
  const [noHandTimer, setNoHandTimer] = useState(0);

  const [targets, setTargets] = useState({
    top: { progress: 0, reached: false },
    bottom: { progress: 0, reached: false },
    left: { progress: 0, reached: false },
    right: { progress: 0, reached: false },
  });
  const rangeRef = useRef({ minX: 1, maxX: 0, minY: 1, maxY: 0 });

  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const saveProfile = useAppStore((s) => s.saveProfile);

  useEffect(() => {
    if (step === 'rest' && !handDetected) {
      const timer = setInterval(() => setNoHandTimer(prev => prev + 1), 1000);
      return () => clearInterval(timer);
    } else {
      setNoHandTimer(0);
    }
  }, [step, handDetected]);

  const handlePose = useCallback(
    (landmarks: PoseLandmarks | null) => {
      if (!landmarks) { setHandDetected(false); return; }

      const lm = landmarks.landmarks[trackedLandmark];
      if (!lm || (lm.visibility ?? 0) < 0.4) { setHandDetected(false); return; }

      setHandDetected(true);
      const point = { x: lm.x, y: lm.y };

      if (step === 'rest') {
        setSamples(prev => {
          const next = [...prev, point].slice(-REST_SAMPLES);
          if (next.length >= REST_SAMPLES) {
            const avg = next.reduce((acc, s) => ({ x: acc.x + s.x, y: acc.y + s.y }), { x: 0, y: 0 });
            setRestPosition({ x: avg.x / next.length, y: avg.y / next.length });
            setTimeout(() => setStep('range'), 500);
          }
          return next;
        });
      }

      if (step === 'range') {
        setSamples(prev => [...prev, point]);
        setHeatPoints(prev => [...prev.slice(-200), point]);
        rangeRef.current = {
          minX: Math.min(rangeRef.current.minX, point.x),
          maxX: Math.max(rangeRef.current.maxX, point.x),
          minY: Math.min(rangeRef.current.minY, point.y),
          maxY: Math.max(rangeRef.current.maxY, point.y),
        };
        setTargets(prev => ({
          top: { progress: Math.min(1, 1 - point.y / TARGET_THRESHOLD), reached: prev.top.reached || point.y < TARGET_THRESHOLD },
          bottom: { progress: Math.min(1, (point.y - (1 - TARGET_THRESHOLD)) / TARGET_THRESHOLD), reached: prev.bottom.reached || point.y > 1 - TARGET_THRESHOLD },
          left: { progress: Math.min(1, 1 - point.x / TARGET_THRESHOLD), reached: prev.left.reached || point.x < TARGET_THRESHOLD },
          right: { progress: Math.min(1, (point.x - (1 - TARGET_THRESHOLD)) / TARGET_THRESHOLD), reached: prev.right.reached || point.x > 1 - TARGET_THRESHOLD },
        }));
      }
    },
    [step, trackedLandmark]
  );

  const reachedCount = Object.values(targets).filter(t => t.reached).length;

  const handleSkipCalibration = () => {
    saveProfile({
      id: `profile_${Date.now()}`,
      name: 'Default Profile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      restPosition: { x: 0.5, y: 0.5 },
      movementRange: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      gestures: [],
      accessibilityMode: 'standard',
      sensitivity: 1.0,
      soundPreset: 'default',
    });
    setCurrentScreen('performance');
  };

  const handleConfirmCalibration = () => {
    saveProfile({
      id: `profile_${Date.now()}`,
      name: 'My Profile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      restPosition: restPosition || { x: 0.5, y: 0.5 },
      movementRange: rangeRef.current.maxX > rangeRef.current.minX
        ? rangeRef.current
        : { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      gestures: [],
      accessibilityMode: 'standard',
      sensitivity: 1.0,
      soundPreset: 'default',
    });
    setStep('complete');
  };

  const handleRedo = () => {
    setSamples([]);
    setHeatPoints([]);
    setRestPosition(null);
    setHandDetected(false);
    rangeRef.current = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
    setTargets({ top: { progress: 0, reached: false }, bottom: { progress: 0, reached: false }, left: { progress: 0, reached: false }, right: { progress: 0, reached: false } });
    setStep('setup');
  };

  const stepIndex = VISIBLE_STEPS.indexOf(step);

  return (
    <div className="screen screen--centered" role="main">
      <div style={{ maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>

        {/* Step indicator (only for visible steps) */}
        {step !== 'setup' && step !== 'complete' && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            {VISIBLE_STEPS.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
                  backgroundColor: step === s ? 'var(--color-primary)' : stepIndex > i ? 'var(--color-success)' : 'var(--color-bg-overlay)',
                  color: step === s || stepIndex > i ? 'var(--color-text-inverse)' : 'var(--color-text-tertiary)',
                }}>
                  {stepIndex > i ? <IconCheck size={14} /> : i + 1}
                </div>
                <span style={{ fontSize: 'var(--text-sm)', color: step === s ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
                  {s === 'rest' ? 'Rest' : s === 'range' ? 'Range' : 'Preview'}
                </span>
                {i < 2 && <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Setup — Choose body part */}
        {step === 'setup' && (
          <>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Calibrate Your Instrument</h2>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 420, lineHeight: 'var(--leading-relaxed)' }}>
              Calibration helps the instrument match your comfortable movement range.
              This is optional — you can skip it and calibrate later.
            </p>

            <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>
                Which body part will you use to play?
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {TRACKABLE_PARTS.map(part => (
                  <button
                    key={part.id}
                    onClick={() => { setTrackedLandmark(part.id); setTrackedLabel(part.label); }}
                    aria-pressed={trackedLandmark === part.id}
                    className={`btn ${trackedLandmark === part.id ? 'btn--active' : ''}`}
                    style={{ justifyContent: 'flex-start', minHeight: 44 }}
                  >
                    {trackedLandmark === part.id && <IconCheck size={14} />}
                    {part.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn--ghost" onClick={() => setCurrentScreen('welcome')}>
                <IconChevronLeft size={16} /> Back
              </button>
              <button className="btn btn--primary" onClick={() => setStep('rest')}>
                Start Calibration <IconChevronRight size={16} />
              </button>
            </div>
            <button className="btn btn--ghost" onClick={handleSkipCalibration} style={{ fontSize: 'var(--text-sm)' }}>
              Skip — use default range
            </button>
          </>
        )}

        {/* Step 1: Rest Position */}
        {step === 'rest' && (
          <>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Rest Position</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Hold your {trackedLabel.toLowerCase()} still in a comfortable resting position.
            </p>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
              <WebcamView onPose={handlePose} trackedLandmark={trackedLandmark} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 80, height: 80, borderRadius: '50%',
                border: `3px solid ${handDetected ? 'var(--color-success)' : 'var(--color-primary)'}`,
                opacity: 0.6, animation: handDetected ? 'none' : 'pulse 2s ease-in-out infinite',
                pointerEvents: 'none', zIndex: 10,
              }} />
            </div>

            <div style={{ width: '100%' }}>
              <div className="progress-bar" style={{ height: 6 }}>
                <div className="progress-bar__fill" style={{
                  width: `${(samples.length / REST_SAMPLES) * 100}%`,
                  backgroundColor: handDetected ? 'var(--color-success)' : 'var(--color-primary)',
                }} />
              </div>
            </div>

            <p style={{ fontSize: 'var(--text-sm)', color: handDetected ? 'var(--color-success)' : 'var(--color-text-secondary)', textAlign: 'center' }}>
              {handDetected
                ? `Detected! Hold still... (${samples.length}/${REST_SAMPLES})`
                : noHandTimer >= 5
                ? `We can't see your ${trackedLabel.toLowerCase()}. Try moving into better light.`
                : `Position your ${trackedLabel.toLowerCase()} where the camera can see it.`}
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn--ghost" onClick={() => setStep('setup')}>
                <IconChevronLeft size={16} /> Back
              </button>
              <button className="btn btn--ghost" onClick={handleSkipCalibration} style={{ fontSize: 'var(--text-sm)' }}>
                Skip calibration
              </button>
            </div>
          </>
        )}

        {/* Step 2: Movement Range */}
        {step === 'range' && (
          <>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Movement Range</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Move your {trackedLabel.toLowerCase()} to reach the targets. Move as far as is comfortable.
            </p>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
              <WebcamView onPose={handlePose} trackedLandmark={trackedLandmark} />
              <CalibrationTargetOverlay targets={targets} heatPoints={heatPoints} />
            </div>

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Targets reached: {reachedCount}/4
              {reachedCount >= 3 && ' — Great range!'}
              {reachedCount >= 1 && reachedCount < 3 && ' — That works!'}
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn--ghost" onClick={handleRedo}>
                <IconRefresh size={16} /> Start Over
              </button>
              <button
                className="btn btn--primary"
                onClick={() => setStep('validate')}
                disabled={reachedCount < MIN_TARGETS_TO_ADVANCE}
              >
                {reachedCount >= 3 ? 'Next' : 'This is my full range'} <IconChevronRight size={16} />
              </button>
            </div>
            <button className="btn btn--ghost" onClick={handleSkipCalibration} style={{ fontSize: 'var(--text-sm)' }}>
              Skip — use default range
            </button>
          </>
        )}

        {/* Step 3: Validation */}
        {step === 'validate' && (
          <>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Preview Your Range</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              Move your {trackedLabel.toLowerCase()} around. Does the full range feel right?
            </p>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
              <WebcamView onPose={handlePose} trackedLandmark={trackedLandmark} />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn--ghost" onClick={handleRedo}>
                <IconRefresh size={16} /> Redo
              </button>
              <button className="btn btn--primary" onClick={handleConfirmCalibration}>
                <IconCheck size={16} /> Looks Good
              </button>
            </div>
          </>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: 'var(--color-success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)',
            }}>
              <IconCheck size={32} />
            </div>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-2)' }}>Calibration Complete</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
              Your instrument is calibrated for your {trackedLabel.toLowerCase()}.
              You can recalibrate anytime from the toolbar.
            </p>
            <button className="btn btn--primary btn--lg" onClick={() => setCurrentScreen('performance')}>
              Start Playing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CalibrationScreen;
