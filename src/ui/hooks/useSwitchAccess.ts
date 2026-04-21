/**
 * useSwitchAccess - Accessibility hook for switch/single-button navigation.
 *
 * Maps rapid sequential keypresses on a configurable key to actions:
 * - Single press: move focus to next interactive element
 * - Double press (within 500ms): activate/click the focused element
 * - Triple press: move focus backward
 *
 * For users with severe motor impairments using switch access devices,
 * sip-and-puff controllers, or single-button interfaces.
 */

import { useEffect, useRef } from 'react';

interface SwitchAccessOptions {
  enabled?: boolean;
  activationKey?: string;
  doublePressWindow?: number;
}

export function useSwitchAccess(options: SwitchAccessOptions = {}) {
  const {
    enabled = false,
    activationKey = ' ', // Space by default
    doublePressWindow = 500,
  } = options;

  const pressCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== activationKey) return;
      // Don't interfere with form inputs
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      e.preventDefault();
      pressCountRef.current++;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const count = pressCountRef.current;
        pressCountRef.current = 0;

        switch (count) {
          case 1:
            // Single press: move focus forward
            focusNext();
            break;
          case 2:
            // Double press: activate focused element
            activateFocused();
            break;
          case 3:
            // Triple press: move focus backward
            focusPrevious();
            break;
        }
      }, doublePressWindow);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, activationKey, doublePressWindow]);
}

function getFocusableElements(): HTMLElement[] {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null // visible
  );
}

function focusNext() {
  const elements = getFocusableElements();
  if (elements.length === 0) return;
  const current = document.activeElement as HTMLElement;
  const index = elements.indexOf(current);
  const next = elements[(index + 1) % elements.length];
  next?.focus();
}

function focusPrevious() {
  const elements = getFocusableElements();
  if (elements.length === 0) return;
  const current = document.activeElement as HTMLElement;
  const index = elements.indexOf(current);
  const prev = elements[(index - 1 + elements.length) % elements.length];
  prev?.focus();
}

function activateFocused() {
  const active = document.activeElement as HTMLElement;
  if (active && typeof active.click === 'function') {
    active.click();
  }
}
