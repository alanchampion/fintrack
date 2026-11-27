import os

# Fills the two empty test files in FinTrack/test/ with their content.
# Safe to run repeatedly: it simply overwrites both files.

PROJECTION_TEST = r'''// Tests for js/projection.js - pure logic, no DOM needed.
// Run with: npm test   (requires Node 18+)

import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP, defaultEnd, buildEvents, buildTimeline, computeStats
} from "../js/projection.js";
import { toISO, today, addDays, parseDate } from "../js/utils.js";

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
  // Known behaviour, pinned by this test: after a clamped month the day
  // drifts to the shorter day (Jan 31 -> Feb 28 -> Mar 28 ...). It never
  // spills into the following month, which is the important guarantee.
  const d = doc({ recurring: [rec({ frequency: "monthly", startDate: "2026-01-31" })] });
  const ev = buildEvents(d, parseDate("2026-04-30"));
  const dates = ev.map(e => toISO(e.date));
  assert.ok(dates.includes("2026-02-28"), "Feb 28 clamped, not Mar 2/3");
  assert.ok(!dates.some(x => x.startsWith("2026-03-01")),
    "no spill into the next month");
});

test("quarterly recurrence fires 3 months apart", () => {
  const d = doc({ recurring: [rec({ frequency: "quarterly", startDate: isoPlus(-70) })] });
  const ev = buildEvents(d, addDays(today(), 70));
  assert.equal(ev.length, 2); // one ~70 days back, one ~22 days ahead
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
'''

STORAGE_TEST = r'''// Tests for js/storage.js - v1 schema as it exists on disk.

import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage mock (set up before importing storage.js):
// Node has no localStorage, and storage.js expects one.

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

const { emptyDoc, loadDoc, saveDoc } = await import("../js/storage.js");
const STORAGE_KEY = "fintrack.v1"; // module-private in storage.js; mirrored here

function sampleDoc() {
  return {
    version: 1,
    startingBalance: 50000,
    recurring: [{
      id: "r1", label: "Rent", sign: "debit", amount: 95000,
      frequency: "monthly", startDate: "2026-01-31"
    }],
    onetime: [{
      id: "o1", label: "Bonus", sign: "credit", amount: 100000, date: "2026-12-01"
    }]
  };
}

function seed(parsed) {
  store.clear();
  if (parsed !== undefined) store.set(STORAGE_KEY, JSON.stringify(parsed));
}

test("empty storage yields a fresh empty document", () => {
  seed(undefined);
  const d = loadDoc();
  assert.equal(d.version, 1);
  assert.deepEqual(d.recurring, []);
  assert.deepEqual(d.onetime, []);
  assert.equal(d.startingBalance, 0);
});

test("loadDoc returns the stored document intact", () => {
  seed(sampleDoc());
  const d = loadDoc();
  assert.equal(d.startingBalance, 50000);
  assert.equal(d.recurring[0].sign, "debit");
  assert.equal(d.recurring[0].amount, 95000);
  assert.equal(d.onetime[0].label, "Bonus");
});

test("saveDoc persists and loadDoc reads it back", () => {
  seed(undefined);
  const d = sampleDoc();
  saveDoc(d);
  const back = JSON.parse(store.get(STORAGE_KEY));
  assert.deepEqual(back, d);
  seed(back);
  assert.equal(loadDoc().recurring.length, 1);
});

test("corrupt JSON falls back to a fresh document instead of crashing", () => {
  store.clear();
  store.set(STORAGE_KEY, "{not json");
  const d = loadDoc();
  assert.equal(d.version, 1);
  assert.deepEqual(d.recurring, []);
});

test("emptyDoc matches the v1 schema exactly", () => {
  const d = emptyDoc();
  assert.deepEqual(Object.keys(d).sort(),
    ["onetime", "recurring", "startingBalance", "version"]);
});
'''

def fill(path, content):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    size = os.path.getsize(path)
    print("%s: %d bytes" % (path, size))
    if size == 0:
        raise SystemExit("FAILED: " + path + " still empty")

fill("test/projection.test.mjs", PROJECTION_TEST)
fill("test/storage.test.mjs", STORAGE_TEST)
print("DONE")
