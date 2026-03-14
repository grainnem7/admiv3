/**
 * useGestureSounds - Hook to detect gestures and trigger mapped sounds
 *
 * Monitors tracking frames for gestures and plays the corresponding
 * instrument sounds based on the user's gesture-to-sound mappings.
 */

import { useRef, useCallback } from 'react';
import type { TrackingFrame } from '../state/types';
import type { GestureSoundMapping, GestureType } from '../state/instrumentZones';
import { getInstrumentSampler } from '../sound/InstrumentSampler';
import { GESTURE_THRESHOLDS, FACE_BLENDSHAPES } from '../utils/constants';
import { MIDIOutput } from '../midi';
import { getSequencer } from '../music/Sequencer';
import { useAppStore } from '../state/store';

/**
 * Get base MIDI note for an instrument type
 */
function getBaseMidiNoteForInstrument(instrumentType: string): number {
  const noteMap: Record<string, number> = {
    'kick': 36,      // C1 - Standard kick
    'snare': 38,     // D1 - Standard snare
    'hihat': 42,     // F#1 - Closed hi-hat
    'cymbal': 49,    // C#2 - Crash cymbal
    'tom': 45,       // A1 - Low tom
    'clap': 39,      // D#1 - Hand clap
    'piano-low': 36, // C2 - Low piano
    'piano-mid': 60, // C4 - Middle C
    'piano-high': 84,// C6 - High piano
    'synth-pad': 60, // C4
    'bell': 72,      // C5
    'woodblock': 76, // E5
  };
  return noteMap[instrumentType] ?? 60;
}

interface GestureState {
  wasActive: boolean;
  lastTriggered: number;
}

interface UseGestureSoundsReturn {
  /** Check frame for gestures and trigger sounds */
  checkGestures: (frame: TrackingFrame, mappings: GestureSoundMapping[], isMuted: boolean) => void;
}

export function useGestureSounds(): UseGestureSoundsReturn {
  const gestureStates = useRef<Map<GestureType, GestureState>>(new Map());
  const confidenceThreshold = useAppStore((s) => s.musicSettings.confidenceThreshold);

  // Get or create gesture state
  const getState = useCallback((gestureType: GestureType): GestureState => {
    if (!gestureStates.current.has(gestureType)) {
      gestureStates.current.set(gestureType, {
        wasActive: false,
        lastTriggered: 0,
      });
    }
    return gestureStates.current.get(gestureType)!;
  }, []);

  // Detect pinch gesture
  const detectPinch = useCallback((frame: TrackingFrame, hand: 'left' | 'right'): boolean => {
    const handData = hand === 'left' ? frame.leftHand : frame.rightHand;
    if (!handData) return false;

    // Check confidence against music settings threshold
    if (handData.confidence < confidenceThreshold) return false;

    const thumbTip = handData.landmarks[4]; // Thumb tip
    const indexTip = handData.landmarks[8]; // Index tip

    if (!thumbTip || !indexTip) return false;

    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = (thumbTip.z || 0) - (indexTip.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance < GESTURE_THRESHOLDS.PINCH_DISTANCE;
  }, [confidenceThreshold]);

  // Detect blink (both eyes)
  const detectBlink = useCallback((frame: TrackingFrame): boolean => {
    if (!frame.face?.blendshapes) {
      // Debug: log occasionally when no face data
      if (Date.now() % 3000 < 50) {
        console.log('[GestureSounds] No face blendshapes available - ensure face tracking is enabled in Input Profile');
      }
      return false;
    }

    const leftBlink = frame.face.blendshapes.find(
      b => b.categoryName === FACE_BLENDSHAPES.EYE_BLINK_LEFT
    );
    const rightBlink = frame.face.blendshapes.find(
      b => b.categoryName === FACE_BLENDSHAPES.EYE_BLINK_RIGHT
    );

    if (!leftBlink || !rightBlink) return false;

    const avgBlink = (leftBlink.score + rightBlink.score) / 2;

    // Debug: log blink values occasionally
    if (Date.now() % 2000 < 50) {
      console.log(`[GestureSounds] Blink values: L=${leftBlink.score.toFixed(2)}, R=${rightBlink.score.toFixed(2)}, avg=${avgBlink.toFixed(2)}, threshold=${GESTURE_THRESHOLDS.BLINK_THRESHOLD}`);
    }

    return avgBlink > GESTURE_THRESHOLDS.BLINK_THRESHOLD;
  }, []);

  // Detect wink (single eye) - improved detection
  const detectWink = useCallback((frame: TrackingFrame, eye: 'left' | 'right'): boolean => {
    if (!frame.face?.blendshapes) return false;

    // Get blendshape names for target eye and other eye
    const blinkName = eye === 'left'
      ? FACE_BLENDSHAPES.EYE_BLINK_LEFT
      : FACE_BLENDSHAPES.EYE_BLINK_RIGHT;
    const otherBlinkName = eye === 'left'
      ? FACE_BLENDSHAPES.EYE_BLINK_RIGHT
      : FACE_BLENDSHAPES.EYE_BLINK_LEFT;
    const otherSquintName = eye === 'left'
      ? FACE_BLENDSHAPES.EYE_SQUINT_RIGHT
      : FACE_BLENDSHAPES.EYE_SQUINT_LEFT;

    const blink = frame.face.blendshapes.find(b => b.categoryName === blinkName);
    const otherBlink = frame.face.blendshapes.find(b => b.categoryName === otherBlinkName);
    const otherSquint = frame.face.blendshapes.find(b => b.categoryName === otherSquintName);

    if (!blink || !otherBlink) return false;

    // Wink conditions:
    // 1. Target eye must be closed (above closed threshold)
    // 2. Other eye must be open (below open max threshold)
    // 3. Other eye should not be squinting too much (filters out asymmetric blinks)
    const targetClosed = blink.score > GESTURE_THRESHOLDS.WINK_CLOSED_THRESHOLD;
    const otherOpen = otherBlink.score < GESTURE_THRESHOLDS.WINK_OPEN_MAX_THRESHOLD;
    const otherNotSquinting = !otherSquint || otherSquint.score < GESTURE_THRESHOLDS.WINK_SQUINT_MAX;

    return targetClosed && otherOpen && otherNotSquinting;
  }, []);

  // Detect eyebrow raise
  const detectBrowRaise = useCallback((frame: TrackingFrame): boolean => {
    if (!frame.face?.blendshapes) return false;

    const browUp = frame.face.blendshapes.find(
      b => b.categoryName === FACE_BLENDSHAPES.BROW_INNER_UP
    );

    if (!browUp) return false;

    return browUp.score > GESTURE_THRESHOLDS.BROW_RAISE_THRESHOLD;
  }, []);

  // Detect mouth open
  const detectMouthOpen = useCallback((frame: TrackingFrame): boolean => {
    if (!frame.face?.blendshapes) return false;

    const jawOpen = frame.face.blendshapes.find(
      b => b.categoryName === FACE_BLENDSHAPES.JAW_OPEN
    );

    if (!jawOpen) return false;

    return jawOpen.score > GESTURE_THRESHOLDS.MOUTH_OPEN_THRESHOLD;
  }, []);

  // Check if gesture is active
  const isGestureActive = useCallback((frame: TrackingFrame, gestureType: GestureType): boolean => {
    switch (gestureType) {
      case 'pinch-right':
        return detectPinch(frame, 'right');
      case 'pinch-left':
        return detectPinch(frame, 'left');
      case 'blink':
        return detectBlink(frame);
      case 'wink-left':
        return detectWink(frame, 'left');
      case 'wink-right':
        return detectWink(frame, 'right');
      case 'brow-raise':
        return detectBrowRaise(frame);
      case 'mouth-open':
        return detectMouthOpen(frame);
      default:
        return false;
    }
  }, [detectPinch, detectBlink, detectWink, detectBrowRaise, detectMouthOpen]);

  // Main check function
  const checkGestures = useCallback((
    frame: TrackingFrame,
    mappings: GestureSoundMapping[],
    isMuted: boolean
  ) => {
    if (isMuted || mappings.length === 0) return;

    const now = Date.now();
    const sampler = getInstrumentSampler();

    for (const mapping of mappings) {
      if (!mapping.enabled) continue;

      const state = getState(mapping.gestureType);
      const isActive = isGestureActive(frame, mapping.gestureType);

      // Rising edge detection: trigger only when gesture becomes active
      const shouldTrigger = isActive && !state.wasActive;

      // Check cooldown
      const cooldownElapsed = now - state.lastTriggered > mapping.cooldownMs;

      if (shouldTrigger && cooldownElapsed) {
        console.log(`[GestureSounds] TRIGGERED! gesture=${mapping.gestureType} -> ${mapping.instrumentType}`);
        // Trigger the internal sound
        sampler.trigger(mapping.instrumentType, mapping.soundSettings.volume, mapping.soundSettings);
        state.lastTriggered = now;

        // Also send to MIDI output
        const midiNote = getBaseMidiNoteForInstrument(mapping.instrumentType) +
                        (mapping.soundSettings.pitchOffset ?? 0);
        const velocity = mapping.soundSettings.volume;
        const channel = MIDIOutput.getConfig().channels.gesture;

        MIDIOutput.sendNoteOn(midiNote, velocity * 127, channel);
        // Send note off after a short duration
        setTimeout(() => {
          MIDIOutput.sendNoteOff(midiNote, 0, channel);
        }, 200);

        // Record to sequencer if recording is enabled
        const sequencer = getSequencer();
        if (sequencer.isRecording()) {
          sequencer.recordNote(midiNote, velocity);
        }
      }

      // Update state
      state.wasActive = isActive;
    }
  }, [getState, isGestureActive]);

  return { checkGestures };
}
