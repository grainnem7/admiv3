import { describe, it, expect } from 'vitest';
import { controlOwners, disabledReason, legendValue } from '../ui/screens/boardSequencer/controlOwnership';

const channels = [
  { id: 'm', role: 'melody' as const },
  { id: 'v', role: 'volume' as const },
  { id: 'v2', role: 'volume' as const },
  { id: 't', role: 'tempo' as const },
];

describe('controlOwners', () => {
  it('lists the counter that owns each parameter, first colour wins', () => {
    const owners = controlOwners(channels);
    expect(owners.volume).toEqual({ channelId: 'v', role: 'volume' });
    expect(owners.tempo).toEqual({ channelId: 't', role: 'tempo' });
    expect(owners.reverb).toBeUndefined();
  });
});

describe('disabledReason', () => {
  it('says which counter owns the parameter, and nothing when none does', () => {
    const owners = controlOwners(channels);
    expect(disabledReason('volume', owners)).toBe('Volume is set by the volume counter');
    expect(disabledReason('reverb', owners)).toBeNull();
  });

  it('a backing song outranks even a tempo counter', () => {
    expect(disabledReason('tempo', controlOwners(channels), true)).toBe('Tempo follows the backing song');
    expect(disabledReason('tempo', {}, true)).toBe('Tempo follows the backing song');
  });
});

describe('legendValue', () => {
  it('shows a percentage, BPM, a dash, and a hold glyph', () => {
    expect(legendValue('volume', 0.62, new Set())).toBe('62%');
    expect(legendValue('tempo', 96.4, new Set())).toBe('96 BPM');
    expect(legendValue('reverb', undefined, new Set())).toBe('—');
    expect(legendValue('volume', 0.62, new Set(['volume']))).toBe('62% ‖');
  });
});
