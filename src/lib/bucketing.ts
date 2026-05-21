// Aggregate day-level data points into ISO weeks (Mon–Sun).

export type Granularity = "day" | "week";

/** Returns the Monday of the ISO week containing `iso` (YYYY-MM-DD UTC anchored). */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay: 0 = Sunday, 1 = Monday … 6 = Saturday
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Bucket a chronologically-sorted series of `{ date, ...numeric }` rows into
 * ISO weeks. Numeric fields are summed. Boolean fields are OR-ed. String
 * fields are dropped (except `date` which is replaced by the week's Monday).
 */
export function bucketByWeek<T extends { date: string }>(rows: T[]): T[] {
  const buckets = new Map<string, T>();
  for (const row of rows) {
    const key = mondayOf(row.date);
    const existing = buckets.get(key);
    if (!existing) {
      // shallow copy with date replaced by the week start
      buckets.set(key, { ...row, date: key });
      continue;
    }
    for (const [k, v] of Object.entries(row)) {
      if (k === "date") continue;
      const cur = (existing as Record<string, unknown>)[k];
      if (typeof v === "number") {
        (existing as Record<string, unknown>)[k] = (typeof cur === "number" ? cur : 0) + v;
      } else if (typeof v === "boolean") {
        (existing as Record<string, unknown>)[k] = Boolean(cur) || v;
      }
      // strings and nulls left as-is (date already handled)
    }
  }
  return Array.from(buckets.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/** Aggregate by week, preserving fields that aren't number/boolean. */
export function maybeBucket<T extends { date: string }>(
  rows: T[],
  granularity: Granularity,
): T[] {
  return granularity === "week" ? bucketByWeek(rows) : rows;
}
