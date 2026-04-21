/**
 * ScreenTransition - Wraps screen content with fade transitions.
 *
 * Pure CSS transitions, respects prefers-reduced-motion via tokens.css
 * (all durations set to 0ms when reduced motion enabled).
 */

import { useState, useEffect, useRef } from 'react';

interface ScreenTransitionProps {
  screenKey: string;
  children: React.ReactNode;
}

export default function ScreenTransition({ screenKey, children }: ScreenTransitionProps) {
  const [displayedKey, setDisplayedKey] = useState(screenKey);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [phase, setPhase] = useState<'visible' | 'fading-out' | 'fading-in'>('visible');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (screenKey === displayedKey) {
      // Same screen, just update children
      setDisplayedChildren(children);
      return;
    }

    // New screen: fade out, then swap, then fade in
    setPhase('fading-out');
    clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setDisplayedKey(screenKey);
      setDisplayedChildren(children);
      setPhase('fading-in');

      timeoutRef.current = setTimeout(() => {
        setPhase('visible');
      }, 150);
    }, 150);

    return () => clearTimeout(timeoutRef.current);
  }, [screenKey, children, displayedKey]);

  const opacity = phase === 'fading-out' ? 0 : 1;
  const transform = phase === 'fading-out'
    ? 'translateY(-4px)'
    : phase === 'fading-in'
    ? 'translateY(0)'
    : 'none';

  return (
    <div
      style={{
        opacity,
        transform,
        transition: `opacity var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default)`,
        willChange: phase !== 'visible' ? 'opacity, transform' : 'auto',
      }}
    >
      {displayedChildren}
    </div>
  );
}
