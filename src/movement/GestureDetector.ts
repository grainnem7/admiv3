/**
 * Gesture Detector
 *
 * Detects discrete gestures from TrackingFrame:
 * - Pinch (thumb to index finger)
 * - Blink (eye closure)
 * - Eyebrow raise
 * - Mouth open
 * - Thumb-to-finger touches
 * - Custom gestures
 */

import type {
  TrackingFrame,
  GestureDefinition,
  DetectedGesture,
  HandLandmarks,
  FaceLandmarks,
} from '../state/types';
import {
  HAND_LANDMARKS,
  FACE_BLENDSHAPES,
  GESTURE_THRESHOLDS,
} from '../utils/constants';

interface GestureState {
  lastTriggered: number;
  lastValue: number;
  wasActive: boolean;
}

export class GestureDetector {
  private gestures: Map<string, GestureDefinition> = new Map();
  private gestureStates: Map<string, GestureState> = new Map();

  /**
   * Register a gesture for detection
   */
  registerGesture(gesture: GestureDefinition): void {
    this.gestures.set(gesture.id, gesture);
    this.gestureStates.set(gesture.id, {
      lastTriggered: 0,
      lastValue: 0,
      wasActive: false,
    });
  }

  /**
   * Register multiple gestures
   */
  registerGestures(gestures: GestureDefinition[]): void {
    for (const gesture of gestures) {
      this.registerGesture(gesture);
    }
  }

  /**
   * Unregister a gesture
   */
  unregisterGesture(gestureId: string): void {
    this.gestures.delete(gestureId);
    this.gestureStates.delete(gestureId);
  }

  /**
   * Clear all registered gestures
   */
  clearGestures(): void {
    this.gestures.clear();
    this.gestureStates.clear();
  }

  /**
   * Detect all registered gestures from a tracking frame
   */
  detect(frame: TrackingFrame): DetectedGesture[] {
    const results: DetectedGesture[] = [];
    const now = frame.timestamp;

    for (const [id, gesture] of this.gestures) {
      const state = this.gestureStates.get(id)!;

      // Check cooldown
      if (now - state.lastTriggered < gesture.cooldownMs) {
        continue;
      }

      // Detect based on gesture type
      const value = this.detectGestureValue(frame, gesture);
      const isActive = value >= gesture.threshold;

      // Check for trigger (rising edge detection)
      const triggered = isActive && !state.wasActive;

      if (triggered) {
        state.lastTriggered = now;
      }

      state.lastValue = value;
      state.wasActive = isActive;

      // Always report gesture state (for continuous tracking)
      results.push({
        gestureId: id,
        type: gesture.type,
        value,
        triggered,
        timestamp: now,
      });
    }

    return results;
  }

  /**
   * Get the raw value for a gesture type
   */
  private detectGestureValue(frame: TrackingFrame, gesture: GestureDefinition): number {
    switch (gesture.type) {
      case 'pinch':
        return this.detectPinchValue(frame, gesture.hand);

      case 'blink':
        return this.detectBlinkValue(frame);

      case 'browRaise':
        return this.detectBrowRaiseValue(frame);

      case 'mouthOpen':
        return this.detectMouthOpenValue(frame);

      case 'thumbToFinger':
        return this.detectThumbToFingerValue(frame, gesture.hand);

      case 'headNod':
        return this.detectHeadNodValue(frame);

      case 'custom':
        return 0; // Custom gestures need external detection

      default:
        return 0;
    }
  }

  /**
   * Detect pinch gesture (thumb tip to index tip distance)
   */
  private detectPinchValue(frame: TrackingFrame, hand?: 'left' | 'right' | 'either'): number {
    const checkHand = (handData: HandLandmarks | null): number => {
      if (!handData) return 0;

      const thumbTip = handData.landmarks[HAND_LANDMARKS.THUMB_TIP];
      const indexTip = handData.landmarks[HAND_LANDMARKS.INDEX_TIP];

      if (!thumbTip || !indexTip) return 0;

      const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow(thumbTip.z - indexTip.z, 2)
      );

      // Invert: smaller distance = higher pinch value
      // Normalize to 0-1 range (typical pinch distance is 0-0.15)
      return Math.max(0, 1 - distance / GESTURE_THRESHOLDS.PINCH_DISTANCE / 3);
    };

    switch (hand) {
      case 'left':
        return checkHand(frame.leftHand);
      case 'right':
        return checkHand(frame.rightHand);
      case 'either':
      default:
        return Math.max(checkHand(frame.leftHand), checkHand(frame.rightHand));
    }
  }

  /**
   * Detect blink using face blendshapes
   */
  private detectBlinkValue(frame: TrackingFrame): number {
    if (!frame.face?.blendshapes) return 0;

    const leftBlink = this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.EYE_BLINK_LEFT);
    const rightBlink = this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.EYE_BLINK_RIGHT);

    // Return average of both eyes (intentional blink usually affects both)
    return (leftBlink + rightBlink) / 2;
  }

  /**
   * Detect eyebrow raise using face blendshapes
   */
  private detectBrowRaiseValue(frame: TrackingFrame): number {
    if (!frame.face?.blendshapes) return 0;

    const innerUp = this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.BROW_INNER_UP);
    const leftOuterUp = this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.BROW_OUTER_UP_LEFT);
    const rightOuterUp = this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.BROW_OUTER_UP_RIGHT);

    // Combine all brow-up indicators
    return Math.max(innerUp, (leftOuterUp + rightOuterUp) / 2);
  }

  /**
   * Detect mouth open using face blendshapes
   */
  private detectMouthOpenValue(frame: TrackingFrame): number {
    if (!frame.face?.blendshapes) return 0;

    return this.getBlendshapeValue(frame.face, FACE_BLENDSHAPES.JAW_OPEN);
  }

  /**
   * Detect thumb touching any finger (not just index)
   */
  private detectThumbToFingerValue(frame: TrackingFrame, hand?: 'left' | 'right' | 'either'): number {
    const checkHand = (handData: HandLandmarks | null): number => {
      if (!handData) return 0;

      const thumbTip = handData.landmarks[HAND_LANDMARKS.THUMB_TIP];
      if (!thumbTip) return 0;

      // Check distance to each finger tip
      const fingerTips = [
        HAND_LANDMARKS.INDEX_TIP,
        HAND_LANDMARKS.MIDDLE_TIP,
        HAND_LANDMARKS.RING_TIP,
        HAND_LANDMARKS.PINKY_TIP,
      ];

      let minDistance = Infinity;
      for (const tipIndex of fingerTips) {
        const fingerTip = handData.landmarks[tipIndex];
        if (!fingerTip) continue;

        const distance = Math.sqrt(
          Math.pow(thumbTip.x - fingerTip.x, 2) +
          Math.pow(thumbTip.y - fingerTip.y, 2) +
          Math.pow(thumbTip.z - fingerTip.z, 2)
        );

        minDistance = Math.min(minDistance, distance);
      }

      if (minDistance === Infinity) return 0;

      // Invert and normalize
      return Math.max(0, 1 - minDistance / GESTURE_THRESHOLDS.PINCH_DISTANCE / 3);
    };

    switch (hand) {
      case 'left':
        return checkHand(frame.leftHand);
      case 'right':
        return checkHand(frame.rightHand);
      case 'either':
      default:
        return Math.max(checkHand(frame.leftHand), checkHand(frame.rightHand));
    }
  }

  /**
   * Detect head nod (vertical head movement)
   */
  private detectHeadNodValue(_frame: TrackingFrame): number {
    // This would need position history to detect nodding motion
    // For now, return 0 - can be enhanced later
    return 0;
  }

  /**
   * Helper to get a blendshape value from face landmarks
   */
  private getBlendshapeValue(face: FaceLandmarks, categoryName: string): number {
    const blendshape = face.blendshapes.find((b) => b.categoryName === categoryName);
    return blendshape?.score ?? 0;
  }

  /**
   * Get current state of a gesture
   */
  getGestureState(gestureId: string): GestureState | null {
    return this.gestureStates.get(gestureId) ?? null;
  }

  /**
   * Check if a specific gesture is currently active
   */
  isGestureActive(gestureId: string): boolean {
    const state = this.gestureStates.get(gestureId);
    return state?.wasActive ?? false;
  }

  /**
   * Reset all gesture states
   */
  reset(): void {
    for (const state of this.gestureStates.values()) {
      state.lastTriggered = 0;
      state.lastValue = 0;
      state.wasActive = false;
    }
  }
}
