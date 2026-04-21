/**
 * Custom hook encapsulating the tracking frame processing pipeline.
 *
 * Handles: theremin mode, color tracking, movement processing,
 * mapping, zone collision, gesture detection, and music controller updates.
 *
 * Extracted from PerformanceScreenV2 to reduce component complexity.
 */

import { useCallback, useState } from 'react';
import type { TrackingFrame, TriggerEvent } from '../state/types';
import type { InstrumentZone, GestureSoundMapping } from '../state/instrumentZones';
import { getInstrumentDefinition } from '../state/instrumentZones';
import { useAppStore, useIsMuted } from '../state/store';
import { useZoneCollision } from './useZoneCollision';
import { useGestureSounds } from './useGestureSounds';
import { type InputMethod, getColorConfigs } from '../ui/components/InputMethodPanel';
import type { PerformanceSystemsRefs } from './usePerformanceSystems';

export interface UseFrameProcessorResult {
  handleTrackingFrame: (frame: TrackingFrame) => void;
  currentFrame: TrackingFrame | null;
  isActive: boolean;
  activeZoneIds: Set<string>;
  recentTriggers: TriggerEvent[];
  setRecentTriggers: React.Dispatch<React.SetStateAction<TriggerEvent[]>>;
}

export function useFrameProcessor(
  systemRefs: PerformanceSystemsRefs,
  instrumentZonesRef: React.MutableRefObject<InstrumentZone[]>,
  gestureMappingsRef: React.MutableRefObject<GestureSoundMapping[]>,
  activeInputMethod: InputMethod
): UseFrameProcessorResult {
  const [currentFrame, setCurrentFrame] = useState<TrackingFrame | null>(null);
  const [, setCurrentFrequency] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeZoneIds, setActiveZoneIds] = useState<Set<string>>(new Set());
  const [recentTriggers, setRecentTriggers] = useState<TriggerEvent[]>([]);

  const { checkCollisions } = useZoneCollision();
  const { checkGestures } = useGestureSounds();
  const isMuted = useIsMuted();
  const setTrackingFrame = useAppStore((s) => s.setTrackingFrame);

  const handleTrackingFrame = useCallback(
    (frame: TrackingFrame) => {
      setCurrentFrame(frame);
      setTrackingFrame(frame);

      const { mappingEngine, musicController } = systemRefs;

      const isThereminMode = mappingEngine.current?.isThereminMode() ?? false;

      if (isThereminMode) {
        const dualResult = mappingEngine.current?.processDualThereminFrame(frame);

        if (dualResult && musicController.current) {
          const soundEngine = musicController.current.getSoundEngine();
          if (soundEngine && !isMuted) {
            for (const hand of ['left', 'right'] as const) {
              const result = dualResult[hand];
              if (result.shouldPlay) {
                if (!soundEngine.isThereminPlaying(hand)) {
                  soundEngine.thereminStart(result.frequency, result.volume, hand);
                } else {
                  soundEngine.thereminSetFrequency(result.frequency, hand);
                  soundEngine.thereminSetVolume(result.volume, hand);
                }
              } else {
                if (soundEngine.isThereminPlaying(hand)) {
                  soundEngine.thereminStop(hand);
                }
              }
            }
          }

          const displayResult = dualResult.right.handActive ? dualResult.right : dualResult.left;
          setCurrentFrequency(displayResult.frequency);
          setIsActive(dualResult.left.handActive || dualResult.right.handActive);
        }
        return;
      }

      // Color tracking — play notes based on blob positions
      if (activeInputMethod === 'color' && musicController.current && frame.color) {
        const configs = getColorConfigs();
        const foundBlobs = frame.color.blobs.filter(b => b.found);

        if (foundBlobs.length > 0 && !isMuted) {
          const soundEngine = musicController.current.getSoundEngine();

          for (const blob of foundBlobs) {
            const cfg = configs[blob.colorId] ?? { role: 'pitch+volume', voice: 'melody' };

            if (cfg.role === 'pitch' || cfg.role === 'pitch+volume') {
              musicController.current.processColorPosition(
                { x: blob.x, y: blob.y },
                frame.timestamp,
                cfg.voice,
              );
            }
            if (cfg.role === 'volume' || cfg.role === 'pitch+volume') {
              const vol = Math.max(0.1, 1 - blob.y);
              soundEngine?.setMasterVolume(vol);
            }
            if (cfg.role === 'filter') {
              const filterVal = 1 - blob.y;
              soundEngine?.setFilterFrequency(filterVal);
            }
          }
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      }

      const processedFrame = systemRefs.processor.current?.process(frame);
      if (!processedFrame) return;

      const mappingOutput = mappingEngine.current?.process(processedFrame);
      if (!mappingOutput) return;

      setCurrentFrequency(mappingOutput.result.pitch ?? 0);
      setIsActive(mappingOutput.result.volume !== undefined && mappingOutput.result.volume > 0.01);

      const currentZones = instrumentZonesRef.current;
      const { activeZoneIds: newActiveIds, triggeredZones } = checkCollisions(frame, currentZones);
      setActiveZoneIds(newActiveIds);

      if (triggeredZones.length > 0) {
        if (!isMuted && musicController.current) {
          for (const zone of triggeredZones) {
            const def = getInstrumentDefinition(zone.type);
            musicController.current.triggerZoneSound(zone, def);
            setRecentTriggers(prev => [
              { id: `${Date.now()}-${zone.id}`, source: 'zone', action: def.name, timestamp: Date.now() },
              ...prev.slice(0, 9)
            ]);
          }
        }
      }

      const currentMappings = gestureMappingsRef.current;
      if (currentMappings.length > 0) {
        checkGestures(frame, currentMappings, isMuted);
      }

      if (!isMuted && musicController.current) {
        musicController.current.processFrame(frame);
        musicController.current.processProcessedFrame(processedFrame);
      }
    },
    [isMuted, checkCollisions, checkGestures, setTrackingFrame, activeInputMethod, systemRefs, instrumentZonesRef, gestureMappingsRef]
  );

  return {
    handleTrackingFrame,
    currentFrame,
    isActive,
    activeZoneIds,
    recentTriggers,
    setRecentTriggers,
  };
}
