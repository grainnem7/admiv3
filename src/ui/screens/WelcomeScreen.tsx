/**
 * Welcome Screen
 *
 * Professional landing page for ADMIv3.
 * Uses SVG icons, design tokens, no emoji.
 */

import { useEffect, useState } from 'react';
import { useAppStore, useHasCompletedSetup } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import {
  IconBody, IconCamera, IconMusic, IconArrowRight, IconInfo, IconCalibrate,
} from '../design-system/Icons';

type CameraStatus = 'checking' | 'available' | 'unavailable';

function WelcomeScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setMuted = useAppStore((s) => s.setMuted);
  const hasCompletedSetup = useHasCompletedSetup();
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameraStatus(devices.some((d) => d.kind === 'videoinput') ? 'available' : 'unavailable');
      } catch {
        if (!cancelled) setCameraStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleQuickStart = async () => {
    const audioEngine = getAudioEngine();
    await audioEngine.resume();
    setMuted(false);
    setCurrentScreen('performance');
  };

  return (
    <div className="welcome-screen" role="main">
      {/* Logo */}
      <div className="welcome-hero">
        <div className="welcome-logo">A</div>
        <h1 className="welcome-title">ADMIv3</h1>
        <p className="welcome-subtitle">
          Make music with your body movements
        </p>
      </div>

      {/* How it works — three pillars with SVG icons */}
      <div className="welcome-pillars">
        <Pillar icon={<IconBody size={28} />} title="Move" desc="Your body becomes the instrument" />
        <span className="welcome-pillars__arrow"><IconArrowRight size={18} /></span>
        <Pillar icon={<IconCamera size={28} />} title="Track" desc="Camera reads your movements" />
        <span className="welcome-pillars__arrow"><IconArrowRight size={18} /></span>
        <Pillar icon={<IconMusic size={28} />} title="Play" desc="Every gesture becomes sound" />
      </div>

      {/* Camera status */}
      <div className="welcome-camera-status">
        <span
          className="welcome-camera-dot"
          style={{
            backgroundColor: cameraStatus === 'available'
              ? 'var(--color-success)'
              : cameraStatus === 'unavailable'
              ? 'var(--color-error)'
              : 'var(--color-text-tertiary)',
          }}
        />
        <span>
          {cameraStatus === 'checking' && 'Checking camera...'}
          {cameraStatus === 'available' && 'Camera ready'}
          {cameraStatus === 'unavailable' && 'No camera detected'}
        </span>
      </div>

      {/* Actions */}
      <div className="welcome-actions">
        {hasCompletedSetup ? (
          <>
            <button
              className="btn btn--primary btn--lg"
              onClick={handleQuickStart}
              disabled={cameraStatus === 'unavailable'}
            >
              Start Playing
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setCurrentScreen('calibration')}
            >
              <IconCalibrate size={16} /> Recalibrate
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setCurrentScreen('setup')}
            >
              Change Setup
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn--primary btn--lg"
              onClick={() => setCurrentScreen('setup')}
              disabled={cameraStatus === 'unavailable'}
            >
              Set Up My Instrument
            </button>
            <button
              className="btn btn--ghost"
              onClick={handleQuickStart}
              disabled={cameraStatus === 'unavailable'}
            >
              Quick Start
            </button>
          </>
        )}
        <button
          className="btn btn--ghost"
          onClick={() => setCurrentScreen('boardSequencer')}
        >
          <IconMusic size={16} /> Board Sequencer
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => setCurrentScreen('info')}
        >
          <IconInfo size={16} /> How It Works
        </button>
      </div>

      {/* Footer hints */}
      <footer className="welcome-footer">
        <span><kbd>Space</kbd> Mute</span>
        <span><kbd>D</kbd> Debug</span>
      </footer>
    </div>
  );
}

function Pillar({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="welcome__pillar">
      <div className="welcome__pillar-icon">{icon}</div>
      <span className="welcome__pillar-title">{title}</span>
      <span className="welcome__pillar-desc">{desc}</span>
    </div>
  );
}

export default WelcomeScreen;
