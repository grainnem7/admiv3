import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import {
  SETUP_STEPS, canContinue, cameraSatisfied, continueLabel, nextStep, prevStep,
  type CameraStatus, type SetupConfigView, type SetupStep,
} from '../boardSetupFlow';

export const STEP_LABELS: Record<SetupStep, string> = {
  camera: 'Camera', board: 'Board', colours: 'Colours', ready: 'Ready',
};

/** One plain instruction per step: what to do with the board, not what the app does. */
export const SETUP_HEADINGS: Record<SetupStep, string> = {
  camera: 'Point the camera at the board',
  board: 'Put the board in view, empty',
  colours: 'Put one of each counter on the board',
  ready: 'Ready to play',
};

export const SETUP_HINTS: Record<SetupStep, string> = {
  camera: 'The whole board should be in the picture, with the counters easy to tell apart.',
  board: 'Corners are the outside corners of the squares, not the wooden edge.',
  colours: 'Add each counter colour, then give it a job.',
  ready: 'Check the counters below are the ones you put down.',
};

export interface SetupFlowProps {
  step: SetupStep;
  onStepChange(step: SetupStep): void;
  cfg: SetupConfigView;
  camera: CameraStatus;
  hasStoredConfig: boolean;
  /** Step content; the flow owns the heading, the footer and focus. */
  children: ReactNode;
  /** An extra action between Back and Continue, e.g. "Skip, board hasn't moved". */
  skip?: { label: string; reason?: string | null; onClick(): void } | null;
  announce(message: string): void;
  /** Left-handed players get the footer aligned to their side; the order never changes. */
  footerAlign?: 'start' | 'end';
  heading: string;
  hint?: ReactNode;
}

/**
 * The guided Set up shell: one step at a time, always the same footer order, focus moved
 * to the step heading on every change, and one announcement per step rather than
 * a running commentary.
 */
export function SetupFlow({
  step, onStepChange, cfg, camera, hasStoredConfig, children, skip = null, announce,
  footerAlign = 'end', heading, hint,
}: SetupFlowProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const index = SETUP_STEPS.indexOf(step);

  useEffect(() => {
    headingRef.current?.focus();
    announce(`Step ${index + 1} of ${SETUP_STEPS.length}: ${STEP_LABELS[step]}`);
  }, [step, index, announce]);

  const back = prevStep(step);
  const next = nextStep(step);
  const canGo = canContinue(step, cfg, camera, hasStoredConfig);
  const continueReason = canGo ? null : reasonFor(step, cfg, camera, hasStoredConfig);

  return (
    <section
      style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}
      aria-label={`Set up, step ${index + 1} of ${SETUP_STEPS.length}`}
    >
      <div>
        <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 20 }}>{heading}</h2>
        {hint && <p style={{ margin: '4px 0 0', color: 'var(--bs-fg2)', fontSize: 13 }}>{hint}</p>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>

      {/* Same DOM and focus order for both hands; only the alignment moves. */}
      <footer style={{ display: 'flex', gap: 8, justifyContent: footerAlign === 'start' ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
        {back && <Button tone="quiet" onClick={() => onStepChange(back)}>← Back</Button>}
        {skip && <Button tone="secondary" reason={skip.reason ?? null} onClick={skip.onClick}>{skip.label}</Button>}
        {next && (
          <Button tone="primary" reason={continueReason} onClick={() => onStepChange(next)}>
            {continueLabel(step, camera)}
          </Button>
        )}
      </footer>
    </section>
  );
}

/** Plain-language reason a step can't be left yet — the one that is actually blocking. */
function reasonFor(
  step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean,
): string {
  if (step === 'camera') {
    if (camera.phase === 'starting') return 'Waiting for the camera to start…';
    return "The camera isn't working yet. Pick another camera or press Try again.";
  }
  // Later steps also need a working camera; saying "find the board" when the board is
  // already found and the camera is the problem sends the player the wrong way.
  if (!cameraSatisfied(camera, hasStoredConfig)) {
    return camera.phase === 'starting'
      ? 'Waiting for the camera to start…'
      : "The camera isn't working yet. Go back to Camera and try again.";
  }
  if (step === 'board') return 'Find the board and confirm its corners first.';
  // On Colours, a missing board blocks Continue just as hard as a missing colour does.
  if (!cfg.enabled) return 'Go back to Board and confirm the corners first.';
  if (step === 'colours') return 'Add at least one colour and give it a job.';
  return '';
}
