import { computeHomography, UNIT_SQUARE, type Mat3, type Point } from '../../../utils/homography';

/** Unit-square → video pixels for normalised board corners (TL,TR,BR,BL = saved order). */
export function homographyForCorners(corners: readonly Point[], videoW: number, videoH: number): Mat3 {
  return computeHomography(UNIT_SQUARE, corners.map((c) => ({ x: c.x * videoW, y: c.y * videoH })));
}
