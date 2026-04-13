/**
 * Input Profile Manager
 *
 * Handles CRUD operations for user-defined input profiles.
 * Profiles are stored in localStorage and can be exported/imported.
 *
 * Key principle: The system NEVER infers mobility level from motion.
 * Users define their own preferences through profiles.
 */

import type { InputProfile } from '../state/types';
import { DEFAULT_PRESETS, clonePreset } from './presets';

const STORAGE_KEY = 'admi-input-profiles';
const ACTIVE_PROFILE_KEY = 'admi-active-profile';

export class InputProfileManager {
  private profiles: Map<string, InputProfile> = new Map();
  private activeProfileId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load profiles from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const profiles: InputProfile[] = JSON.parse(stored);
        profiles.forEach((p) => this.profiles.set(p.id, p));
      }

      // Load active profile ID
      this.activeProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
    } catch (error) {
      console.error('Failed to load input profiles:', error);
    }
  }

  /**
   * Save profiles to localStorage
   */
  private saveToStorage(): void {
    try {
      const profiles = Array.from(this.profiles.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));

      if (this.activeProfileId) {
        localStorage.setItem(ACTIVE_PROFILE_KEY, this.activeProfileId);
      } else {
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
      }
    } catch (error) {
      console.error('Failed to save input profiles:', error);
    }
  }

  /**
   * Get all available profiles (user-created + presets)
   */
  getAllProfiles(): InputProfile[] {
    // Combine presets with user profiles
    const userProfiles = Array.from(this.profiles.values());
    return [...DEFAULT_PRESETS, ...userProfiles];
  }

  /**
   * Get only user-created profiles
   */
  getUserProfiles(): InputProfile[] {
    return Array.from(this.profiles.values()).filter((p) => !p.isPreset);
  }

  /**
   * Get only preset profiles
   */
  getPresets(): InputProfile[] {
    return DEFAULT_PRESETS;
  }

  /**
   * Get a profile by ID (checks both presets and user profiles)
   */
  getProfile(id: string): InputProfile | null {
    // Check presets first
    const preset = DEFAULT_PRESETS.find((p) => p.id === id);
    if (preset) return preset;

    // Then check user profiles
    return this.profiles.get(id) ?? null;
  }

  /**
   * Create a new profile
   */
  createProfile(profile: Omit<InputProfile, 'id' | 'createdAt' | 'updatedAt'>): InputProfile {
    const newProfile: InputProfile = {
      ...profile,
      id: `profile_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.profiles.set(newProfile.id, newProfile);
    this.saveToStorage();
    return newProfile;
  }

  /**
   * Save/update a profile
   */
  saveProfile(profile: InputProfile): void {
    const updated: InputProfile = {
      ...profile,
      updatedAt: Date.now(),
    };
    this.profiles.set(updated.id, updated);
    this.saveToStorage();
  }

  /**
   * Delete a profile
   */
  deleteProfile(id: string): boolean {
    // Cannot delete presets
    const profile = this.profiles.get(id);
    if (!profile || profile.isPreset) {
      return false;
    }

    this.profiles.delete(id);

    // Clear active profile if it was deleted
    if (this.activeProfileId === id) {
      this.activeProfileId = null;
    }

    this.saveToStorage();
    return true;
  }

  /**
   * Clone a preset or profile with a new name
   */
  cloneProfile(id: string, newName: string): InputProfile | null {
    const source = this.getProfile(id);
    if (!source) return null;

    const cloned = clonePreset(source, newName);
    this.profiles.set(cloned.id, cloned);
    this.saveToStorage();
    return cloned;
  }

  /**
   * Set the active profile
   */
  setActiveProfile(id: string | null): InputProfile | null {
    if (id === null) {
      this.activeProfileId = null;
      this.saveToStorage();
      return null;
    }

    const profile = this.getProfile(id);
    if (profile) {
      this.activeProfileId = id;
      this.saveToStorage();
    }
    return profile;
  }

  /**
   * Get the currently active profile
   */
  getActiveProfile(): InputProfile | null {
    if (!this.activeProfileId) return null;
    return this.getProfile(this.activeProfileId);
  }

  /**
   * Export profiles as JSON string
   */
  exportProfiles(): string {
    const profiles = this.getUserProfiles();
    return JSON.stringify(profiles, null, 2);
  }

  /**
   * Import profiles from JSON string
   */
  importProfiles(json: string): number {
    try {
      const profiles: InputProfile[] = JSON.parse(json);
      let imported = 0;

      for (const profile of profiles) {
        // Validate profile structure
        if (!this.isValidProfile(profile)) {
          console.warn('Invalid profile skipped:', profile);
          continue;
        }

        // Generate new ID to avoid conflicts
        const newProfile: InputProfile = {
          ...profile,
          id: `imported_${Date.now()}_${imported}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPreset: false,
        };

        this.profiles.set(newProfile.id, newProfile);
        imported++;
      }

      if (imported > 0) {
        this.saveToStorage();
      }

      return imported;
    } catch (error) {
      console.error('Failed to import profiles:', error);
      return 0;
    }
  }

  /**
   * Validate profile structure
   */
  private isValidProfile(profile: unknown): profile is InputProfile {
    if (typeof profile !== 'object' || profile === null) return false;

    const p = profile as Record<string, unknown>;
    return (
      typeof p.name === 'string' &&
      typeof p.activeModalities === 'object' &&
      Array.isArray(p.trackedFeatures) &&
      typeof p.movementSettings === 'object'
    );
  }

  /**
   * Create a blank profile template
   */
  createBlankProfile(name: string): InputProfile {
    return this.createProfile({
      name,
      description: '',
      activeModalities: {
        pose: true,
        leftHand: false,
        rightHand: false,
        face: false,
        color: false,
      },
      trackedFeatures: [],
      gestures: [],
      movementSettings: {
        smoothingLevel: 'medium',
        velocityThreshold: 0.01,
        stabilityFrames: 3,
        dwellEnabled: false,
        dwellTimeMs: 500,
      },
      sensitivity: 1.0,
      isPreset: false,
    });
  }
}

// Singleton instance
let profileManagerInstance: InputProfileManager | null = null;

export function getInputProfileManager(): InputProfileManager {
  if (!profileManagerInstance) {
    profileManagerInstance = new InputProfileManager();
  }
  return profileManagerInstance;
}
