// Tests for js/projection.js - pure logic, no DOM needed.
// Run with: npm test   (requires Node 18+)

import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP, defaultEnd, maxEnd, buildEvents, buildTimeline, computeStats
} from "../js/projection.js";
import { toISO, today, addDays, parseDate, addMonthsClamped } from "../js/utils.js";

const DAY = 86400000; // ms

function isoPlus(days) {
  return toISO(addDays(today(), days));
}

function doc({ startingBalance = 100000, recurring = [], onetime = [] } = {}) {
  return { version: 1, startingBalance, recurring, onetime };
}

function rec({ label = "x", sign = "debit", amount = 5000,
               frequency = "monthly", startDate = toISO(today()) } = {}) {
  return { id: "r-" + Math.random(), label, sign, amount, frequency, startDate };
}

function one(label, sign, amount, days) {
  return { id: "o-" + Math.random(), label, sign, amount, date: isoPlus(days) };
}

test("STEP covers all seven supported frequencies", () => {
  const keys = Object.keys(STEP).sort();
  assert.deepEqual(keys,
    ["bimonthly", "biweekly", "monthly", "quarterly", "semiannual", "weekly", "yearly"]);
  for (const k of keys) {
    assert.ok(STEP[k].days || STEP[k].months, k + " must step in days or months");
    assert.equal(typeof STEP[k].label, "string");
  }
});

test("defaultEnd is about six months ahead", () => {
  const end = defaultEnd();
  assert.ok(end > today());
  const monthsAhead =
    (end.getFullYear() - today().getFullYear()) * 12 +
    (end.getMonth() - today().getMonth());
  assert.equal(monthsAhead, 6);
});

test("weekly recurrence fires 7 days apart", () => {
  const d = doc({ recurring: [rec({ frequency: "weekly" })] });
  const ev = buildEvents(d, addDays(today(), 20));
  assert.equal(ev.length, 3); // today, +7, +14 (within 20 days)
  assert.equal(ev[1].date - ev[0].date, 7 * DAY);
  assert.equal(ev[2].date - ev[1].date, 7 * DAY);
});

test("biweekly recurrence fires 14 days apart", () => {
  const d = doc({ recurring: [rec({ frequency: "biweekly" })] });
  const ev = buildEvents(d, addDays(today(), 20));
  assert.equal(ev.length, 2); // today, +14
  assert.equal(ev[1].date - ev[0].date, 14 * DAY);
});

test("month-based recurrence clamps end-of-month instead of spilling over", () => {
  // Anchor behaviour: a rule starting on the 31st lands on the last day
  // of shorter months and restores the 31st afterwards. Dates are kept
  // in the future so the before-today filter never hides them.
  const y = today().getFullYear();
  const febLast = new Date(y + 1, 2, 0).getDate(); // last day of Feb next year
  const d = doc({ recurring: [rec({
    frequency: "monthly", startDate: toISO(new Date(y + 1, 0, 31))
  })]});
  const ev = buildEvents(d, new Date(y + 1, 3, 30));
  const dates = ev.map(e => toISO(e.date));
  assert.ok(dates.includes(toISO(new Date(y + 1, 1, febLast))),
    "Feb lands on its last day, not spilled into March");
  assert.ok(dates.includes(toISO(new Date(y + 1, 2, 31))),
    "Mar 31 restores the anchor day");
  assert.ok(!dates.some(x => x.startsWith((y + 1) + "-03-0")),
    "no spill into early March");
});

test("quarterly recurrence fires 3 months apart", () => {
  const start = addMonthsClamped(today(), -8);
  const end = addMonthsClamped(today(), 4);
  const d = doc({ recurring: [rec({ frequency: "quarterly", startDate: toISO(start) })] });
  const ev = buildEvents(d, end);
  // Occurrences at -8, -5, -2, +1, +4 months. Before-today ones are
  // filtered, leaving +1 and +4: three months apart.
  assert.equal(ev.length, 2);
  const monthsBetween =
    (ev[1].date.getFullYear() - ev[0].date.getFullYear()) * 12 +
    (ev[1].date.getMonth() - ev[0].date.getMonth());
  assert.equal(monthsBetween, 3);
});

test("debits are negative, credits positive", () => {
  const d = doc({ recurring: [
    rec({ label: "salary", sign: "credit", amount: 250000 }),
    rec({ label: "rent", sign: "debit", amount: 95000 })
  ]});
  const ev = buildEvents(d, addDays(today(), 1));
  assert.equal(ev.find(e => e.label === "salary").cents, 250000);
  assert.equal(ev.find(e => e.label === "rent").cents, -95000);
});

test("one-time events land on their date within the window only", () => {
  const d = doc({ onetime: [
    one("bonus", "credit", 100000, 10),
    one("past", "credit", 50000, -10),
    one("too far", "credit", 50000, 400)
  ]});
  const ev = buildEvents(d, addDays(today(), 30));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].label, "bonus");
});

test("buildTimeline starts at starting balance and accumulates in date order", () => {
  const d = doc({ startingBalance: 100000, onetime: [
    one("a", "debit", 30000, 5),
    one("b", "debit", 20000, 10)
  ]});
  const ev = buildEvents(d, addDays(today(), 30));
  const tl = buildTimeline(d, ev);
  assert.equal(tl.length, 3);
  assert.equal(tl[0].cents, 100000);
  assert.equal(tl[1].cents, 70000);
  assert.equal(tl[2].cents, 50000);
  assert.ok(tl[1].date <= tl[2].date);
});

test("computeStats finds global max and min", () => {
  const d = doc({ startingBalance: 100000, onetime: [
    one("drop", "debit", 120000, 3),
    one("raise", "credit", 200000, 6)
  ]});
  const ev = buildEvents(d, addDays(today(), 30));
  const tl = buildTimeline(d, ev);
  const { max, min } = computeStats(tl);
  assert.equal(min.cents, -20000);   // after the drop
  assert.equal(max.cents, 180000);   // after the raise
  assert.equal(toISO(max.date), isoPlus(6));
});
