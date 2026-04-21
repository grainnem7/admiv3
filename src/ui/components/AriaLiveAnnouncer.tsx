/**
 * AriaLiveAnnouncer - Visually hidden region for screen reader announcements.
 *
 * Driven by the `ariaAnnouncement` field in the Zustand store.
 * Components call `announce(message)` to push announcements.
 */

import { useAriaAnnouncement } from '../../state/store';

export default function AriaLiveAnnouncer() {
  const announcement = useAriaAnnouncement();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="visually-hidden"
    >
      {announcement}
    </div>
  );
}
