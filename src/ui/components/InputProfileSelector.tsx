/**
 * Input Profile Selector - Redesigned for cleaner UX
 *
 * Features:
 * - Grouped by category (Recommended, Expressive, Accessible)
 * - Cleaner visual design with modality indicators
 * - Compact mode for sidebar, expanded mode for main UI
 */

import { useState, useCallback, useMemo } from 'react';
import type { InputProfile, ProfileCategory } from '../../state/types';
import { DEFAULT_PRESETS } from '../../profiles/presets';

interface InputProfileSelectorProps {
  currentProfile: InputProfile | null;
  onProfileSelect: (profile: InputProfile) => void;
  customProfiles?: InputProfile[];
  showDetails?: boolean;
}

// Category display info
const CATEGORY_INFO: Record<ProfileCategory, { label: string; description: string }> = {
  recommended: {
    label: 'Recommended',
    description: 'Best for most users',
  },
  expressive: {
    label: 'Expressive',
    description: 'For creative exploration',
  },
  accessible: {
    label: 'Accessible',
    description: 'Minimal movement options',
  },
};

function InputProfileSelector({
  currentProfile,
  onProfileSelect,
  customProfiles = [],
  showDetails = false,
}: InputProfileSelectorProps) {
  const [expandedCategory, setExpandedCategory] = useState<ProfileCategory | null>('recommended');

  const allProfiles = useMemo(() => [...DEFAULT_PRESETS, ...customProfiles], [customProfiles]);

  // Group profiles by category
  const groupedProfiles = useMemo(() => {
    const groups: Record<ProfileCategory, InputProfile[]> = {
      recommended: [],
      expressive: [],
      accessible: [],
    };

    allProfiles.forEach((profile) => {
      const category = profile.category || 'recommended';
      groups[category].push(profile);
    });

    return groups;
  }, [allProfiles]);

  const handleSelect = useCallback(
    (profile: InputProfile) => {
      onProfileSelect(profile);
    },
    [onProfileSelect]
  );

  const toggleCategory = useCallback((category: ProfileCategory) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }, []);

  // Get modality icons as text
  const getModalityIndicators = (profile: InputProfile) => {
    const indicators: string[] = [];
    if (profile.activeModalities.pose) indicators.push('Body');
    if (profile.activeModalities.leftHand || profile.activeModalities.rightHand) indicators.push('Hands');
    if (profile.activeModalities.face) indicators.push('Face');
    return indicators.join(' + ');
  };

  // Render a single profile option
  const renderProfile = (profile: InputProfile) => {
    const isSelected = currentProfile?.id === profile.id;

    return (
      <button
        key={profile.id}
        onClick={() => handleSelect(profile)}
        className={`profile-option ${isSelected ? 'profile-option--selected' : ''}`}
        aria-pressed={isSelected}
      >
        <div className="profile-option-content">
          <span className="profile-name">{profile.name}</span>
          <span className="profile-modalities">{getModalityIndicators(profile)}</span>
        </div>
        {showDetails && profile.description && (
          <span className="profile-description">{profile.description}</span>
        )}
        {isSelected && (
          <span className="profile-check" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
          </span>
        )}
      </button>
    );
  };

  // Render category group
  const renderCategory = (category: ProfileCategory) => {
    const profiles = groupedProfiles[category];
    if (profiles.length === 0) return null;

    const info = CATEGORY_INFO[category];
    const isExpanded = expandedCategory === category;
    const hasSelectedProfile = profiles.some((p) => p.id === currentProfile?.id);

    return (
      <div key={category} className="profile-category">
        <button
          className={`profile-category-header ${hasSelectedProfile ? 'profile-category-header--active' : ''}`}
          onClick={() => toggleCategory(category)}
          aria-expanded={isExpanded}
        >
          <div className="profile-category-info">
            <span className="profile-category-label">{info.label}</span>
            <span className="profile-category-count">{profiles.length}</span>
          </div>
          <span className={`profile-category-arrow ${isExpanded ? 'profile-category-arrow--open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4.5 2.5l4 3.5-4 3.5"/>
            </svg>
          </span>
        </button>

        {isExpanded && (
          <div className="profile-category-content">
            {profiles.map(renderProfile)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="profile-selector">
      {/* Current selection summary */}
      {currentProfile && (
        <div className="profile-current">
          <span className="profile-current-label">Active:</span>
          <span className="profile-current-name">{currentProfile.name}</span>
        </div>
      )}

      {/* Category groups */}
      <div className="profile-categories">
        {(Object.keys(CATEGORY_INFO) as ProfileCategory[]).map(renderCategory)}
      </div>
    </div>
  );
}

export default InputProfileSelector;
