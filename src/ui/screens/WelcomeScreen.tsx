/**
 * Welcome Screen
 *
 * Landing page for ADMIv3. The Board Sequencer is the main instrument, so it
 * leads: one large button straight into setting up (or playing) the board.
 * The body-movement instrument stays reachable under "Other ways to play".
 * Uses SVG icons, design tokens, no emoji.
 */

import { useEffect, useState } from 'react';
import { useAppStore, useHasCompletedSetup } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { loadActiveBoardConfig } from '../../profiles/BoardProfiles';
import { requestSetupOnOpen } from './boardSequencer/boardSetupFlow';
import {
  IconSequencer, IconCamera, IconMusic, IconArrowRight, IconInfo, IconCalibrate, IconBody,
} from '../design-system/Icons';

type CameraStatus = 'checking' | 'available' | 'unavailable';

function WelcomeScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const setMuted = useAppStore((s) => s.setMuted);
  const hasCompletedSetup = useHasCompletedSetup();
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('checking');
  // A saved board means the main button plays it; otherwise it starts setting one up.
  const [hasBoard] = useState(() => loadActiveBoardConfig() !== null);

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

  const openBoardSetup = () => {
    requestSetupOnOpen();
    setCurrentScreen('boardSequencer');
  };

  return (
    <div className="welcome-screen" role="main">
      {/* Logo */}
      <div className="welcome-hero">
        <div className="welcome-logo">A</div>
        <h1 className="welcome-title">ADMIv3</h1>
        <p className="welcome-subtitle">
          Make music by placing counters on a board
        </p>
      </div>

      {/* How the board works — three pillars with SVG icons */}
      <div className="welcome-pillars">
        <Pillar icon={<IconSequencer size={28} />} title="Place" desc="Put coloured counters on the board" />
        <span className="welcome-pillars__arrow"><IconArrowRight size={18} /></span>
        <Pillar icon={<IconCamera size={28} />} title="See" desc="The camera finds each counter" />
        <span className="welcome-pillars__arrow"><IconArrowRight size={18} /></span>
        <Pillar icon={<IconMusic size={28} />} title="Play" desc="Each colour plays its own sound" />
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
          {cameraStatus === 'unavailable' && 'No camera detected (the laptop board still works)'}
        </span>
      </div>

      {/* Main action: the board. Its name keeps "Board Sequencer" for the e2e tests. */}
      <div className="welcome-actions">
        <button
          className="btn btn--primary btn--lg welcome-board-btn"
          onClick={() => setCurrentScreen('boardSequencer')}
        >
          <span className="welcome-board-btn__label">{hasBoard ? 'Play my board' : 'Set up the board'}</span>
          <span className="welcome-board-btn__sub">Board Sequencer</span>
        </button>
        {hasBoard && (
          <button className="btn btn--ghost" onClick={openBoardSetup}>
            <IconCalibrate size={16} /> Set up the board again
          </button>
        )}
        <button
          className="btn btn--ghost"
          onClick={() => setCurrentScreen('info')}
        >
          <IconInfo size={16} /> How It Works
        </button>
      </div>

      {/* The body-movement instrument */}
      <section className="welcome-other" aria-labelledby="welcome-other-title">
        <h2 id="welcome-other-title" className="welcome-other__title">Other ways to play</h2>
        <div className="welcome-other__actions">
          {hasCompletedSetup ? (
            <>
              <button
                className="btn btn--ghost btn--sm"
                onClick={handleQuickStart}
                disabled={cameraStatus === 'unavailable'}
              >
                <IconBody size={16} /> Play with body movement
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setCurrentScreen('calibration')}
              >
                Recalibrate
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setCurrentScreen('setup')}
              >
                Change Setup
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setCurrentScreen('setup')}
                disabled={cameraStatus === 'unavailable'}
              >
                <IconBody size={16} /> Set up body movement
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={handleQuickStart}
                disabled={cameraStatus === 'unavailable'}
              >
                Quick Start
              </button>
            </>
          )}
        </div>
      </section>

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
