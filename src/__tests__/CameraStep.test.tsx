import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CameraStep, type CameraStepProps } from '../ui/screens/boardSequencer/setup/CameraStep';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function props(over: Partial<CameraStepProps> = {}): CameraStepProps {
  return {
    cameras: [{ deviceId: 'usb', label: 'USB camera', kind: 'videoinput', groupId: '' } as MediaDeviceInfo],
    deviceId: 'usb', onPickCamera: vi.fn(), onTryAgain: vi.fn(),
    camera: { phase: 'running', colourless: false },
    trackInfo: null, saturation: 30, resolution: { width: 1280, height: 720 }, onResolution: vi.fn(),
    lightingNote: null, mirrorX: false, mirrorY: false, rotation: 0, onTurn: vi.fn(), onViewChange: vi.fn(),
    onRefreshCameras: vi.fn(), handedness: 'left',
    ...over,
  };
}

/** What shows without opening anything: the text outside closed <details>. */
function visibleText(): string {
  const copy = host.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('details:not([open])').forEach((d) => {
    [...d.children].forEach((c) => { if (c.tagName !== 'SUMMARY') c.remove(); });
  });
  return copy.textContent ?? '';
}
const more = (): HTMLDetailsElement | undefined => [...host.querySelectorAll('details')]
  .find((d) => d.querySelector(':scope > summary')?.textContent === 'More');

describe('a quieter Camera step', () => {
  it('a working camera: which camera and "Picture has colour", nothing else on show', () => {
    act(() => root.render(<CameraStep {...props()} />));
    const text = visibleText();
    expect(text).toContain('USB camera');
    expect(text).toContain('Picture has colour');
    expect(text).not.toMatch(/Picture size|Mirror the picture|Turn the picture/);
  });

  it('More holds the picture size, turning, mirroring, where to put the camera and details', () => {
    act(() => root.render(<CameraStep {...props()} />));
    const t = more()?.textContent ?? '';
    for (const s of ['Picture size', 'Turn the picture', 'Mirror the picture', 'Flip the picture upside down', 'Where to put the camera', 'Details']) {
      expect(t).toContain(s);
    }
  });

  it('a black-and-white picture: the warning shows and More is open, since the fix is in it', () => {
    act(() => root.render(<CameraStep {...props({ camera: { phase: 'running', colourless: true } })} />));
    expect(visibleText()).toContain('black and white');
    expect(more()?.open).toBe(true);
    expect(visibleText()).toContain('Picture size');
  });

  it('a camera that isn’t working: Try again is on show', () => {
    act(() => root.render(<CameraStep {...props({ camera: { phase: 'error', colourless: null } })} />));
    expect(visibleText()).toContain('Try again');
  });
});
