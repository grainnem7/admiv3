/**
 * StatusBar - Bottom status strip.
 *
 * Shows: play state, tracking modalities, zone count, point count.
 * Profile name is in the toolbar (no duplication).
 */

import type { InputProfile, TrackedBodyPoint } from '../../../state/types';
import type { InstrumentZone } from '../../../state/instrumentZones';

interface StatusBarProps {
  isActive: boolean;
  currentProfile: InputProfile;
  instrumentZones: InstrumentZone[];
  trackedPoints: TrackedBodyPoint[];
}

function getModalityText(profile: InputProfile): string {
  const parts: string[] = [];
  if (profile.activeModalities.pose) parts.push('Body');
  if (profile.activeModalities.leftHand || profile.activeModalities.rightHand) parts.push('Hands');
  if (profile.activeModalities.face) parts.push('Face');
  return parts.join(' + ') || 'None';
}

function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)',
    }}>
      {color && (
        <div style={{
          width: 6, height: 6, borderRadius: 'var(--radius-full)',
          background: color, boxShadow: `0 0 4px ${color}`,
        }} />
      )}
      {label && <span>{label}</span>}
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, fontFamily: 'var(--font-family-mono)' }}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 14, background: 'var(--color-border-subtle)' }} />;
}

export default function StatusBar({ isActive, currentProfile, instrumentZones, trackedPoints }: StatusBarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '6px 20px',
      background: 'var(--color-bg-deep)',
      borderTop: '1px solid var(--color-border-subtle)',
      flexShrink: 0,
    }} role="status" aria-label="Performance status">
      <Pill label="" value={isActive ? 'Playing' : 'Ready'} color={isActive ? 'var(--color-success)' : 'var(--color-text-disabled)'} />
      <Divider />
      <Pill label="Tracking" value={getModalityText(currentProfile)} />
      <Divider />
      <Pill label="Zones" value={String(instrumentZones.length)} />
      <Divider />
      <Pill label="Points" value={String(trackedPoints.filter(p => p.enabled).length)} />
    </div>
  );
}
