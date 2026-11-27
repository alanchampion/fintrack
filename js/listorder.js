"use strict";

// Sorting of the recurring and one-time transaction lists.
// Pure logic: no DOM, so node tests cover it fully.

import { parseDate, addDays, addMonthsClamped } from "./utils.js";
import { STEP } from "./projection.js";

// Next occurrence of a recurring rule on or after fromDate.
// Week-based rules step in fixed days; month-based rules keep the
// rule's start day (clamped at month ends) like buildEvents does.
export function nextOccurrence(rule, fromDate) {
  const step = STEP[rule.frequency] || STEP.monthly;
  const start = parseDate(rule.startDate);
  const from = fromDate.getTime();

  if (step.months) {
    // Number of whole steps needed to reach fromDate, then clamp.
    let monthsDiff = (fromDate.getFullYear() - start.getFullYear()) * 12
      + (fromDate.getMonth() - start.getMonth());
    if (monthsDiff < 0) monthsDiff = 0;
    let k = Math.floor(monthsDiff / step.months) * step.months;
    let d = addMonthsClamped(start, k);
    while (d.getTime() < from) {
      k += step.months;
      d = addMonthsClamped(start, k);
    }
    return d;
  }
  // Day-based: advance in fixed steps. For weekly rules over 5 years
  // this is at most ~260 iterations; still bound it defensively.
  let d = start;
  let guard = 0;
  while (d.getTime() < from && guard++ < 5000) {
    d = addDays(d, step.days);
  }
  return d;
}

// Sort modes: "upcoming" (default), "amount", "startdate".
export function sortRules(rules, mode, fromDate) {
  const list = rules.slice(); // never mutate the stored order
  if (mode === "amount") {
    // Biggest amount first.
    list.sort((a, b) => b.amount - a.amount);
  } else if (mode === "startdate") {
    // Oldest start date first; ties by label for stability.
    list.sort((a, b) =>
      a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label));
  } else {
    // Upcoming: nearest next occurrence first; ties by label.
    const next = new Map();
    for (const r of list) {
      if (!next.has(r.id)) next.set(r.id, nextOccurrence(r, fromDate));
    }
    list.sort((a, b) =>
      next.get(a.id) - next.get(b.id) || a.label.localeCompare(b.label));
  }
  return list;
}

export function sortOnetime(items, mode) {
  const list = items.slice();
  if (mode === "amount") {
    list.sort((a, b) => b.amount - a.amount);
  } else {
    // Upcoming and start date are the same field here: date ascending.
    list.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }
  return list;
}
