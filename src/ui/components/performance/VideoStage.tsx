/**
 * VideoStage — Redesigned
 *
 * The central performance area. Camera feed with visual framing,
 * integrated overlays, polished loading/error/audio states.
 */

import { useCallback, useState } from 'react';
import { useIsMuted, useMasterVolume } from '../../../state/store';
import type { TrackingFrame, InputProfile, TrackedBodyPoint, TriggerEvent } from '../../../state/types';
import type { InstrumentZone, InstrumentDefinition } from '../../../state/instrumentZones';
import { getColorTracker } from '../../../tracking/ColorTracker';
import { IconWarning, IconVolume } from '../../design-system/Icons';
import TrackingOverlay from '../TrackingOverlay';
import InstrumentZoneOverlay from '../InstrumentZoneOverlay';
import InstrumentPalette from '../InstrumentPalette';
import HarmonyIndicator from '../HarmonyIndicator';
import ColorTrackingOverlay from '../ColorTrackingOverlay';
import TrackingStatusOverlay from '../TrackingStatusOverlay';
import type { PerformanceSystemsRefs } from '../../../hooks/usePerformanceSystems';
import type { InputMethod } from '../InputMethodPanel';
import StatusHUD from './StatusHUD';
import AudioReactiveRing from './AudioReactiveRing';
import GestureFeedbackToast from './GestureFeedbackToast';

interface VideoStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  systemRefs: PerformanceSystemsRefs;
  currentFrame: TrackingFrame | null;
  currentProfile: InputProfile;
  videoSize: { width: number; height: number };
  containerSize: { width: number; height: number };
  isLoading: boolean;
  error: string | null;
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  activeInputMethod: InputMethod;
  instrumentZones: InstrumentZone[];
  onZonesChange: (zones: InstrumentZone[]) => void;
  activeZoneIds: Set<string>;
  trackedPoints: TrackedBodyPoint[];
  recentTriggers: TriggerEvent[];
  isActive: boolean;
  colorCalibrationMode: boolean;
  setColorCalibrationMode: (mode: boolean) => void;
  calibratingColorId: string | null;
  setCalibratingColorId: (id: string | null) => void;
}

export default function VideoStage({
  videoRef, containerRef, systemRefs,
  currentFrame, currentProfile, videoSize, containerSize,
  isLoading, error, audioEnabled, setAudioEnabled,
  activeInputMethod, instrumentZones, onZonesChange, activeZoneIds,
  trackedPoints, recentTriggers, isActive,
  colorCalibrationMode, setColorCalibrationMode, calibratingColorId, setCalibratingColorId,
}: VideoStageProps) {
  const isMuted = useIsMuted();
  const masterVolume = useMasterVolume();
  const [showLandmarkLabels, setShowLandmarkLabels] = useState(false);
  const [isPaletteExpanded, setIsPaletteExpanded] = useState(false);

  const handleVideoClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!colorCalibrationMode || !calibratingColorId || !videoRef.current) return;
      const video = videoRef.current;
      const rect = video.getBoundingClientRect();
      const containerAspect = rect.width / rect.height;
      const videoAspect = (video.videoWidth || 640) / (video.videoHeight || 480);
      let offsetX = 0, offsetY = 0, visibleW = rect.width, visibleH = rect.height;
      if (videoAspect > containerAspect) { visibleW = rect.height * videoAspect; offsetX = (visibleW - rect.width) / 2; }
      else { visibleH = rect.width / videoAspect; offsetY = (visibleH - rect.height) / 2; }
      const clickX = e.clientX - rect.left + offsetX;
      const clickY = e.clientY - rect.top + offsetY;
      getColorTracker().calibrateFromPixel(videoRef.current, 1 - clickX / visibleW, clickY / visibleH, calibratingColorId);
      setColorCalibrationMode(false);
      setCalibratingColorId(null);
      const soundEngine = systemRefs.musicController.current?.getSoundEngine();
      if (soundEngine) {
        try { if (!soundEngine.isReady()) await soundEngine.initialize(); systemRefs.musicController.current?.start(); setAudioEnabled(true); }
        catch (err) { console.error('[VideoStage] Failed to start audio:', err); }
      }
    },
    [colorCalibrationMode, calibratingColorId, videoRef, systemRefs, setAudioEnabled, setColorCalibrationMode, setCalibratingColorId]
  );

  const handleInstrumentDragStart = useCallback((_instrument: InstrumentDefinition, _e: React.DragEvent) => {}, []);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minWidth: 0, minHeight: 0, background: '#08080c',
    }}>
      {/* Video area with subtle inset frame */}
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        style={{
          flex: 1, position: 'relative', minHeight: 0,
          margin: 6,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="video-container"
          onClick={handleVideoClick}
          style={{
            position: 'absolute', inset: 0,
            cursor: colorCalibrationMode ? 'crosshair' : undefined,
            borderRadius: 12, overflow: 'hidden',
          }}
        >
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            autoPlay playsInline muted
            aria-label="Camera feed showing your movements"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />

          <HarmonyIndicator />
          <AudioReactiveRing isActive={isActive} />
          <StatusHUD currentFrame={currentFrame} currentProfile={currentProfile} isActive={isActive} masterVolume={masterVolume} />
          <GestureFeedbackToast recentTriggers={recentTriggers} />

          <TrackingOverlay
            frame={currentFrame} profile={currentProfile}
            width={videoSize.width} height={videoSize.height}
            containerWidth={containerSize.width} containerHeight={containerSize.height}
            showAllLandmarks showConnections showLabels={showLandmarkLabels}
          />

          {activeInputMethod === 'color' && (
            <ColorTrackingOverlay
              colorLandmarks={currentFrame?.color ?? null}
              mappings={systemRefs.mappingEngine.current?.getColorExpressionNode()?.getMappings() ?? []}
              containerWidth={containerSize.width} containerHeight={containerSize.height}
              isCalibrating={colorCalibrationMode}
            />
          )}

          <InstrumentZoneOverlay
            zones={instrumentZones} onZonesChange={onZonesChange}
            containerWidth={containerSize.width} containerHeight={containerSize.height}
            videoWidth={videoSize.width} videoHeight={videoSize.height}
            activeZoneIds={activeZoneIds}
          />

          <InstrumentPalette
            onDragStart={handleInstrumentDragStart}
            isExpanded={isPaletteExpanded}
            onToggle={() => setIsPaletteExpanded(!isPaletteExpanded)}
          />

          {/* --- State overlays --- */}

          {/* Loading */}
          {isLoading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16, background: 'rgba(8,8,12,0.85)', backdropFilter: 'blur(8px)',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.1)',
                borderTopColor: '#f97316',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ color: '#a1a1b8', fontSize: 14, fontWeight: 500 }}>
                Starting camera...
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16, background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(8px)',
              padding: 32,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                <IconWarning size={24} />
              </div>
              <p style={{ color: '#e4e4ef', fontSize: 16, fontWeight: 600, margin: 0 }}>Camera unavailable</p>
              <p style={{ color: '#71718a', fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 300 }}>{error}</p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  height: 40, padding: '0 24px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#e4e4ef', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Audio enable prompt */}
          {!audioEnabled && !isLoading && !error && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(8,8,12,0.5)', backdropFilter: 'blur(4px)',
              cursor: 'pointer',
            }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                padding: '28px 40px', borderRadius: 16,
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                boxShadow: '0 8px 32px rgba(249,115,22,0.3), 0 2px 8px rgba(0,0,0,0.3)',
                color: '#fff',
              }}>
                <span style={{ color: 'var(--color-text-inverse)' }}><IconVolume size={32} /></span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Click anywhere to enable audio</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Your browser requires a click to start sound</span>
              </div>
            </div>
          )}

          {/* Labels toggle — pill style */}
          <button
            onClick={() => setShowLandmarkLabels(!showLandmarkLabels)}
            aria-pressed={showLandmarkLabels}
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 40,
              padding: '5px 12px', borderRadius: 999,
              background: showLandmarkLabels ? 'rgba(249,115,22,0.9)' : 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              transition: 'all 150ms ease',
              letterSpacing: '0.03em',
            }}
          >
            {showLandmarkLabels ? 'LABELS ON' : 'LABELS OFF'}
          </button>

          {/* Mute indicator — floating pill */}
          {isMuted && audioEnabled && (
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              zIndex: 40, padding: '6px 16px', borderRadius: 999,
              background: 'rgba(239,68,68,0.85)', backdropFilter: 'blur(4px)',
              fontSize: 12, fontWeight: 600, color: '#fff',
              letterSpacing: '0.05em',
              boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
            }}>
              MUTED — Press Space
            </div>
          )}
        </div>
      </div>

      {/* Tracking status strip below video */}
      <div style={{
        padding: '10px 16px',
        background: '#0e0e14',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        maxHeight: 160, overflowY: 'auto',
        fontSize: 13,
      }}>
        <TrackingStatusOverlay
          frame={currentFrame}
          trackedPoints={trackedPoints}
          recentTriggers={recentTriggers}
          isMuted={isMuted}
        />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
