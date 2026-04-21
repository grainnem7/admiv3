/**
 * SetupWizard — Redesigned
 *
 * Elegant 3-step onboarding wizard with clear progress,
 * camera preview, input method cards, and sound selection.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { getTrackingManager } from '../../tracking/TrackingManager';
import { IconBody, IconHand, IconFace, IconCamera, IconCheck } from '../design-system/Icons';
import VolumeControl from '../components/VolumeControl';
import SoundPresetSelector from '../components/SoundPresetSelector';
import type { ActiveModalities } from '../../state/types';

type WizardStep = 1 | 2 | 3;

const STEP_LABELS = ['Camera', 'Input', 'Sound'];

function SetupWizard() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setMuted = useAppStore((s) => s.setMuted);
  const setActiveModalities = useAppStore((s) => s.setActiveModalities);
  const setHasCompletedSetup = useAppStore((s) => s.setHasCompletedSetup);
  const setExperienceLevel = useAppStore((s) => s.setExperienceLevel);

  const [step, setStep] = useState<WizardStep>(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [bodyDetected, setBodyDetected] = useState(false);
  const [selectedModalities, setSelectedModalities] = useState<ActiveModalities>({
    pose: true, leftHand: true, rightHand: true, face: false, color: false,
  });

  // Camera init
  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
          try {
            const tm = getTrackingManager();
            await tm.initialize();
            await tm.setActiveModalities({ pose: true, leftHand: false, rightHand: false, face: false, color: false });
            const unsub = tm.onFrame((frame) => { if (frame.pose) setBodyDetected(true); });
            tm.start(videoRef.current);
            setTimeout(() => { unsub(); tm.stop(); }, 10000);
          } catch { /* detection optional */ }
        }
      } catch (err) {
        if (!cancelled) setCameraError(err instanceof Error ? err.message : 'Camera access denied');
      }
    })();

    return () => { cancelled = true; if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [step]);

  const handleFinish = useCallback(async () => {
    await getAudioEngine().resume();
    setActiveModalities(selectedModalities);
    setMuted(false);
    setHasCompletedSetup(true);
    setExperienceLevel('beginner');
    setCurrentScreen('performance');
  }, [selectedModalities, setActiveModalities, setMuted, setHasCompletedSetup, setExperienceLevel, setCurrentScreen]);

  const toggleModality = (key: keyof ActiveModalities) => {
    setSelectedModalities(prev => {
      const next = { ...prev };
      if (key === 'leftHand' || key === 'rightHand') { next.leftHand = !prev.leftHand; next.rightHand = !prev.rightHand; }
      else { (next as Record<string, boolean>)[key] = !prev[key]; }
      return next;
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
      background: '#0c0c14',
      backgroundImage: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(249,115,22,0.06) 0%, transparent 70%)',
    }}>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 48, width: 280 }}>
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as WizardStep;
          const done = step > stepNum;
          const active = step === stepNum;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: done ? '#22c55e' : active ? '#f97316' : 'rgba(255,255,255,0.06)',
                  color: done || active ? '#fff' : '#4a4a5a',
                  boxShadow: active ? '0 0 12px rgba(249,115,22,0.3)' : 'none',
                  transition: 'all 200ms ease',
                }}>
                  {done ? <IconCheck size={12} /> : stepNum}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: active ? '#e4e4ef' : '#4a4a5a',
                }}>{label}</span>
              </div>
              {i < 2 && (
                <div style={{
                  flex: 1, height: 2, margin: '0 8px',
                  background: done ? '#22c55e' : 'rgba(255,255,255,0.06)',
                  borderRadius: 1, transition: 'background 200ms ease',
                  marginBottom: 20, // offset for label
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{ maxWidth: 480, width: '100%' }}>

        {/* Step 1: Camera */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e4e4ef', margin: 0 }}>Camera Check</h2>
            <p style={{ fontSize: 14, color: '#9898a8', textAlign: 'center', margin: 0 }}>
              We need your camera to track movements and turn them into music.
            </p>

            <div style={{
              width: '100%', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden',
              background: '#08080c', position: 'relative',
              border: `2px solid ${bodyDetected ? '#22c55e' : cameraReady ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
              transition: 'border-color 300ms ease',
              boxShadow: bodyDetected ? '0 0 20px rgba(34,197,94,0.15)' : '0 4px 16px rgba(0,0,0,0.3)',
            }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              {!cameraReady && !cameraError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#71718a', fontSize: 14 }}>Starting camera...</span>
                </div>
              )}
              {cameraError && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'rgba(0,0,0,0.8)', padding: 24,
                }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}><IconCamera size={32} /></span>
                  <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>Camera not available</p>
                  <p style={{ color: '#71718a', fontSize: 12, margin: 0, textAlign: 'center' }}>{cameraError}</p>
                </div>
              )}
            </div>

            <p style={{
              fontSize: 14, textAlign: 'center', margin: 0,
              color: bodyDetected ? '#22c55e' : '#9898a8',
              fontWeight: bodyDetected ? 600 : 400,
            }}>
              {bodyDetected ? 'We can see you!' : cameraReady ? 'Position yourself so your upper body is visible' : 'Waiting for camera...'}
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setCurrentScreen('welcome')} style={{
                height: 40, padding: '0 20px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#9898a8', fontSize: 14, cursor: 'pointer',
              }}>Back</button>
              <button onClick={() => setStep(2)} disabled={!cameraReady} style={{
                height: 40, padding: '0 28px', borderRadius: 8,
                background: '#f97316', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: cameraReady ? 1 : 0.4,
                boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
              }}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Input Methods */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e4e4ef', margin: 0 }}>Choose Your Input</h2>
            <p style={{ fontSize: 14, color: '#9898a8', textAlign: 'center', margin: 0 }}>
              Select how you want to control your instrument. You can change this anytime.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {([
                { key: 'pose' as const, icon: <IconBody size={32} />, title: 'Body Movement', desc: 'Arms, head, torso' },
                { key: 'leftHand' as const, icon: <IconHand size={32} />, title: 'Hand Gestures', desc: 'Pinch, point, grip' },
                { key: 'face' as const, icon: <IconFace size={32} />, title: 'Face Expressions', desc: 'Blink, brow, mouth' },
              ]).map(({ key, icon, title, desc }) => {
                const sel = selectedModalities[key];
                return (
                  <button key={key} onClick={() => toggleModality(key)} aria-pressed={sel} style={{
                    width: 140, padding: '20px 12px', borderRadius: 12,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    background: sel ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `2px solid ${sel ? '#f97316' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer', textAlign: 'center',
                    transition: 'all 150ms ease',
                    color: sel ? '#e4e4ef' : '#9898a8',
                  }}>
                    <span style={{ color: sel ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>{icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
                    <span style={{ fontSize: 12, color: '#71718a', lineHeight: 1.3 }}>{desc}</span>
                    {sel && <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600 }}>Selected</span>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(1)} style={{
                height: 40, padding: '0 20px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#9898a8', fontSize: 14, cursor: 'pointer',
              }}>← Back</button>
              <button onClick={() => setStep(3)} style={{
                height: 40, padding: '0 28px', borderRadius: 8,
                background: '#f97316', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
              }}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Sound */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e4e4ef', margin: 0 }}>Choose Your Sound</h2>
            <p style={{ fontSize: 14, color: '#9898a8', textAlign: 'center', margin: 0 }}>
              Pick a sound to start with. You can explore more sounds later.
            </p>

            <div style={{
              width: '100%', padding: 20, borderRadius: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <SoundPresetSelector />
              <div style={{ marginTop: 16 }}>
                <VolumeControl />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(2)} style={{
                height: 40, padding: '0 20px', borderRadius: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: '#9898a8', fontSize: 14, cursor: 'pointer',
              }}>← Back</button>
              <button onClick={handleFinish} style={{
                height: 48, padding: '0 36px', borderRadius: 10,
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(249,115,22,0.3), 0 2px 4px rgba(0,0,0,0.2)',
              }}>Start Playing</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
