/**
 * Central state store using Zustand
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  AppActions,
  AccessibilityMode,
  ActiveModalities,
  CalibrationPhase,
  InputProfile,
  Note,
  PoseLandmarks,
  ProcessedFrame,
  ProcessedMovement,
  Screen,
  TrackingFrame,
  UserProfile,
} from './types';
import { AUDIO } from '../utils/constants';

const initialState: AppState = {
  // Tracking
  isTracking: false,
  landmarks: null,
  trackingConfidence: 0,
  cameraError: null,
  trackingFrame: null,
  activeModalities: {
    pose: true,
    leftHand: false,
    rightHand: false,
    face: false,
  },

  // Movement
  currentMovement: null,
  accessibilityMode: 'standard',
  sensitivityMultiplier: 1.0,
  processedFrame: null,

  // Input Profile
  activeInputProfile: null,
  availableInputProfiles: [],

  // Calibration
  calibrationPhase: 'idle',
  currentGestureIndex: 0,
  calibrationProgress: 0,

  // User Profile (legacy)
  userProfile: null,
  availableProfiles: [],

  // Sound
  isMuted: true, // Start muted for safety
  masterVolume: AUDIO.DEFAULT_VOLUME,
  currentSoundPreset: 'default',
  activeNotes: [],

  // UI
  currentScreen: 'welcome',
  showDebugPanel: false,
  isFullscreen: false,
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Tracking actions
      setTracking: (isTracking: boolean) => set({ isTracking }),

      setLandmarks: (landmarks: PoseLandmarks | null) =>
        set({
          landmarks,
          trackingConfidence: landmarks
            ? landmarks.landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) /
              landmarks.landmarks.length
            : 0,
        }),

      setCameraError: (error: string | null) => set({ cameraError: error }),

      setTrackingFrame: (frame: TrackingFrame | null) => set({ trackingFrame: frame }),

      setActiveModalities: (modalities: ActiveModalities) => set({ activeModalities: modalities }),

      // Movement actions
      setCurrentMovement: (movement: ProcessedMovement | null) =>
        set({ currentMovement: movement }),

      setAccessibilityMode: (mode: AccessibilityMode) =>
        set({ accessibilityMode: mode }),

      setSensitivity: (multiplier: number) =>
        set({ sensitivityMultiplier: Math.max(0.1, Math.min(5, multiplier)) }),

      setProcessedFrame: (frame: ProcessedFrame | null) => set({ processedFrame: frame }),

      // Input Profile actions
      setActiveInputProfile: (profile: InputProfile | null) => set({ activeInputProfile: profile }),

      saveInputProfile: (profile: InputProfile) =>
        set((state) => {
          const existing = state.availableInputProfiles.findIndex((p) => p.id === profile.id);
          const profiles =
            existing >= 0
              ? state.availableInputProfiles.map((p) =>
                  p.id === profile.id ? { ...profile, updatedAt: Date.now() } : p
                )
              : [...state.availableInputProfiles, { ...profile, updatedAt: Date.now() }];
          return { availableInputProfiles: profiles };
        }),

      deleteInputProfile: (id: string) =>
        set((state) => ({
          availableInputProfiles: state.availableInputProfiles.filter((p) => p.id !== id),
          activeInputProfile: state.activeInputProfile?.id === id ? null : state.activeInputProfile,
        })),

      loadInputProfile: (id: string) => {
        const profile = get().availableInputProfiles.find((p) => p.id === id);
        if (profile) {
          set({
            activeInputProfile: profile,
            activeModalities: profile.activeModalities,
            sensitivityMultiplier: profile.sensitivity,
          });
        }
      },

      // Calibration actions
      setCalibrationPhase: (phase: CalibrationPhase) =>
        set({ calibrationPhase: phase }),

      setCalibrationProgress: (progress: number) =>
        set({ calibrationProgress: Math.max(0, Math.min(1, progress)) }),

      nextGesture: () =>
        set((state) => ({
          currentGestureIndex: state.currentGestureIndex + 1,
          calibrationProgress: 0,
        })),

      resetCalibration: () =>
        set({
          calibrationPhase: 'idle',
          currentGestureIndex: 0,
          calibrationProgress: 0,
        }),

      // Profile actions
      setUserProfile: (profile: UserProfile | null) => set({ userProfile: profile }),

      saveProfile: (profile: UserProfile) =>
        set((state) => {
          const existing = state.availableProfiles.findIndex((p) => p.id === profile.id);
          const profiles =
            existing >= 0
              ? state.availableProfiles.map((p) =>
                  p.id === profile.id ? { ...profile, updatedAt: Date.now() } : p
                )
              : [...state.availableProfiles, { ...profile, updatedAt: Date.now() }];
          return { availableProfiles: profiles, userProfile: profile };
        }),

      loadProfile: (id: string) => {
        const profile = get().availableProfiles.find((p) => p.id === id);
        if (profile) {
          set({
            userProfile: profile,
            accessibilityMode: profile.accessibilityMode,
            sensitivityMultiplier: profile.sensitivity,
            currentSoundPreset: profile.soundPreset,
          });
        }
      },

      deleteProfile: (id: string) =>
        set((state) => ({
          availableProfiles: state.availableProfiles.filter((p) => p.id !== id),
          userProfile: state.userProfile?.id === id ? null : state.userProfile,
        })),

      // Sound actions
      setMuted: (muted: boolean) => set({ isMuted: muted }),

      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

      setMasterVolume: (volume: number) =>
        set({ masterVolume: Math.max(0, Math.min(AUDIO.MAX_SAFE_VOLUME, volume)) }),

      setSoundPreset: (presetId: string) => set({ currentSoundPreset: presetId }),

      addActiveNote: (note: Note) =>
        set((state) => ({ activeNotes: [...state.activeNotes, note] })),

      removeActiveNote: (noteId: string) =>
        set((state) => ({
          activeNotes: state.activeNotes.filter((n) => n.id !== noteId),
        })),

      clearActiveNotes: () => set({ activeNotes: [] }),

      // UI actions
      setCurrentScreen: (screen: Screen) => set({ currentScreen: screen }),

      toggleDebugPanel: () =>
        set((state) => ({ showDebugPanel: !state.showDebugPanel })),

      setFullscreen: (isFullscreen: boolean) => set({ isFullscreen }),

      // Global actions
      reset: () =>
        set({
          ...initialState,
          availableProfiles: get().availableProfiles, // Preserve profiles
        }),
    }),
    {
      name: 'admi-storage',
      partialize: (state) => ({
        // Only persist these fields
        availableProfiles: state.availableProfiles,
        accessibilityMode: state.accessibilityMode,
        sensitivityMultiplier: state.sensitivityMultiplier,
        masterVolume: state.masterVolume,
        currentSoundPreset: state.currentSoundPreset,
        // New input profile persistence
        availableInputProfiles: state.availableInputProfiles,
        activeModalities: state.activeModalities,
      }),
    }
  )
);

// Individual selectors - select primitive values to avoid infinite loops
export const useIsTracking = () => useAppStore((s) => s.isTracking);
export const useLandmarks = () => useAppStore((s) => s.landmarks);
export const useTrackingConfidence = () => useAppStore((s) => s.trackingConfidence);
export const useCameraError = () => useAppStore((s) => s.cameraError);

export const useCurrentMovement = () => useAppStore((s) => s.currentMovement);
export const useAccessibilityMode = () => useAppStore((s) => s.accessibilityMode);
export const useSensitivity = () => useAppStore((s) => s.sensitivityMultiplier);

export const useIsMuted = () => useAppStore((s) => s.isMuted);
export const useMasterVolume = () => useAppStore((s) => s.masterVolume);
export const useCurrentSoundPreset = () => useAppStore((s) => s.currentSoundPreset);
export const useActiveNotes = () => useAppStore((s) => s.activeNotes);

export const useCurrentScreen = () => useAppStore((s) => s.currentScreen);
export const useShowDebugPanel = () => useAppStore((s) => s.showDebugPanel);
export const useIsFullscreen = () => useAppStore((s) => s.isFullscreen);

export const useUserProfile = () => useAppStore((s) => s.userProfile);
export const useAvailableProfiles = () => useAppStore((s) => s.availableProfiles);

export const useCalibrationPhase = () => useAppStore((s) => s.calibrationPhase);
export const useCalibrationProgress = () => useAppStore((s) => s.calibrationProgress);

// New multi-modal tracking selectors
export const useTrackingFrame = () => useAppStore((s) => s.trackingFrame);
export const useActiveModalities = () => useAppStore((s) => s.activeModalities);
export const useProcessedFrame = () => useAppStore((s) => s.processedFrame);

// Input profile selectors
export const useActiveInputProfile = () => useAppStore((s) => s.activeInputProfile);
export const useAvailableInputProfiles = () => useAppStore((s) => s.availableInputProfiles);
