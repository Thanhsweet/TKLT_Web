// Union maintenance intervals so overlapping blocks are subtracted only once.
export function blockedMinutes(blocks, from, to, open, close) {
  let total = 0;
  const dateMs = (s) => new Date(s.replace(" ", "T") + "+07:00").getTime();
  const intervals = blocks
    .map((b) => [dateMs(b.start_at), dateMs(b.end_at)])
    .sort((a, b) => a[0] - b[0]);
  for (
    let day = Date.parse(from + "T00:00:00Z");
    day <= Date.parse(to + "T00:00:00Z");
    day += 86400000
  ) {
    const date = new Date(day).toISOString().slice(0, 10);
    const begin = dateMs(date + " " + open),
      end = dateMs(date + " " + close);
    let left = null,
      right = null;
    for (const [a, b] of intervals) {
      const x = Math.max(a, begin),
        y = Math.min(b, end);
      if (x >= y) continue;
      if (left === null) {
        left = x;
        right = y;
      } else if (x <= right) {
        right = Math.max(right, y);
      } else {
        total += right - left;
        left = x;
        right = y;
      }
    }
    if (left !== null) total += right - left;
  }
  return total / 60000;
}
