/**
 * 7-day centred rolling average. Requires at least 3 non-null values in the
 * window; otherwise returns null so the chart renders a gap instead of noise.
 */
export function roll7(arr: (number | null)[]): (number | null)[] {
  return arr.map((_, i) => {
    const win = arr
      .slice(Math.max(0, i - 6), i + 1)
      .filter((v): v is number => v !== null);
    return win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
}
