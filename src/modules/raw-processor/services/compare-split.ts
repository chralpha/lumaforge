export const COMPARE_SPLIT_MIN = 0
export const COMPARE_SPLIT_MAX = 1

export function clampCompareSplit(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(COMPARE_SPLIT_MAX, Math.max(COMPARE_SPLIT_MIN, value))
}

export function getCompareSplitFromClientX(
  rect: Pick<DOMRect, 'left' | 'width'>,
  clientX: number,
) {
  if (!rect.width || rect.width <= 0) return 0.5
  return clampCompareSplit((clientX - rect.left) / rect.width)
}
