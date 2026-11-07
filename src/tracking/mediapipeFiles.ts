/**
 * Where MediaPipe's files come from (face, hands and pose). Served by ADMI's own server
 * (src/tracking/mediapipeServe.ts), so a show needs no internet:
 *
 * - The engine (its .wasm and loader) comes from the MediaPipe package installed with ADMI.
 *   It was fetched from the internet as "the latest", a different version from the installed
 *   one (1.2 against 0.10 in November 2026). It still started then, but nothing promised it
 *   would after the next release, and without the internet the face check did not start at
 *   all: the cap then worked without the face, saying so only in the Cap tab.
 * - Each model is downloaded by the server the first time it is asked for and kept on the
 *   laptop; after that it loads without the internet. Not kept yet and no internet: the
 *   detectors try Google's address directly, then do without.
 */

/** The engine files, from the installed package. */
export const MEDIAPIPE_WASM_PATH = '/mediapipe/wasm';
/** The models, kept on the laptop once fetched. */
export const MEDIAPIPE_MODEL_PATH = '/mediapipe/models';

/** The models ADMI uses, by file name, and where they are downloaded from. */
export const MEDIAPIPE_MODELS = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
} as const;
export type MediapipeModel = keyof typeof MEDIAPIPE_MODELS;

/** The engine files the package has (with and without SIMD). */
export const MEDIAPIPE_WASM_FILES = [
  'vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm',
] as const;

/**
 * A detector made from MediaPipe's files: the laptop's copy of the model first, Google's
 * address if that fails. `create` builds it from the engine's path and a model address.
 */
export async function withMediapipe<T>(model: MediapipeModel, create: (wasmPath: string, modelPath: string) => Promise<T>): Promise<T> {
  try {
    return await create(MEDIAPIPE_WASM_PATH, `${MEDIAPIPE_MODEL_PATH}/${model}`);
  } catch {
    return create(MEDIAPIPE_WASM_PATH, MEDIAPIPE_MODELS[model]);
  }
}
