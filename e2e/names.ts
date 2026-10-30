import type { Page } from '@playwright/test';

/**
 * WCAG 2.5.3, as the audit asks it (A9): a control's accessible name starts with the words
 * you can see on it. Only controls that carry their own name (aria-label) can differ from
 * their words, so these are what is checked. Symbols and emoji at the start of the visible
 * words (▶ ✕ ↻ 1.) do not count as words; a control with no words (an icon) is skipped.
 */
export interface NameMismatch { visible: string; name: string }

export async function nameMismatches(page: Page): Promise<NameMismatch[]> {
  return page.evaluate(() => {
    const words = (s: string): string => s
      .replace(/ /g, ' ')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const visibleText = (el: Element): string => {
      let out = '';
      const walk = (n: Node): void => {
        if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ''; return; }
        if (!(n instanceof HTMLElement)) return;
        // aria-hidden text is still on the screen: only what is not drawn is left out.
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        n.childNodes.forEach(walk);
      };
      el.childNodes.forEach(walk);
      return out;
    };
    const found: { visible: string; name: string }[] = [];
    const named = document.querySelectorAll('button[aria-label], a[aria-label], [role="button"][aria-label], [role="tab"][aria-label], [role="radio"][aria-label], [role="switch"][aria-label], [role="checkbox"][aria-label]');
    named.forEach((el) => {
      if (!(el instanceof HTMLElement) || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
      const visible = words(visibleText(el));
      if (visible === '' || !/\p{L}|\p{N}/u.test(visible)) return;
      const name = words(el.getAttribute('aria-label') ?? '');
      if (!name.startsWith(visible)) found.push({ visible: visibleText(el).trim(), name: el.getAttribute('aria-label') ?? '' });
    });
    return found;
  });
}
