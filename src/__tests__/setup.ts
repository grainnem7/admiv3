// Vitest global setup for ADMIv3 tests
// Mock browser APIs that don't exist in jsdom

import { vi } from 'vitest';

// Mock Web Audio API
Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    createOscillator: vi.fn(),
    createGain: vi.fn(),
    destination: {},
    currentTime: 0,
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
});

// Mock MediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [],
    }),
  },
});

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number);
globalThis.cancelAnimationFrame = vi.fn((id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
