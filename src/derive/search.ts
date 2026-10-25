/** Last index with a[i] <= t, or -1. `a` must be sorted ascending. */
export function indexAtOrBefore(a: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = a.length - 1;
  if (hi < 0 || a[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (a[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** First index with a[i] >= t, or a.length. */
export function indexAtOrAfter(a: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Linear interpolation of y at x on monotone xs. Clamps at the ends. */
export function interp(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const i = indexAtOrBefore(xs, x);
  const x0 = xs[i];
  const x1 = xs[i + 1];
  if (x1 === x0) return ys[i];
  return ys[i] + ((ys[i + 1] - ys[i]) * (x - x0)) / (x1 - x0);
}
