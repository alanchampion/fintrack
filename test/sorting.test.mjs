// Tests for js/sorting.js - list sort orders, no DOM needed.

import test from "node:test";
import assert from "node:assert/strict";

const { sortRecurring, sortOnetime } = await import("../js/sorting.js");

// A fixed resolver pins next-occurrence dates independent of today.
const NEXT = { r1: "2026-12-01", r2: "2026-11-28", r3: "2026-12-05" };
const nextResolver = r => NEXT[r.id];

// Same dates, but returned as Date objects the way the app does.
const nextResolverDates = r =>
  ({ r1: new Date(2026, 11, 1), r2: new Date(2026, 10, 28), r3: new Date(2026, 11, 5) })[r.id];

function rules() {
  return [
    { id: "r1", label: "Rent", amount: 95000, startDate: "2026-12-01" },
    { id: "r2", label: "Salary", amount: 205000, startDate: "2026-11-28" },
    { id: "r3", label: "Water", amount: 4500, startDate: "2026-12-05" }
  ];
}

function onetimes() {
  return [
    { id: "o1", label: "Big", amount: 139255, date: "2027-01-04" },
    { id: "o2", label: "Soon", amount: 25000, date: "2026-12-03" },
    { id: "o3", label: "Old", amount: 5000, date: "2026-10-01" }
  ];
}

function ids(list) { return list.map(x => x.id); }

test("recurring default order is by upcoming next occurrence", () => {
  assert.deepEqual(ids(sortRecurring(rules(), "upcoming", nextResolver)),
    ["r2", "r1", "r3"]);
});

test("upcoming order also works when the resolver returns Date objects", () => {
  // Regression: the app passes a resolver returning Dates; with string-
  // only parsing every Date became NaN and the list fell back to
  // amount order, making Upcoming identical to Amount.
  assert.deepEqual(ids(sortRecurring(rules(), "upcoming", nextResolverDates)),
    ["r2", "r1", "r3"]);
});

test("upcoming order differs from amount order when dates disagree", () => {
  // Small-but-soon first by date, big-but-later first by amount: the
  // two modes must not collapse into one list.
  const tricky = [
    { id: "bigLater", amount: 900, startDate: "2027-01-01" },
    { id: "smallSoon", amount: 100, startDate: "2026-12-02" }
  ];
  const next = r => r.id === "bigLater" ? "2027-01-01" : "2026-12-02";
  assert.deepEqual(ids(sortRecurring(tricky, "upcoming", next)),
    ["smallSoon", "bigLater"]);
  assert.deepEqual(ids(sortRecurring(tricky, "amount", next)),
    ["bigLater", "smallSoon"]);
});

test("recurring amount order is largest first", () => {
  assert.deepEqual(ids(sortRecurring(rules(), "amount", nextResolver)),
    ["r2", "r1", "r3"]);
});

test("recurring startdate order uses the rule's startDate", () => {
  // Note: rules() is deliberately not in startDate order.
  const shuffled = [
    { id: "r3", amount: 4500, startDate: "2026-12-05" },
    { id: "r1", amount: 95000, startDate: "2026-12-01" },
    { id: "r2", amount: 205000, startDate: "2026-11-28" }
  ];
  assert.deepEqual(ids(sortRecurring(shuffled, "startdate", nextResolver)),
    ["r2", "r1", "r3"]);
});

test("upcoming ties break by larger amount first", () => {
  const tie = [
    { id: "a", amount: 100, startDate: "2026-12-01" },
    { id: "b", amount: 500, startDate: "2026-12-01" }
  ];
  const same = () => "2026-12-01";
  assert.deepEqual(ids(sortRecurring(tie, "upcoming", same)), ["b", "a"]);
});

test("recurring sort never mutates the input array", () => {
  const original = rules();
  const copy = original.slice();
  sortRecurring(original, "amount", nextResolver);
  assert.deepEqual(original, copy);
});

test("onetime default order is soonest future date first, past entries last", () => {
  // Today in the test window lies between 2026-11-28 and 2026-12-03,
  // so the past entry (o3) sorts after the future ones (o2, o1).
  assert.deepEqual(ids(sortOnetime(onetimes(), "upcoming")),
    ["o2", "o1", "o3"]);
});

test("onetime amount order is largest first", () => {
  assert.deepEqual(ids(sortOnetime(onetimes(), "amount")),
    ["o1", "o2", "o3"]);
});

test("onetime startdate order is chronological", () => {
  assert.deepEqual(ids(sortOnetime(onetimes(), "startdate")),
    ["o3", "o2", "o1"]);
});

test("onetime sort never mutates the input array", () => {
  const original = onetimes();
  const copy = original.slice();
  sortOnetime(original, "amount");
  assert.deepEqual(original, copy);
});

test("missing next occurrence sorts last in upcoming order", () => {
  const list = [
    { id: "gone", amount: 999, startDate: "2026-12-01" },
    { id: "live", amount: 10, startDate: "2026-12-01" }
  ];
  const next = r => (r.id === "gone" ? null : "2026-12-01");
  assert.deepEqual(ids(sortRecurring(list, "upcoming", next)), ["live", "gone"]);
});
