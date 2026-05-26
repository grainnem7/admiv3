/**
 * remixKeyMap — pure mapping from KeyboardEvent.key to a Remix action,
 * so the screen's key handler is a thin, testable switch.
 */

export type RemixKeyAction =
  | { kind: 'focusStem'; index: 0 | 1 | 2 | 3 }
  | { kind: 'filter'; dir: 1 | -1 }
  | { kind: 'stutter' }
  | { kind: 'nudgeLoop'; dir: 1 | -1 }
  | { kind: 'loopLen'; dir: 1 | -1 }
  | { kind: 'togglePlay' }
  | null;

export function keyToRemixAction(key: string): RemixKeyAction {
  switch (key) {
    case '1': return { kind: 'focusStem', index: 0 };
    case '2': return { kind: 'focusStem', index: 1 };
    case '3': return { kind: 'focusStem', index: 2 };
    case '4': return { kind: 'focusStem', index: 3 };
    case 'ArrowUp': return { kind: 'filter', dir: 1 };
    case 'ArrowDown': return { kind: 'filter', dir: -1 };
    case 'ArrowLeft': return { kind: 'nudgeLoop', dir: -1 };
    case 'ArrowRight': return { kind: 'nudgeLoop', dir: 1 };
    case 's':
    case 'S': return { kind: 'stutter' };
    case '[': return { kind: 'loopLen', dir: -1 };
    case ']': return { kind: 'loopLen', dir: 1 };
    case ' ': return { kind: 'togglePlay' };
    default: return null;
  }
}
