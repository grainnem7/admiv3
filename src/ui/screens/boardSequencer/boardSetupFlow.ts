/** Pure rules for the guided Set up flow: Camera → Board → Colours → Ready. */
import type { ColourRole } from '../../../tracking/boardColours';

export type SetupStep = 'camera' | 'board' | 'colours' | 'ready';
export const SETUP_STEPS: SetupStep[] = ['camera', 'board', 'colours', 'ready'];
export type CameraPhase = 'starting' | 'running' | 'fallback' | 'error';
export interface CameraStatus { phase: CameraPhase; colourless: boolean | null }
export interface SetupConfigView { enabled: boolean; channels: { role: ColourRole }[] }
export type StepIndicator = 'done' | 'warning' | 'current' | 'todo' | 'pending';

const hasActiveChannel = (cfg: SetupConfigView): boolean => cfg.channels.some((c) => c.role !== 'off');

/** Resolved once at mount from config only; routing never moves the user on its own. */
export function resolveEntry(cfg: SetupConfigView, hasStoredConfig: boolean): SetupStep {
  if (!hasStoredConfig) return 'camera';
  if (!cfg.enabled) return 'board';
  if (!hasActiveChannel(cfg)) return 'colours';
  return 'board';
}

/** Camera is good enough for later steps: running, stand-in fallback, or still starting for a returning user. */
export function cameraSatisfied(camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (camera.phase === 'running' || camera.phase === 'fallback') return true;
  return camera.phase === 'starting' && hasStoredConfig;
}

export function canOpenStep(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (step === 'camera') return true;
  if (!cameraSatisfied(camera, hasStoredConfig)) return false;
  if (step === 'board') return true;
  if (!cfg.enabled) return false;
  if (step === 'colours') return true;
  return hasActiveChannel(cfg);
}

export function canContinue(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (step === 'camera') return camera.phase === 'running' || camera.phase === 'fallback';
  if (step === 'board') return cfg.enabled && cameraSatisfied(camera, hasStoredConfig);
  if (step === 'colours') return canOpenStep('ready', cfg, camera, hasStoredConfig);
  return false;
}

export function canPlay(cfg: SetupConfigView, camera: CameraStatus): boolean {
  return cfg.enabled && hasActiveChannel(cfg) && camera.phase !== 'error';
}

export function stepIndicator(
  step: SetupStep, current: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean,
): StepIndicator {
  if (step === current) return 'current';
  if (step === 'camera') {
    if (camera.phase === 'running') return 'done';
    if (camera.phase === 'fallback' || camera.phase === 'error') return 'warning';
    return 'pending';
  }
  if (step === 'board') return cfg.enabled && cameraSatisfied(camera, hasStoredConfig) ? 'done' : 'todo';
  if (step === 'colours') return cfg.enabled && hasActiveChannel(cfg) ? 'done' : 'todo';
  return 'todo';
}

export function continueLabel(step: SetupStep, camera: CameraStatus): string {
  return step === 'camera' && camera.colourless === true ? 'Continue anyway' : 'Continue';
}

export function nextStep(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? null;
}

export function prevStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1] : null;
}
