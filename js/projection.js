"use strict";

import { parseDate, today, addDays, addMonthsClamped } from "./utils.js";

// Default projection range: 6 months ahead from today.
export function defaultEnd() {
  return addMonthsClamped(today(), 6);
}

// Hard upper bound for the projection end date: 5 years ahead.
// Keeps the expanded event list small no matter what a user picks.
export function maxEnd() {
  return addMonthsClamped(today(), 60);
}

// Supported recurring frequencies. Week-based rules step in days; the rest
// step in whole months (with end-of-month clamping).
export const STEP = {
  weekly:     { days: 7,  label: "Every week" },
  biweekly:   { days: 14, label: "Every other week" },
  monthly:    { months: 1,  label: "Every month" },
  bimonthly:  { months: 2,  label: "Every 2 months" },
  quarterly:  { months: 3,  label: "Every 3 months" },
  semiannual: { months: 6,  label: "Every 6 months" },
  yearly:     { months: 12, label: "Every year" }
};

// Occurrences of every rule and one-time entry within [today, end],
// sorted by date. Week-based rules step in fixed days; month-based
// rules keep the rule's start day (clamped at month ends).
export function buildEvents(doc, end) {
  const start = today();
  const events = [];
  for (const r of doc.recurring || []) {
    const step = STEP[r.frequency] || STEP.monthly;
    const ruleStart = parseDate(r.startDate);
    if (!ruleStart || isNaN(ruleStart.getTime())) continue;
    const cents = r.amount * (r.sign === "debit" ? -1 : 1);
    if (step.months) {
      for (let k = 0; k <= 800; k++) {
        const d = addMonthsClamped(ruleStart, k * step.months);
        if (d > end) break;
        if (d >= start) events.push({ date: d, cents, label: r.label });
      }
    } else {
      let cursor = ruleStart;
      let guard = 0;
      while (cursor <= end && guard++ < 5000) {
        if (cursor >= start) events.push({ date: cursor, cents, label: r.label });
        cursor = addDays(cursor, step.days);
      }
    }
  }
  for (const o of doc.onetime || []) {
    const d = parseDate(o.date);
    if (!d || isNaN(d.getTime())) continue;
    if (d >= start && d <= end) {
      events.push({
        date: d,
        cents: o.amount * (o.sign === "debit" ? -1 : 1),
        label: o.label
      });
    }
  }

  events.sort((a, b) => a.date - b.date);
  return events;
}

// Next occurrence of a rule on or after "ref" (usually today). Returns
// null if the rule has no occurrence within a 5-year lookahead. Pure
// function: testable without a DOM. Used for the "upcoming" sort order.
export function nextOccurrence(rule, ref) {
  const step = STEP[rule.frequency] || STEP.monthly;
  const ruleStart = parseDate(rule.startDate);
  const lookEnd = addMonthsClamped(ref, 60);

  if (step.months) {
    for (let k = 0; k <= 800; k++) {
      const d = addMonthsClamped(ruleStart, k * step.months);
      if (d > lookEnd) return null;
      if (d >= ref) return d;
    }
    return null;
  }
  // Week-based rules: step in fixed 7/14-day increments.
  let cursor = ruleStart;
  let guard = 0;
  while (cursor <= lookEnd && guard++ < 4000) {
    if (cursor >= ref) return cursor;
    cursor = addDays(cursor, step.days);
  }
  return null;
}

// Timeline of balance after each event, starting with today's balance.
export function buildTimeline(doc, events) {
  const timeline = [{ date: today(), cents: doc.startingBalance }];
  let bal = doc.startingBalance;
  for (const ev of events) {
    bal += ev.cents;
    timeline.push({ date: ev.date, cents: bal });
  }
  return timeline;
}

// Global highest and lowest points of the timeline.
export function computeStats(timeline) {
  let max = { cents: -Infinity };
  let min = { cents: Infinity };
  for (const pt of timeline) {
    if (pt.cents > max.cents) max = pt;
    if (pt.cents < min.cents) min = pt;
  }
  return { max: max, min: min };
}