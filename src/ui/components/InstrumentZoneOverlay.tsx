/**
 * Instrument Zone Overlay - Droppable area for instrument zones
 *
 * Renders instrument zones on top of the video and handles:
 * - Drag-and-drop to place new zones
 * - Mouse drag to reposition zones
 * - Resize handles to change zone size
 * - Clicking zones to configure them
 * - Visual feedback for zone activation
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import type { InstrumentZone, InstrumentDefinition, ZoneTriggerConfig } from '../../state/instrumentZones';
import { createZone, getInstrumentDefinition, getSoundSettingsFromPosition, getColorFromPosition, DEFAULT_SOUND_SETTINGS, DEFAULT_TRIGGER_CONFIG, getTriggerBadge } from '../../state/instrumentZones';
import ZoneConfigPanel from './ZoneConfigPanel';

interface DragState {
  zoneId: string;
  startX: number;
  startY: number;
  zoneStartX: number;
  zoneStartY: number;
}

interface ResizeState {
  zoneId: string;
  startX: number;
  startY: number;
  startSize: number;
}

interface InstrumentZoneOverlayProps {
  /** All placed instrument zones */
  zones: InstrumentZone[];
  /** Callback when zones change */
  onZonesChange: (zones: InstrumentZone[]) => void;
  /** Container width for coordinate conversion */
  containerWidth: number;
  /** Container height for coordinate conversion */
  containerHeight: number;
  /** Native video width */
  videoWidth: number;
  /** Native video height */
  videoHeight: number;
  /** Currently active zone IDs (being triggered) */
  activeZoneIds?: Set<string>;
}

function InstrumentZoneOverlay({
  zones,
  onZonesChange,
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
  activeZoneIds = new Set(),
}: InstrumentZoneOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [isOutsideBounds, setIsOutsideBounds] = useState(false);

  // Calculate display bounds (same logic as TrackingOverlay)
  const getDisplayBounds = useCallback(() => {
    const videoAspect = videoWidth / videoHeight;
    const containerAspect = containerWidth / containerHeight;

    let displayWidth: number;
    let displayHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (videoAspect > containerAspect) {
      displayWidth = containerWidth;
      displayHeight = containerWidth / videoAspect;
      offsetX = 0;
      offsetY = (containerHeight - displayHeight) / 2;
    } else {
      displayHeight = containerHeight;
      displayWidth = containerHeight * videoAspect;
      offsetX = (containerWidth - displayWidth) / 2;
      offsetY = 0;
    }

    return { displayWidth, displayHeight, offsetX, offsetY };
  }, [containerWidth, containerHeight, videoWidth, videoHeight]);

  // Convert pixel coordinates to normalized (0-1) coordinates
  const pixelToNormalized = useCallback(
    (pixelX: number, pixelY: number) => {
      const { displayWidth, displayHeight, offsetX, offsetY } = getDisplayBounds();
      const normX = (pixelX - offsetX) / displayWidth;
      const normY = (pixelY - offsetY) / displayHeight;
      return { x: Math.max(0, Math.min(1, normX)), y: Math.max(0, Math.min(1, normY)) };
    },
    [getDisplayBounds]
  );

  // Convert normalized coordinates to pixels
  const normalizedToPixel = useCallback(
    (normX: number, normY: number) => {
      const { displayWidth, displayHeight, offsetX, offsetY } = getDisplayBounds();
      return {
        x: offsetX + normX * displayWidth,
        y: offsetY + normY * displayHeight,
      };
    },
    [getDisplayBounds]
  );

  // Handle dropping a new instrument
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      console.log('[InstrumentZoneOverlay] Drop event received');

      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) {
        console.log('[InstrumentZoneOverlay] No rect found');
        return;
      }

      const pixelX = e.clientX - rect.left;
      const pixelY = e.clientY - rect.top;
      const { x, y } = pixelToNormalized(pixelX, pixelY);
      console.log(`[InstrumentZoneOverlay] Drop at pixel (${pixelX}, ${pixelY}) -> normalized (${x.toFixed(3)}, ${y.toFixed(3)})`);

      // Create a new zone from the dropped instrument
      const instrumentData = e.dataTransfer.getData('instrument');
      console.log(`[InstrumentZoneOverlay] Instrument data: ${instrumentData}`);
      if (!instrumentData) {
        console.log('[InstrumentZoneOverlay] No instrument data in drop');
        return;
      }

      try {
        const instrument: InstrumentDefinition = JSON.parse(instrumentData);
        const newZone = createZone(instrument.type, x, y);
        console.log(`[InstrumentZoneOverlay] Created zone: ${newZone.type} at (${newZone.x.toFixed(3)}, ${newZone.y.toFixed(3)})`);
        onZonesChange([...zones, newZone]);
      } catch (err) {
        console.warn('Invalid instrument data dropped', err);
      }
    },
    [zones, onZonesChange, pixelToNormalized]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // Handle clicking a zone to select it
  const handleZoneClick = useCallback((e: React.MouseEvent, zoneId: string) => {
    e.stopPropagation();
    setSelectedZoneId((prev) => (prev === zoneId ? null : zoneId));
  }, []);

  // Handle clicking outside zones to deselect
  const handleOverlayClick = useCallback(() => {
    setSelectedZoneId(null);
  }, []);

  // Handle changing the trigger config for a zone
  const handleTriggerConfigChange = useCallback(
    (zoneId: string, triggerConfig: ZoneTriggerConfig) => {
      const updatedZones = zones.map((zone) =>
        zone.id === zoneId
          ? { ...zone, triggerConfig, trigger: triggerConfig.bodyPart }
          : zone
      );
      onZonesChange(updatedZones);
    },
    [zones, onZonesChange]
  );

  // Handle deleting a zone
  const handleDeleteZone = useCallback(
    (zoneId: string) => {
      onZonesChange(zones.filter((zone) => zone.id !== zoneId));
      setSelectedZoneId(null);
    },
    [zones, onZonesChange]
  );

  // Mouse-based dragging for zone repositioning
  // Position determines sound (X=pitch, Y=volume) and color
  const handleZoneMouseDown = useCallback(
    (e: React.MouseEvent, zoneId: string) => {
      // Only start drag on left click and not on resize handle
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).classList.contains('zone-resize-handle')) return;

      e.preventDefault();
      e.stopPropagation();

      const zone = zones.find(z => z.id === zoneId);
      if (!zone) return;

      // Start position drag - sound/color will update based on position
      setDragState({
        zoneId,
        startX: e.clientX,
        startY: e.clientY,
        zoneStartX: zone.x,
        zoneStartY: zone.y,
      });
    },
    [zones]
  );

  // Handle mouse move for dragging
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { displayWidth, displayHeight } = getDisplayBounds();

      if (dragState) {
        const deltaX = (e.clientX - dragState.startX) / displayWidth;
        const deltaY = (e.clientY - dragState.startY) / displayHeight;

        // Allow dragging beyond bounds (don't clamp)
        const newX = dragState.zoneStartX + deltaX;
        const newY = dragState.zoneStartY + deltaY;

        // Check if outside the valid area (with some margin for the zone size)
        const margin = 0.1; // 10% margin before considering "outside"
        const outside = newX < -margin || newX > 1 + margin || newY < -margin || newY > 1 + margin;
        setIsOutsideBounds(outside);

        // Clamp position for sound/color calculation (keep within 0-1)
        const clampedX = Math.max(0, Math.min(1, newX));
        const clampedY = Math.max(0, Math.min(1, newY));

        const updatedZones = zones.map((zone) =>
          zone.id === dragState.zoneId
            ? {
                ...zone,
                x: newX,
                y: newY,
                color: getColorFromPosition(clampedX),
                soundSettings: getSoundSettingsFromPosition(clampedX, clampedY),
              }
            : zone
        );
        onZonesChange(updatedZones);
      }

      if (resizeState) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaY = e.clientY - resizeState.startY;
        const delta = Math.max(deltaX, deltaY);

        // Convert pixel delta to normalized size
        const sizeDelta = delta / displayWidth;
        const newSize = Math.max(0.05, Math.min(0.4, resizeState.startSize + sizeDelta));

        const updatedZones = zones.map((zone) =>
          zone.id === resizeState.zoneId ? { ...zone, size: newSize } : zone
        );
        onZonesChange(updatedZones);
      }

    },
    [dragState, resizeState, zones, onZonesChange, getDisplayBounds]
  );

  // Handle mouse up to end dragging
  const handleMouseUp = useCallback(() => {
    // If zone was dragged outside bounds, delete it
    if (dragState && isOutsideBounds) {
      onZonesChange(zones.filter((zone) => zone.id !== dragState.zoneId));
      setSelectedZoneId(null);
    }
    setDragState(null);
    setResizeState(null);
    setIsOutsideBounds(false);
  }, [dragState, isOutsideBounds, zones, onZonesChange]);

  // Handle resize handle mouse down
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, zoneId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const zone = zones.find(z => z.id === zoneId);
      if (!zone) return;

      setResizeState({
        zoneId,
        startX: e.clientX,
        startY: e.clientY,
        startSize: zone.size,
      });
    },
    [zones]
  );

  // Add/remove global mouse listeners for dragging
  useEffect(() => {
    if (dragState || resizeState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, resizeState, handleMouseMove, handleMouseUp]);

  const { displayWidth } = getDisplayBounds();
  const isDragging = dragState !== null;
  const isResizing = resizeState !== null;

  return (
    <div
      ref={overlayRef}
      className={`instrument-zone-overlay ${isDragOver ? 'instrument-zone-overlay--drag-over' : ''} ${isDragging ? 'instrument-zone-overlay--dragging' : ''} ${isResizing ? 'instrument-zone-overlay--resizing' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleOverlayClick}
    >
      {/* Drop hint */}
      {isDragOver && (
        <div className="drop-hint">
          <span>Drop here to place instrument</span>
        </div>
      )}

      {/* Render each zone */}
      {zones.map((zone) => {
        const { x, y } = normalizedToPixel(zone.x, zone.y);
        const sizePixels = zone.size * displayWidth;
        const isActive = activeZoneIds.has(zone.id);
        const isSelected = selectedZoneId === zone.id;
        const isBeingDragged = dragState?.zoneId === zone.id;
        const isBeingResized = resizeState?.zoneId === zone.id;
        const willBeDeleted = isBeingDragged && isOutsideBounds;
        const def = getInstrumentDefinition(zone.type);
        const soundSettings = zone.soundSettings || DEFAULT_SOUND_SETTINGS;
        const triggerConfig = zone.triggerConfig || DEFAULT_TRIGGER_CONFIG;
        const badge = getTriggerBadge(triggerConfig);

        return (
          <div
            key={zone.id}
            className={`instrument-zone ${isActive ? 'instrument-zone--active' : ''} ${isSelected ? 'instrument-zone--selected' : ''} ${isBeingDragged ? 'instrument-zone--dragging' : ''} ${isBeingResized ? 'instrument-zone--resizing' : ''} ${willBeDeleted ? 'instrument-zone--will-delete' : ''}`}
            style={{
              left: x - sizePixels / 2,
              top: y - sizePixels / 2,
              width: sizePixels,
              height: sizePixels,
              '--zone-color': zone.color,
            } as React.CSSProperties}
            onClick={(e) => handleZoneClick(e, zone.id)}
            onMouseDown={(e) => handleZoneMouseDown(e, zone.id)}
            draggable={false}
          >
            <span className="instrument-zone-icon">{def.icon}</span>
            <span className="instrument-zone-name">{def.name}</span>

            {/* Trigger badge - shows body part selection */}
            {badge && (
              <span className="instrument-zone-badge">{badge}</span>
            )}

            {/* Resize handle - visible when selected */}
            {isSelected && (
              <div
                className="zone-resize-handle"
                onMouseDown={(e) => handleResizeMouseDown(e, zone.id)}
                title="Drag to resize"
              />
            )}

            {/* Sound indicator - shows during drag */}
            {isBeingDragged && (
              <div className="zone-sound-indicator">
                <div className="zone-sound-value">
                  <span className="zone-sound-label">Pitch</span>
                  <span className="zone-sound-number">{soundSettings.pitchOffset > 0 ? '+' : ''}{soundSettings.pitchOffset}</span>
                </div>
                <div className="zone-sound-value">
                  <span className="zone-sound-label">Vol</span>
                  <span className="zone-sound-number">{Math.round(soundSettings.volume * 100)}%</span>
                </div>
              </div>
            )}

            {/* Configuration panel - shows when selected */}
            {isSelected && !isBeingDragged && !isBeingResized && (
              <ZoneConfigPanel
                triggerConfig={triggerConfig}
                zoneName={def.name}
                onConfigChange={(config) => handleTriggerConfigChange(zone.id, config)}
                onClose={() => setSelectedZoneId(null)}
                onDelete={() => handleDeleteZone(zone.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default InstrumentZoneOverlay;
