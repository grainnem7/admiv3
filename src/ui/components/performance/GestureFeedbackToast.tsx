/**
 * GestureFeedbackToast - Visual toast notifications for gesture recognition.
 *
 * Shows a brief notification when gestures are detected, including
 * the gesture name and what it triggered. Auto-dismisses after 2s.
 * Uses aria-live for screen reader accessibility.
 */

import { useEffect, useState } from 'react';
import type { TriggerEvent } from '../../../state/types';

interface GestureFeedbackToastProps {
  recentTriggers: TriggerEvent[];
}

interface ToastItem {
  id: string;
  message: string;
  timestamp: number;
}

const TOAST_DURATION = 2000;
const MAX_TOASTS = 3;

export default function GestureFeedbackToast({ recentTriggers }: GestureFeedbackToastProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastProcessedId, setLastProcessedId] = useState<string | null>(null);

  // Watch for new triggers
  useEffect(() => {
    if (recentTriggers.length === 0) return;
    const latest = recentTriggers[0];
    if (latest.id === lastProcessedId) return;

    setLastProcessedId(latest.id);
    const newToast: ToastItem = {
      id: latest.id,
      message: `${latest.source}: ${latest.action}`,
      timestamp: Date.now(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, MAX_TOASTS));
  }, [recentTriggers, lastProcessedId]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setToasts(prev => prev.filter(t => now - t.timestamp < TOAST_DURATION));
    }, 500);

    return () => clearInterval(timer);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'var(--space-4)',
        right: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        zIndex: 60,
        pointerEvents: 'none',
      }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const age = Date.now() - toast.timestamp;
        const opacity = Math.max(0, 1 - age / TOAST_DURATION);

        return (
          <div
            key={toast.id}
            style={{
              padding: 'var(--space-1) var(--space-3)',
              backgroundColor: 'rgba(249, 115, 22, 0.9)',
              color: 'var(--color-text-inverse)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-medium)',
              opacity,
              transform: `translateX(${(1 - opacity) * 20}px)`,
              transition: 'opacity var(--duration-fast), transform var(--duration-fast)',
            }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
