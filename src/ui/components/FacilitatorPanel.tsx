/**
 * Facilitator Panel - Controls for performance management
 *
 * Provides controls for the facilitator running the "Between Us" performance:
 * - Sound parameters (fade time, reverb, delay)
 * - Layer management
 * - Performance monitoring
 */

import type { PresenceState, SoundLayer } from '../../performance';
import { midiToNoteName } from '../../utils/math';

interface PerformanceConfig {
  sustainDuration: number;
  fadeTime: number;
  autoFadeDelay: number;
  reverbMix: number;
  delayMix: number;
  masterVolume: number;
  noteRange: { min: number; max: number };
}

interface FacilitatorPanelProps {
  config: PerformanceConfig;
  onConfigChange: (updates: Partial<PerformanceConfig>) => void;
  presenceState: PresenceState | null;
  layers: SoundLayer[];
  onClearLayers: () => void;
  onStopAll: () => void;
  onClose: () => void;
}

function FacilitatorPanel({
  config,
  onConfigChange,
  presenceState,
  layers,
  onClearLayers,
  onStopAll,
  onClose,
}: FacilitatorPanelProps) {
  return (
    <div
      className="facilitator-panel"
      style={{
        position: 'fixed',
        top: 60,
        right: 20,
        width: 350,
        maxHeight: 'calc(100vh - 120px)',
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        borderRadius: 'var(--border-radius)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 200,
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-md)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'sticky',
          top: 0,
          backgroundColor: 'rgba(20, 20, 30, 0.98)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>
          Facilitator Controls
        </h2>
        <button
          className="btn btn--secondary btn--sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          Close
        </button>
      </div>

      <div style={{ padding: 'var(--space-md)' }}>
        {/* Status Section */}
        <Section title="Status">
          <StatusItem
            label="Presence"
            value={presenceState?.isPresent ? 'Active' : 'None'}
            color={presenceState?.isPresent ? '#00ff88' : '#666'}
          />
          <StatusItem
            label="Active Layers"
            value={layers.length.toString()}
            color={layers.length > 0 ? '#00d4ff' : '#666'}
          />
          {presenceState?.isPresent && (
            <>
              <StatusItem
                label="Current Note"
                value={midiToNoteName(presenceState.musicalParams.midiNote)}
                color="#ffaa00"
              />
              <StatusItem
                label="Activity"
                value={`${(presenceState.activityLevel * 100).toFixed(0)}%`}
                color="#ff6b6b"
              />
              <StatusItem
                label="Duration"
                value={`${(presenceState.presenceDuration / 1000).toFixed(1)}s`}
                color="#95a5a6"
              />
            </>
          )}
        </Section>

        {/* Sound Controls */}
        <Section title="Sound">
          <Slider
            label="Master Volume"
            value={config.masterVolume}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onConfigChange({ masterVolume: v })}
          />
          <Slider
            label="Reverb Mix"
            value={config.reverbMix}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onConfigChange({ reverbMix: v })}
          />
          <Slider
            label="Delay Mix"
            value={config.delayMix}
            min={0}
            max={0.8}
            step={0.05}
            onChange={(v) => onConfigChange({ delayMix: v })}
          />
        </Section>

        {/* Layer Controls */}
        <Section title="Layers">
          <Slider
            label="Fade Time (s)"
            value={config.fadeTime}
            min={1}
            max={30}
            step={1}
            onChange={(v) => onConfigChange({ fadeTime: v })}
          />
          <Slider
            label="Auto-Fade Delay (s)"
            value={config.autoFadeDelay}
            min={1}
            max={20}
            step={0.5}
            onChange={(v) => onConfigChange({ autoFadeDelay: v })}
          />

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-md)',
            }}
          >
            <button
              className="btn btn--secondary btn--sm"
              onClick={onClearLayers}
              style={{ flex: 1 }}
            >
              Fade All
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={onStopAll}
              style={{ flex: 1, backgroundColor: '#ff4444' }}
            >
              Stop All
            </button>
          </div>
        </Section>

        {/* Pitch Range */}
        <Section title="Pitch Range">
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Low: {midiToNoteName(config.noteRange.min)}
              </label>
              <input
                type="range"
                min={24}
                max={config.noteRange.max - 12}
                value={config.noteRange.min}
                onChange={(e) =>
                  onConfigChange({
                    noteRange: {
                      ...config.noteRange,
                      min: parseInt(e.target.value),
                    },
                  })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                High: {midiToNoteName(config.noteRange.max)}
              </label>
              <input
                type="range"
                min={config.noteRange.min + 12}
                max={108}
                value={config.noteRange.max}
                onChange={(e) =>
                  onConfigChange({
                    noteRange: {
                      ...config.noteRange,
                      max: parseInt(e.target.value),
                    },
                  })
                }
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </Section>

        {/* Active Layers List */}
        {layers.length > 0 && (
          <Section title="Active Layers">
            <div
              style={{
                maxHeight: 150,
                overflow: 'auto',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: 'var(--space-xs)',
                    backgroundColor: layer.isFading
                      ? 'rgba(255, 100, 100, 0.1)'
                      : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 0,
                    marginBottom: 4,
                  }}
                >
                  <span>
                    {midiToNoteName(
                      Math.round(
                        69 + 12 * Math.log2(layer.frequency / 440)
                      )
                    )}
                  </span>
                  <span>{layer.frequency.toFixed(1)} Hz</span>
                  <span>{(layer.currentGain * 100).toFixed(0)}%</span>
                  <span style={{ opacity: 0.5 }}>
                    {layer.isFading ? 'fading' : 'active'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Performance Notes */}
        <Section title="Quick Reference">
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              lineHeight: 1.6,
            }}
          >
            <p>
              <strong>Gestures activate sound</strong> - participants create
              layers through movement
            </p>
            <p>
              <strong>Layers accumulate and fade</strong> - past interactions
              remain audible
            </p>
            <p>
              <strong>Musicians respond</strong> - listen and integrate through
              improvisation
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

// Helper Components

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <h3
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-sm)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: 'var(--space-xs) 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-xs)',
        }}
      >
        <label
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-secondary)',
          }}
        >
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

export default FacilitatorPanel;
