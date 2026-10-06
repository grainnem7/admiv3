import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Changing this (a new screen) clears a caught error. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
}

/**
 * Catches an error while a screen draws, and shows it instead of a blank page.
 *
 * Without this, any error thrown while rendering — or in an effect — unmounted the whole
 * app and left an empty dark screen, with nothing for the player or facilitator to go on
 * and no way back short of reloading. Now the message is on screen (so it can be
 * reported in one screenshot) and "Try again" redraws the screen with saved settings.
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ScreenErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, componentStack: '' });
    }
  }

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    const where = componentStack.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6).join('\n');
    return (
      <div
        role="alert"
        style={{
          maxWidth: 760, margin: '48px auto', padding: 24, borderRadius: 12,
          background: '#262c39', color: '#e8ebf2', border: '2px solid #e0a040',
          fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Something went wrong on this screen</h2>
        <p>Your settings are saved. Press Try again to carry on.</p>
        <pre
          style={{
            whiteSpace: 'pre-wrap', background: '#1a1e27', padding: 12, borderRadius: 8,
            fontSize: 13, overflowX: 'auto',
          }}
        >
          {`${error.name}: ${error.message}\n\n${where}`}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null, componentStack: '' })}
          style={{ minHeight: 44, padding: '0 20px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    );
  }
}
