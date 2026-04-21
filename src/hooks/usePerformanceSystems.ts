/**
 * Custom hook that initializes and manages all performance systems:
 * TrackingManager, MultiModalProcessor, MappingEngine, MusicController.
 *
 * Extracted from PerformanceScreenV2 to keep the screen component focused on composition.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TrackingFrame, InputProfile } from '../state/types';
import { TrackingManager, getTrackingManager } from '../tracking/TrackingManager';
import { MultiModalProcessor, getMultiModalProcessor } from '../movement/MultiModalProcessor';
import { MappingEngine, getMappingEngine } from '../mapping/MappingEngine';
import { MusicController, getMusicController } from '../core/MusicController';

export interface PerformanceSystemsRefs {
  trackingManager: React.MutableRefObject<TrackingManager | null>;
  processor: React.MutableRefObject<MultiModalProcessor | null>;
  mappingEngine: React.MutableRefObject<MappingEngine | null>;
  musicController: React.MutableRefObject<MusicController | null>;
}

export interface UsePerformanceSystemsResult {
  refs: PerformanceSystemsRefs;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  error: string | null;
  videoSize: { width: number; height: number };
  containerSize: { width: number; height: number };
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  handleUserInteraction: () => Promise<void>;
}

export function usePerformanceSystems(
  initialProfile: InputProfile,
  onFrame: (frame: TrackingFrame) => void
): UsePerformanceSystemsResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const trackingManagerRef = useRef<TrackingManager | null>(null);
  const processorRef = useRef<MultiModalProcessor | null>(null);
  const mappingEngineRef = useRef<MappingEngine | null>(null);
  const musicControllerRef = useRef<MusicController | null>(null);

  // Stable ref to always call the latest onFrame callback
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });
  const [containerSize, setContainerSize] = useState({ width: 640, height: 480 });
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Initialize all systems
  useEffect(() => {
    let mounted = true;
    let frameCallback: (() => void) | null = null;
    let resizeHandler: (() => void) | null = null;

    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize tracking manager
        const trackingManager = getTrackingManager();
        trackingManagerRef.current = trackingManager;
        await trackingManager.initialize();

        if (!mounted) return;

        // Initialize movement processor
        const processor = getMultiModalProcessor();
        processorRef.current = processor;

        // Initialize mapping engine
        const mappingEngine = getMappingEngine();
        mappingEngineRef.current = mappingEngine;

        // Initialize music controller
        const musicController = getMusicController();
        musicControllerRef.current = musicController;
        await musicController.initialize();
        musicController.start();

        if (!mounted) return;

        // Apply initial profile
        processor.setProfile(initialProfile);
        mappingEngine.configureFromProfile(initialProfile);
        await trackingManager.setActiveModalities(initialProfile.activeModalities);

        // Start camera
        if (!videoRef.current) {
          throw new Error('Video element not found');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 60, min: 30 },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setVideoSize({
          width: videoRef.current.videoWidth || 640,
          height: videoRef.current.videoHeight || 480,
        });

        const updateContainerSize = () => {
          if (containerRef.current) {
            setContainerSize({
              width: containerRef.current.clientWidth,
              height: containerRef.current.clientHeight,
            });
          }
        };
        updateContainerSize();
        resizeHandler = updateContainerSize;
        window.addEventListener('resize', updateContainerSize);

        frameCallback = trackingManager.onFrame((frame) => {
          if (!mounted) return;
          onFrameRef.current(frame);
        });

        trackingManager.start(videoRef.current);
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Failed to initialize';
        setError(message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      frameCallback?.();
      trackingManagerRef.current?.stop();

      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
    };
  }, []); // intentionally empty — profile changes handled separately

  // Resume audio on user interaction
  const handleUserInteraction = useCallback(async () => {
    if (audioEnabled) return;

    if (musicControllerRef.current) {
      try {
        await musicControllerRef.current.testSound();
        setAudioEnabled(true);
      } catch (err) {
        console.error('[usePerformanceSystems] Failed to enable audio:', err);
      }
    }
  }, [audioEnabled]);

  return {
    refs: {
      trackingManager: trackingManagerRef,
      processor: processorRef,
      mappingEngine: mappingEngineRef,
      musicController: musicControllerRef,
    },
    videoRef,
    containerRef,
    isLoading,
    error,
    videoSize,
    containerSize,
    audioEnabled,
    setAudioEnabled,
    handleUserInteraction,
  };
}
