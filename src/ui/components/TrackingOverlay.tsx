/**
 * Tracking Overlay - Multi-modal tracking visualization
 *
 * Renders pose, hand, and face landmarks on a canvas overlay.
 * Highlights active features based on the current InputProfile.
 */

import { useRef, useCallback, useLayoutEffect } from 'react';
import type { TrackingFrame, InputProfile, TrackedFeature } from '../../state/types';
import { HAND_LANDMARKS, FACE_LANDMARKS } from '../../utils/constants';

interface TrackingOverlayProps {
  /** Current tracking frame */
  frame: TrackingFrame | null;
  /** Current input profile */
  profile: InputProfile | null;
  /** Native video width */
  width: number;
  /** Native video height */
  height: number;
  /** Container display width */
  containerWidth?: number;
  /** Container display height */
  containerHeight?: number;
  /** Show all landmarks or just tracked features */
  showAllLandmarks?: boolean;
  /** Show connection lines */
  showConnections?: boolean;
  /** Show text labels for landmarks */
  showLabels?: boolean;
}

// Pose connection pairs for skeleton drawing
const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
];

// Hand connection pairs
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17], // palm
];

// Colors for different modalities
const COLORS = {
  pose: { primary: '#00d9ff', secondary: 'rgba(0, 217, 255, 0.5)', connection: 'rgba(0, 217, 255, 0.3)' },
  leftHand: { primary: '#ff6b6b', secondary: 'rgba(255, 107, 107, 0.5)', connection: 'rgba(255, 107, 107, 0.3)' },
  rightHand: { primary: '#4ecdc4', secondary: 'rgba(78, 205, 196, 0.5)', connection: 'rgba(78, 205, 196, 0.3)' },
  face: { primary: '#ffe66d', secondary: 'rgba(255, 230, 109, 0.5)', connection: 'rgba(255, 230, 109, 0.2)' },
  active: { primary: '#00ff88', secondary: 'rgba(0, 255, 136, 0.7)', glow: 'rgba(0, 255, 136, 0.3)' },
};

// Landmark names for labels
const POSE_LANDMARK_NAMES = [
  'Nose', 'L Eye In', 'L Eye', 'L Eye Out', 'R Eye In', 'R Eye', 'R Eye Out',
  'L Ear', 'R Ear', 'Mouth L', 'Mouth R', 'L Shoulder', 'R Shoulder',
  'L Elbow', 'R Elbow', 'L Wrist', 'R Wrist', 'L Pinky', 'R Pinky',
  'L Index', 'R Index', 'L Thumb', 'R Thumb', 'L Hip', 'R Hip',
  'L Knee', 'R Knee', 'L Ankle', 'R Ankle', 'L Heel', 'R Heel',
  'L Foot', 'R Foot'
];

const HAND_LANDMARK_NAMES = [
  'Wrist', 'Th CMC', 'Th MCP', 'Th IP', 'Th Tip',
  'Ix MCP', 'Ix PIP', 'Ix DIP', 'Ix Tip',
  'Md MCP', 'Md PIP', 'Md DIP', 'Md Tip',
  'Rn MCP', 'Rn PIP', 'Rn DIP', 'Rn Tip',
  'Pk MCP', 'Pk PIP', 'Pk DIP', 'Pk Tip'
];

function TrackingOverlay({
  frame,
  profile,
  width,
  height,
  containerWidth,
  containerHeight,
  showAllLandmarks = true,
  showConnections = true,
  showLabels = false,
}: TrackingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate the actual displayed video area within the container
  // This accounts for object-fit: cover (video fills container, may be cropped)
  const getDisplayBounds = useCallback(() => {
    const cw = containerWidth || width;
    const ch = containerHeight || height;

    const videoAspect = width / height;
    const containerAspect = cw / ch;

    let displayWidth: number;
    let displayHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (videoAspect > containerAspect) {
      // Video is wider than container - video height fills, width is cropped
      displayHeight = ch;
      displayWidth = ch * videoAspect;
      offsetX = (cw - displayWidth) / 2; // Negative offset (cropped sides)
      offsetY = 0;
    } else {
      // Video is taller than container - video width fills, height is cropped
      displayWidth = cw;
      displayHeight = cw / videoAspect;
      offsetX = 0;
      offsetY = (ch - displayHeight) / 2; // Negative offset (cropped top/bottom)
    }

    return { displayWidth, displayHeight, offsetX, offsetY };
  }, [width, height, containerWidth, containerHeight]);

  // Check if a landmark index is tracked
  const isTrackedPose = useCallback(
    (index: number): TrackedFeature | undefined => {
      return profile?.trackedFeatures.find(
        (f) => f.modality === 'pose' && f.landmarkIndex === index
      );
    },
    [profile]
  );

  const isTrackedHand = useCallback(
    (hand: 'left' | 'right', index: number): TrackedFeature | undefined => {
      const modality = hand === 'left' ? 'leftHand' : 'rightHand';
      return profile?.trackedFeatures.find(
        (f) => f.modality === modality && f.landmarkIndex === index
      );
    },
    [profile]
  );

  const isTrackedFace = useCallback(
    (index: number): TrackedFeature | undefined => {
      return profile?.trackedFeatures.find(
        (f) => f.modality === 'face' && f.landmarkIndex === index
      );
    },
    [profile]
  );

  // Draw the overlay
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = containerWidth || width;
    const canvasHeight = containerHeight || height;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!frame) return;

    // Get display bounds for proper coordinate mapping
    const { displayWidth, displayHeight, offsetX, offsetY } = getDisplayBounds();

    // Helper to convert normalized coords to canvas coords
    const toCanvasX = (normX: number) => offsetX + normX * displayWidth;
    const toCanvasY = (normY: number) => offsetY + normY * displayHeight;

    // Draw pose
    if (frame.pose && profile?.activeModalities.pose !== false) {
      // Draw connections
      if (showConnections) {
        ctx.strokeStyle = COLORS.pose.connection;
        ctx.lineWidth = 2;
        for (const [start, end] of POSE_CONNECTIONS) {
          const p1 = frame.pose.landmarks[start];
          const p2 = frame.pose.landmarks[end];
          if (p1 && p2 && (p1.visibility ?? 0) > 0.5 && (p2.visibility ?? 0) > 0.5) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(p1.x), toCanvasY(p1.y));
            ctx.lineTo(toCanvasX(p2.x), toCanvasY(p2.y));
            ctx.stroke();
          }
        }
      }

      // Draw landmarks
      frame.pose.landmarks.forEach((landmark, index) => {
        if ((landmark.visibility ?? 0) < 0.5) return;

        const x = toCanvasX(landmark.x);
        const y = toCanvasY(landmark.y);
        const tracked = isTrackedPose(index);

        if (tracked) {
          // Highlighted tracked landmark
          drawTrackedLandmark(ctx, x, y, tracked.role);
        } else if (showAllLandmarks) {
          // Regular landmark
          ctx.fillStyle = COLORS.pose.secondary;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw label if enabled
        if (showLabels && POSE_LANDMARK_NAMES[index]) {
          drawLandmarkLabel(ctx, x, y, POSE_LANDMARK_NAMES[index], COLORS.pose.primary);
        }
      });
    }

    // Draw hands
    const drawHand = (landmarks: typeof frame.leftHand, hand: 'left' | 'right') => {
      if (!landmarks) return;

      const colors = hand === 'left' ? COLORS.leftHand : COLORS.rightHand;

      // Draw connections
      if (showConnections) {
        ctx.strokeStyle = colors.connection;
        ctx.lineWidth = 1.5;
        for (const [start, end] of HAND_CONNECTIONS) {
          const p1 = landmarks.landmarks[start];
          const p2 = landmarks.landmarks[end];
          if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(toCanvasX(p1.x), toCanvasY(p1.y));
            ctx.lineTo(toCanvasX(p2.x), toCanvasY(p2.y));
            ctx.stroke();
          }
        }
      }

      // Draw landmarks (all same size, no large tracked dots)
      if (showAllLandmarks) {
        landmarks.landmarks.forEach((landmark, index) => {
          const x = toCanvasX(landmark.x);
          const y = toCanvasY(landmark.y);
          ctx.fillStyle = colors.secondary;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Draw label if enabled (only for key points to avoid clutter)
          if (showLabels && [0, 4, 8, 12, 16, 20].includes(index) && HAND_LANDMARK_NAMES[index]) {
            drawLandmarkLabel(ctx, x, y, HAND_LANDMARK_NAMES[index], colors.primary);
          }
        });
      }

      // Draw pinch indicator if thumb and index are close
      const thumbTip = landmarks.landmarks[HAND_LANDMARKS.THUMB_TIP];
      const indexTip = landmarks.landmarks[HAND_LANDMARKS.INDEX_TIP];
      if (thumbTip && indexTip) {
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.05) {
          // Pinch detected - draw connecting line
          ctx.strokeStyle = COLORS.active.primary;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(toCanvasX(thumbTip.x), toCanvasY(thumbTip.y));
          ctx.lineTo(toCanvasX(indexTip.x), toCanvasY(indexTip.y));
          ctx.stroke();
        }
      }
    };

    if (profile?.activeModalities.leftHand !== false) {
      drawHand(frame.leftHand, 'left');
    }
    if (profile?.activeModalities.rightHand !== false) {
      drawHand(frame.rightHand, 'right');
    }

    // Draw face (simplified - just key points, no nose dot)
    if (frame.face && profile?.activeModalities.face !== false) {
      const keyFacePoints = [
        FACE_LANDMARKS.LEFT_EYE_OUTER,
        FACE_LANDMARKS.RIGHT_EYE_OUTER,
        FACE_LANDMARKS.LEFT_EYE_UPPER,
        FACE_LANDMARKS.RIGHT_EYE_UPPER,
      ];

      for (const index of keyFacePoints) {
        const landmark = frame.face.landmarks[index];
        if (!landmark) continue;

        const x = toCanvasX(landmark.x);
        const y = toCanvasY(landmark.y);
        const tracked = isTrackedFace(index);

        if (tracked) {
          drawTrackedLandmark(ctx, x, y, tracked.role);
        } else if (showAllLandmarks) {
          ctx.fillStyle = COLORS.face.secondary;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw expression indicators from blendshapes
      if (frame.face.blendshapes) {
        const eyeBlink = frame.face.blendshapes.find((b) => b.categoryName === 'eyeBlinkLeft');
        const browUp = frame.face.blendshapes.find((b) => b.categoryName === 'browInnerUp');
        const jawOpen = frame.face.blendshapes.find((b) => b.categoryName === 'jawOpen');

        // Show expression bar in top-right of video area
        let expressionY = offsetY + 30;
        const expressionX = offsetX + displayWidth - 100;

        if (eyeBlink && eyeBlink.score > 0.3) {
          drawExpressionBar(ctx, expressionX, expressionY, 'Blink', eyeBlink.score);
          expressionY += 20;
        }
        if (browUp && browUp.score > 0.3) {
          drawExpressionBar(ctx, expressionX, expressionY, 'Brow', browUp.score);
          expressionY += 20;
        }
        if (jawOpen && jawOpen.score > 0.2) {
          drawExpressionBar(ctx, expressionX, expressionY, 'Mouth', jawOpen.score);
        }
      }
    }
  }, [frame, profile, width, height, containerWidth, containerHeight, showAllLandmarks, showConnections, showLabels, isTrackedPose, isTrackedHand, isTrackedFace, getDisplayBounds]);

  // Draw a tracked landmark with role-specific styling
  function drawTrackedLandmark(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    role: TrackedFeature['role']
  ) {
    const size = role === 'continuous' ? 12 : role === 'trigger' ? 10 : 8;
    const color = role === 'continuous' ? COLORS.active : COLORS.pose;

    // Outer glow
    ctx.fillStyle = 'glow' in color ? color.glow : color.secondary;
    ctx.beginPath();
    ctx.arc(x, y, size + 6, 0, Math.PI * 2);
    ctx.fill();

    // Middle ring
    ctx.fillStyle = color.secondary;
    ctx.beginPath();
    ctx.arc(x, y, size + 2, 0, Math.PI * 2);
    ctx.fill();

    // Inner dot
    ctx.fillStyle = color.primary;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Center highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(x - size / 3, y - size / 3, size / 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw expression indicator bar
  function drawExpressionBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: number
  ) {
    const barWidth = 80;
    const barHeight = 12;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, barWidth, barHeight);

    // Fill
    ctx.fillStyle = COLORS.active.primary;
    ctx.fillRect(x, y, barWidth * value, barHeight);

    // Label
    ctx.fillStyle = 'white';
    ctx.font = '10px sans-serif';
    ctx.fillText(label, x + 4, y + 10);
  }

  // Draw landmark label
  function drawLandmarkLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    color: string
  ) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Background for better readability
    const textMetrics = ctx.measureText(label);
    const padding = 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      x + 8 - padding,
      y - 6 - padding,
      textMetrics.width + padding * 2,
      12 + padding * 2
    );

    // Text
    ctx.fillStyle = color;
    ctx.fillText(label, x + 8, y);
  }

  // Redraw on frame update - draw synchronously for minimum latency
  useLayoutEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth || width}
      height={containerHeight || height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        // Note: No mirroring needed here - landmark coordinates are already
        // pre-mirrored by the detectors to match the mirrored video display
      }}
      aria-hidden="true"
    />
  );
}

export default TrackingOverlay;
