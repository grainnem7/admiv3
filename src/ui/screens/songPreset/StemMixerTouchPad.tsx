import { useEffect } from 'react';
import { usePadState, type PadState } from './usePadState';
import { resolveStemMixerView } from './stemMixerView';
import type { SongConfig } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';

interface StemMixerTouchPadProps {
  song: SongConfig | null;
  status: SongPresetStatus | null;
  onChange: (state: PadState) => void;
}

export function StemMixerTouchPad({ song, status, onChange }: StemMixerTouchPadProps) {
  const { state, bind, reset } = usePadState();

  useEffect(() => { onChange(state); }, [state, onChange]);

  const zoneLabels = song?.stemMixer.zoneLabels ?? { left: 'Left', center: 'Center', right: 'Right' };
  const view = song && status ? resolveStemMixerView(song, status, state.held) : null;

  return (
    <div style={styles.wrap}>
      <div
        {...bind}
        style={{ ...styles.pad, touchAction: 'none' }}
        aria-label="Stem mixer touch pad"
        role="application"
      >
        <div style={{ ...styles.axisLabel, top: 8, left: 12 }}>Bright</div>
        <div style={{ ...styles.axisLabel, bottom: 8, left: 12 }}>Warm</div>
        <div style={{ ...styles.zoneStripe, left: '0%' }}>{zoneLabels.left}</div>
        <div style={{ ...styles.zoneStripe, left: '50%', transform: 'translateX(-50%)' }}>{zoneLabels.center}</div>
        <div style={{ ...styles.zoneStripe, right: '0%' }}>{zoneLabels.right}</div>

        <div style={{ ...styles.divider, left: '33.33%' }} />
        <div style={{ ...styles.divider, left: '66.66%' }} />

        <div
          style={{
            ...styles.puck,
            left: `${state.x * 100}%`,
            top: `${state.y * 100}%`,
            opacity: state.held ? 1 : 0.4,
          }}
        >
          <div style={styles.puckDot} />
        </div>

        {view && (
          <div style={styles.filterReadout}>
            Filter {Math.round(view.filterPercent)}%
          </div>
        )}
      </div>

      <button onClick={reset} style={styles.resetBtn} aria-label="Reset mixer to default">
        Reset
      </button>
    </div>
  );
}

const PUCK_SIZE = 48;

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    display: 'flex',
    gap: 12,
    padding: 12,
    minHeight: 0,
  },
  pad: {
    flex: 1,
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.02))',
    border: '1px solid rgba(59,130,246,0.4)',
    borderRadius: 12,
    overflow: 'hidden',
    userSelect: 'none',
    minHeight: 240,
  },
  axisLabel: {
    position: 'absolute',
    fontSize: 11,
    color: '#a1a1b8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    pointerEvents: 'none',
  },
  zoneStripe: {
    position: 'absolute',
    bottom: 8,
    fontSize: 12,
    fontWeight: 600,
    color: '#a1a1b8',
    pointerEvents: 'none',
    padding: '0 8px',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    background: 'rgba(255,255,255,0.06)',
    pointerEvents: 'none',
  },
  puck: {
    position: 'absolute',
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    marginLeft: -PUCK_SIZE / 2,
    marginTop: -PUCK_SIZE / 2,
    borderRadius: '50%',
    border: '3px solid #3b82f6',
    background: 'rgba(59,130,246,0.18)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 150ms',
  },
  puckDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#3b82f6',
  },
  filterReadout: {
    position: 'absolute',
    top: 8,
    right: 12,
    fontSize: 11,
    color: '#3b82f6',
    fontFamily: 'monospace',
    pointerEvents: 'none',
  },
  resetBtn: {
    width: 80,
    minHeight: 44,
    background: 'rgba(255,255,255,0.05)',
    color: '#a1a1b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'center',
  },
};
