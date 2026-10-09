import test from "node:test";
import assert from "node:assert/strict";
import { blockedMinutes } from "../lib/reporting.js";
test("maintenance capacity clips opening hours, merges overlap and spans multiple days", () => {
  const day = "2026-10-10";
  assert.equal(
    blockedMinutes(
      [
        { start_at: day + " 04:00:00", end_at: day + " 07:00:00" },
        { start_at: day + " 06:00:00", end_at: day + " 08:00:00" },
      ],
      day,
      day,
      "05:00:00",
      "23:00:00",
    ),
    180,
  );
  assert.equal(
    blockedMinutes(
      [{ start_at: day + " 22:00:00", end_at: "2026-10-11 06:00:00" }],
      day,
      "2026-10-11",
      "05:00:00",
      "23:00:00",
    ),
    120,
  );
  assert.equal(blockedMinutes([], day, day, "05:00:00", "23:00:00"), 0);
});
