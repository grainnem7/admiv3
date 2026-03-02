/**
 * Status Indicators
 *
 * Status chips, meters, and monitoring components.
 */

import { type ReactNode } from 'react';

/* ============================================
   STATUS BADGE
   ============================================ */

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ children, variant = 'default', dot = false }: BadgeProps) {
  return (
    <span className={`badge badge--${variant}`}>
      {dot && <span className={`status-dot status-dot--${variant === 'success' ? 'active' : variant === 'warning' ? 'warning' : variant === 'error' ? 'error' : ''}`} />}
      {children}
    </span>
  );
}

/* ============================================
   STATUS DOT
   ============================================ */

type DotStatus = 'inactive' | 'active' | 'warning' | 'error';

interface StatusDotProps {
  status: DotStatus;
  label?: string;
}

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span className={`status-dot ${status !== 'inactive' ? `status-dot--${status}` : ''}`} />
      {label && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{label}</span>}
    </span>
  );
}

/* ============================================
   METER / LEVEL INDICATOR
   ============================================ */

interface MeterProps {
  value: number; // 0-100
  showValue?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'gradient' | 'simple';
}

export function Meter({
  value,
  showValue = false,
  label,
  size = 'md',
  variant = 'gradient',
}: MeterProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {label && (
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}>
              {label}
            </span>
          )}
          {showValue && (
            <span style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-family-mono)',
              color: 'var(--color-text-secondary)',
            }}>
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      )}
      <div className={`meter ${size === 'lg' ? 'meter--lg' : ''} ${variant === 'simple' ? 'meter--simple' : ''}`}>
        <div
          className="meter__fill"
          style={{ width: `${clampedValue}%` }}
          role="meter"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/* ============================================
   SEGMENTED METER (Audio-style)
   ============================================ */

interface SegmentedMeterProps {
  value: number; // 0-100
  segments?: number;
  label?: string;
  showPeak?: boolean;
  peakValue?: number;
}

export function SegmentedMeter({
  value,
  segments = 12,
  label,
  showPeak = false,
  peakValue,
}: SegmentedMeterProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const activeSegments = Math.ceil((clampedValue / 100) * segments);

  // Determine segment colors based on position
  const getSegmentClass = (index: number) => {
    const position = (index + 1) / segments;
    if (position <= 0.6) return 'meter__segment--low';
    if (position <= 0.85) return 'meter__segment--mid';
    if (position <= 0.95) return 'meter__segment--high';
    return 'meter__segment--peak';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && (
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}>
          {label}
        </span>
      )}
      <div className="meter meter--segmented" style={{ height: 'var(--meter-height-lg)' }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`meter__segment ${i < activeSegments ? `meter__segment--active ${getSegmentClass(i)}` : ''}`}
          />
        ))}
      </div>
      {showPeak && peakValue !== undefined && (
        <span style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-family-mono)',
          color: peakValue > 90 ? 'var(--color-error)' : 'var(--color-text-tertiary)',
          textAlign: 'right',
        }}>
          Peak: {Math.round(peakValue)}%
        </span>
      )}
    </div>
  );
}

/* ============================================
   TRACKING STATUS
   ============================================ */

type TrackingQuality = 'good' | 'okay' | 'poor' | 'none';

interface TrackingStatusProps {
  quality: TrackingQuality;
  confidence?: number;
  compact?: boolean;
}

const qualityConfig: Record<TrackingQuality, { label: string; color: string; dot: DotStatus }> = {
  good: { label: 'Good', color: 'var(--color-success)', dot: 'active' },
  okay: { label: 'Okay', color: 'var(--color-warning)', dot: 'warning' },
  poor: { label: 'Poor', color: 'var(--color-error)', dot: 'error' },
  none: { label: 'No Tracking', color: 'var(--color-text-tertiary)', dot: 'inactive' },
};

export function TrackingStatus({ quality, confidence, compact = false }: TrackingStatusProps) {
  const config = qualityConfig[quality];

  if (compact) {
    return <StatusDot status={config.dot} />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <StatusDot status={config.dot} />
      <span style={{ fontSize: 'var(--text-sm)', color: config.color }}>
        {config.label}
      </span>
      {confidence !== undefined && (
        <span style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-family-mono)',
          color: 'var(--color-text-tertiary)',
        }}>
          ({Math.round(confidence * 100)}%)
        </span>
      )}
    </div>
  );
}

/* ============================================
   STATUS BAR ITEM
   ============================================ */

interface StatusBarItemProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export function StatusBarItem({ label, value, icon }: StatusBarItemProps) {
  return (
    <div className="status-bar__item">
      {icon}
      <span className="status-bar__label">{label}</span>
      <span className="status-bar__value">{value}</span>
    </div>
  );
}

/* ============================================
   LOADING SPINNER
   ============================================ */

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div className={`spinner ${size !== 'md' ? `spinner--${size}` : ''}`} role="status" />
      {label && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
      )}
    </div>
  );
}
