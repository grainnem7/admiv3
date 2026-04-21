/**
 * Sidebar navigation configuration with tiered progressive disclosure.
 *
 * Tier 1: Essential controls (always visible)
 * Tier 2: Extended controls (behind "More Controls" expander)
 * Tier 3: Advanced/settings (behind gear icon)
 */

import {
  IconBody,
  IconMusic,
  IconGesture,
  IconSliders,
  IconEffects,
  IconSequencer,
  IconWaveform,
  IconSettings,
  IconMidi,
} from '../../design-system/Icons';

export type SidebarSection =
  | 'input'
  | 'sound'
  | 'zones'
  | 'gestures'
  | 'effects'
  | 'midi'
  | 'modules'
  | 'points'
  | 'music'
  | 'harmony';

export type SidebarTier = 1 | 2 | 3;

export interface SidebarItem {
  id: SidebarSection;
  label: string;
  icon: React.FC<{ size?: number }>;
  tier: SidebarTier;
  description?: string;
}

/** Tier 1: Essential controls visible to all experience levels */
export const TIER_1_ITEMS: SidebarItem[] = [
  { id: 'input', label: 'Input', icon: IconBody, tier: 1, description: 'Input method & profile' },
  { id: 'sound', label: 'Sound', icon: IconMusic, tier: 1, description: 'Volume & sound preset' },
  { id: 'zones', label: 'Zones', icon: IconGesture, tier: 1, description: 'Instrument trigger zones' },
];

/** Tier 2: Extended controls for intermediate users */
export const TIER_2_ITEMS: SidebarItem[] = [
  { id: 'gestures', label: 'Gestures', icon: IconGesture, tier: 2, description: 'Map specific movements to sounds' },
  { id: 'effects', label: 'Effects', icon: IconEffects, tier: 2, description: 'Add reverb, delay, and audio processing' },
  { id: 'harmony', label: 'Harmony', icon: IconWaveform, tier: 2, description: 'Auto-accompaniment that follows your playing' },
  { id: 'modules', label: 'Tools', icon: IconSequencer, tier: 2, description: 'Sequencer, arpeggiator, and musical tools' },
  { id: 'points', label: 'Body Tracking', icon: IconSliders, tier: 2, description: 'Select which body joints control music' },
];

/** Tier 3: Advanced settings for expert users */
export const TIER_3_ITEMS: SidebarItem[] = [
  { id: 'music', label: 'Music', icon: IconSettings, tier: 3, description: 'Key, scale, tempo settings' },
  { id: 'midi', label: 'MIDI', icon: IconMidi, tier: 3, description: 'MIDI output configuration' },
];

/** All sidebar items in display order */
export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  ...TIER_1_ITEMS,
  ...TIER_2_ITEMS,
  ...TIER_3_ITEMS,
];

/** Get sidebar item by ID */
export function getSidebarItem(id: SidebarSection): SidebarItem | undefined {
  return ALL_SIDEBAR_ITEMS.find((item) => item.id === id);
}
