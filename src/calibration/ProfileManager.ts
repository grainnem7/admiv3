/**
 * Profile Manager - Save/load user profiles to localStorage
 */

import type { UserProfile } from '../state/types';

const STORAGE_KEY = 'admi_profiles';

export class ProfileManager {
  /**
   * Save a profile
   */
  static save(profile: UserProfile): void {
    const profiles = this.loadAll();
    const existingIndex = profiles.findIndex((p) => p.id === profile.id);

    if (existingIndex >= 0) {
      profiles[existingIndex] = { ...profile, updatedAt: Date.now() };
    } else {
      profiles.push(profile);
    }

    this.saveAll(profiles);
  }

  /**
   * Load a profile by ID
   */
  static load(id: string): UserProfile | null {
    const profiles = this.loadAll();
    return profiles.find((p) => p.id === id) ?? null;
  }

  /**
   * Load all profiles
   */
  static loadAll(): UserProfile[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const profiles = JSON.parse(stored);
      if (!Array.isArray(profiles)) return [];

      return profiles.filter(this.isValidProfile);
    } catch (error) {
      console.error('Error loading profiles:', error);
      return [];
    }
  }

  /**
   * Delete a profile
   */
  static delete(id: string): boolean {
    const profiles = this.loadAll();
    const filtered = profiles.filter((p) => p.id !== id);

    if (filtered.length === profiles.length) {
      return false; // Profile not found
    }

    this.saveAll(filtered);
    return true;
  }

  /**
   * Delete all profiles
   */
  static deleteAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Export profiles as JSON string
   */
  static export(): string {
    const profiles = this.loadAll();
    return JSON.stringify(profiles, null, 2);
  }

  /**
   * Import profiles from JSON string
   */
  static import(jsonString: string): number {
    try {
      const imported = JSON.parse(jsonString);
      if (!Array.isArray(imported)) {
        throw new Error('Invalid profile data');
      }

      const validProfiles = imported.filter(this.isValidProfile);
      const existingProfiles = this.loadAll();

      // Merge, preferring imported versions
      const merged = [...existingProfiles];
      for (const profile of validProfiles) {
        const existingIndex = merged.findIndex((p) => p.id === profile.id);
        if (existingIndex >= 0) {
          merged[existingIndex] = profile;
        } else {
          merged.push(profile);
        }
      }

      this.saveAll(merged);
      return validProfiles.length;
    } catch (error) {
      console.error('Error importing profiles:', error);
      throw new Error('Failed to import profiles');
    }
  }

  /**
   * Save all profiles
   */
  private static saveAll(profiles: UserProfile[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (error) {
      console.error('Error saving profiles:', error);
      throw new Error('Failed to save profiles');
    }
  }

  /**
   * Validate profile structure
   */
  private static isValidProfile(profile: unknown): profile is UserProfile {
    if (!profile || typeof profile !== 'object') return false;

    const p = profile as Record<string, unknown>;

    return (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.createdAt === 'number' &&
      typeof p.restPosition === 'object' &&
      p.restPosition !== null &&
      typeof (p.restPosition as Record<string, unknown>).x === 'number' &&
      typeof (p.restPosition as Record<string, unknown>).y === 'number'
    );
  }
}
