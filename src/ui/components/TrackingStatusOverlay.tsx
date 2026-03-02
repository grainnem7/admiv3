/**
 * Tracking Status Overlay
 *
 * Displays real-time tracking information overlaid on the video:
 * - Active tracked points with detection status
 * - Recent trigger events
 * - Expression values (blink, brow, etc.)
 */

import { useMemo } from 'react';
import type { TrackingFrame, TriggerEvent, TrackedBodyPoint } from '../../state/types';
import { getLandmarkDefinition, getSourceDisplayName } from '../../state/landmarkDefinitions';

interface TrackingStatusOverlayProps {
  frame: TrackingFrame | null;
  trackedPoints: TrackedBodyPoint[];
  recentTriggers: TriggerEvent[];
  isMuted: boolean;
}

function TrackingStatusOverlay({
  frame,
  trackedPoints,
  recentTriggers,
  isMuted,
}: TrackingStatusOverlayProps) {
  // Get detection status for each tracked point
  const pointStatuses = useMemo(() => {
    if (!frame) return [];

    return trackedPoints
      .filter(p => p.enabled)
      .map(point => {
        let detected = false;
        let position = { x: 0, y: 0 };

        // Get landmark data based on source
        let landmarks: Array<{ x: number; y: number }> | undefined;
        switch (point.source) {
          case 'pose':
            landmarks = frame.pose?.landmarks;
            break;
          case 'leftHand':
            landmarks = frame.leftHand?.landmarks;
            break;
          case 'rightHand':
            landmarks = frame.rightHand?.landmarks;
            break;
          case 'face':
            landmarks = frame.face?.landmarks;
            break;
        }

        if (landmarks && landmarks[point.landmarkIndex]) {
          const lm = landmarks[point.landmarkIndex];
          detected = lm.x !== undefined && lm.y !== undefined;
          if (detected) {
            position = { x: lm.x, y: lm.y };
          }
        }

        // Calculate mapped value if mapping exists
        let mappedValue: string | null = null;
        if (point.mapping && point.mapping.target !== 'none' && detected) {
          const axis = point.mapping.axis || 'y';
          let value = axis === 'x' ? position.x : position.y;
          if (point.mapping.inverted) value = 1 - value;

          switch (point.mapping.target) {
            case 'pitch':
              // Convert to note name
              const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
              const midiNote = Math.round(36 + value * 48); // C2 to C6
              const noteName = noteNames[midiNote % 12];
              const octave = Math.floor(midiNote / 12) - 1;
              mappedValue = `${noteName}${octave}`;
              break;
            case 'volume':
              mappedValue = `${Math.round(value * 100)}%`;
              break;
            case 'filter':
              mappedValue = `${Math.round(value * 100)}%`;
              break;
            case 'zone-trigger':
              mappedValue = 'Zone';
              break;
          }
        }

        const def = getLandmarkDefinition(point.source, point.landmarkIndex);
        const displayName = def?.shortName || point.name;
        const sourceLabel = getSourceDisplayName(point.source);

        return {
          id: point.id,
          name: displayName,
          source: sourceLabel,
          detected,
          position,
          mapping: point.mapping,
          mappedValue,
        };
      });
  }, [frame, trackedPoints]);

  // Get expression values from face blendshapes
  const expressions = useMemo(() => {
    if (!frame?.face?.blendshapes) return [];

    const blendshapes = frame.face.blendshapes;
    const result: { name: string; value: number }[] = [];

    const findBlendshape = (name: string) =>
      blendshapes.find(b => b.categoryName === name)?.score || 0;

    // Eye blink (average of both eyes)
    const leftBlink = findBlendshape('eyeBlinkLeft');
    const rightBlink = findBlendshape('eyeBlinkRight');
    const avgBlink = (leftBlink + rightBlink) / 2;
    if (avgBlink > 0.1) {
      result.push({ name: 'Blink', value: avgBlink });
    }

    // Brow raise
    const browUp = findBlendshape('browInnerUp');
    if (browUp > 0.1) {
      result.push({ name: 'Brow', value: browUp });
    }

    // Mouth open
    const jawOpen = findBlendshape('jawOpen');
    if (jawOpen > 0.1) {
      result.push({ name: 'Mouth', value: jawOpen });
    }

    return result;
  }, [frame]);

  // Format time ago for triggers
  const formatTimeAgo = (timestamp: number) => {
    const seconds = (Date.now() - timestamp) / 1000;
    if (seconds < 1) return 'now';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m`;
  };

  const hasContent = pointStatuses.length > 0 || recentTriggers.length > 0 || expressions.length > 0;

  if (!hasContent) {
    return (
      <div className="tracking-status-overlay">
        <div className="tracking-status-empty">
          No points tracked. Select body points in the Points panel to see mapping info here.
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-status-overlay">
      {/* Tracked Points with Mappings */}
      {pointStatuses.length > 0 && (
        <div className="tracking-status-section">
          <div className="tracking-status-section-title">Body → Sound</div>
          {pointStatuses.slice(0, 6).map(status => (
            <div key={status.id} className="tracking-status-point">
              <span className={`tracking-status-dot ${status.detected ? 'tracking-status-dot--active' : ''}`} />
              <span className="tracking-status-name">{status.name}</span>
              {status.mapping && status.mapping.target !== 'none' ? (
                <>
                  <span className="tracking-status-arrow">&rarr;</span>
                  <span className="tracking-status-target">
                    {status.mapping.target === 'pitch' && 'Pitch'}
                    {status.mapping.target === 'volume' && 'Volume'}
                    {status.mapping.target === 'filter' && 'Filter'}
                    {status.mapping.target === 'zone-trigger' && 'Zone'}
                  </span>
                  {status.mappedValue && (
                    <span className="tracking-status-value">{status.mappedValue}</span>
                  )}
                </>
              ) : (
                <span className="tracking-status-unmapped">(not mapped)</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Expression Bars */}
      {expressions.length > 0 && (
        <div className="tracking-status-section tracking-status-expressions">
          <div className="tracking-status-section-title">Expressions</div>
          {expressions.map(expr => (
            <div key={expr.name} className="tracking-status-expression">
              <span className="tracking-status-expr-name">{expr.name}</span>
              <div className="tracking-status-expr-bar">
                <div
                  className="tracking-status-expr-fill"
                  style={{ width: `${expr.value * 100}%` }}
                />
              </div>
              <span className="tracking-status-expr-value">{Math.round(expr.value * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Triggers */}
      {recentTriggers.length > 0 && (
        <div className="tracking-status-section tracking-status-triggers">
          <div className="tracking-status-section-title">Recent Triggers</div>
          {recentTriggers.slice(0, 5).map(trigger => (
            <div key={trigger.id} className="tracking-status-trigger">
              <span className="tracking-status-trigger-action">{trigger.action}</span>
              <span className="tracking-status-trigger-time">{formatTimeAgo(trigger.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mapping Guide */}
      <div className="tracking-status-section tracking-status-guide">
        <div className="tracking-status-section-title">How It Works</div>
        <div className="tracking-status-guide-items">
          <div className="tracking-status-guide-item">
            <span className="tracking-status-guide-label">Pitch</span>
            <span className="tracking-status-guide-desc">Y position → note</span>
          </div>
          <div className="tracking-status-guide-item">
            <span className="tracking-status-guide-label">Volume</span>
            <span className="tracking-status-guide-desc">Position → loudness</span>
          </div>
          <div className="tracking-status-guide-item">
            <span className="tracking-status-guide-label">Filter</span>
            <span className="tracking-status-guide-desc">Position → tone</span>
          </div>
          <div className="tracking-status-guide-item">
            <span className="tracking-status-guide-label">Zone</span>
            <span className="tracking-status-guide-desc">Enter zone → trigger</span>
          </div>
        </div>
      </div>

      {/* Mute indicator */}
      {isMuted && (
        <div className="tracking-status-muted">MUTED</div>
      )}
    </div>
  );
}

export default TrackingStatusOverlay;
