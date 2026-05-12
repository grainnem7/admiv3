import { resolveStemMixerView } from './stemMixerView';
import type { SongConfig } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';

interface StemMixerStripProps {
  song: SongConfig | null;
  status: SongPresetStatus | null;
  active: boolean;
}

export function StemMixerStrip({ song, status, active }: StemMixerStripProps) {
  if (!song || !status) return null;
  const view = resolveStemMixerView(song, status, active);

  return (
    <div
      style={{
        ...styles.strip,
        opacity: view.dimmed ? 0.5 : 1,
        transition: 'opacity 200ms',
      }}
      aria-label="Stem mixer state"
    >
      <div style={styles.zoneBlock}>
        <div style={styles.zoneLabelKicker}>Zone</div>
        <div style={styles.zoneLabel}>{view.zoneLabel}</div>
      </div>

      <div style={styles.barsBlock}>
        {view.stems.map((stem) => (
          <div key={stem.id} style={styles.barRow}>
            <span style={styles.barLabel}>{stem.label}</span>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${Math.round(stem.level * 100)}%`,
                }}
              />
            </div>
            <span style={styles.barValue}>{Math.round(stem.level * 100)}%</span>
          </div>
        ))}
      </div>

      <div style={styles.filterBlock} aria-label="Filter brightness">
        <div style={styles.filterEnds}>
          <span>Bright</span>
        </div>
        <div style={styles.filterTrack}>
          <div
            style={{
              ...styles.filterFill,
              height: `${view.filterPercent}%`,
            }}
          />
        </div>
        <div style={styles.filterEnds}>
          <span>Warm</span>
        </div>
        <div style={styles.filterPctReadout}>{Math.round(view.filterPercent)}%</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 16,
    padding: '8px 12px',
    background: 'rgba(8,8,18,0.78)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: '#e2e2e8',
    fontFamily: 'system-ui, sans-serif',
    minHeight: 64,
  },
  zoneBlock: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 160,
    paddingRight: 12,
    borderRight: '1px solid rgba(255,255,255,0.08)',
  },
  zoneLabelKicker: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#71718a',
  },
  zoneLabel: {
    fontSize: 18,
    fontWeight: 700,
    color: '#3b82f6',
  },
  barsBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 3,
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 56,
    fontSize: 11,
    color: '#a1a1b8',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 8,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#3b82f6',
    transition: 'width 100ms linear',
  },
  barValue: {
    width: 36,
    fontSize: 10,
    color: '#71718a',
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  filterBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 60,
    paddingLeft: 12,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    fontSize: 9,
    color: '#71718a',
  },
  filterEnds: {
    height: 12,
  },
  filterTrack: {
    flex: 1,
    width: 6,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    margin: '2px 0',
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-end',
  },
  filterFill: {
    width: '100%',
    background: '#3b82f6',
    borderRadius: 3,
    transition: 'height 100ms linear',
  },
  filterPctReadout: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#71718a',
    marginTop: 2,
  },
};
