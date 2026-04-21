/**
 * GuidedOverlay — Redesigned
 *
 * First-visit tutorial with polished glass-morphism cards.
 */

import { useState, type ReactNode } from 'react';
import { useAppStore, useHasCompletedSetup, useHasCompletedTutorial } from '../../../state/store';
import { IconCamera, IconVolumeMute, IconSliders } from '../../design-system/Icons';

const STEPS: readonly { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <IconCamera size={36} />,
    title: 'This is your stage',
    description: 'Move your body in front of the camera. Every gesture creates sound — wave your hands, tilt your head, make it your own.',
  },
  {
    icon: <IconVolumeMute size={36} />,
    title: 'Mute & Unmute',
    description: 'Press Space or tap the round button in the bottom-right corner to toggle sound on and off.',
  },
  {
    icon: <IconSliders size={36} />,
    title: 'Customize Your Instrument',
    description: 'The sidebar on the left lets you change sounds, add effects, configure gestures, and fine-tune your instrument.',
  },
];

export default function GuidedOverlay() {
  const hasCompletedSetup = useHasCompletedSetup();
  const hasCompletedTutorial = useHasCompletedTutorial();
  const setHasCompletedTutorial = useAppStore((s) => s.setHasCompletedTutorial);
  const [currentStep, setCurrentStep] = useState(0);

  if (!hasCompletedSetup || hasCompletedTutorial) return null;

  const step = STEPS[currentStep];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
    else setHasCompletedTutorial(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(6px)',
    }} role="dialog" aria-label="Welcome tutorial" aria-modal="true">
      <div style={{
        maxWidth: 400, width: '90%', padding: '36px 32px',
        background: 'rgba(18,18,26,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        boxShadow: '0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        textAlign: 'center',
      }}>
        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === currentStep ? 20 : 6, height: 6, borderRadius: 3,
              background: i === currentStep ? '#f97316' : i < currentStep ? '#22c55e' : 'rgba(255,255,255,0.1)',
              transition: 'all 200ms ease',
            }} />
          ))}
        </div>

        <span style={{ color: 'var(--color-primary)' }}>{step.icon}</span>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e4e4ef', margin: 0 }}>
          {step.title}
        </h2>

        <p style={{
          fontSize: 14, color: '#9898a8', margin: 0,
          lineHeight: 1.6, maxWidth: 320,
        }}>
          {step.description}
        </p>

        <button onClick={handleNext} style={{
          height: 44, padding: '0 32px', borderRadius: 10,
          background: '#f97316', border: 'none',
          color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(249,115,22,0.3)',
          transition: 'transform 150ms ease',
          marginTop: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
        >
          {currentStep < STEPS.length - 1 ? 'Next →' : 'Got it, let me play!'}
        </button>

        <button onClick={() => setHasCompletedTutorial(true)} style={{
          background: 'none', border: 'none', color: '#4a4a5a',
          fontSize: 12, cursor: 'pointer', padding: 4,
        }}>
          Skip tutorial
        </button>
      </div>
    </div>
  );
}
