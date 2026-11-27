"use strict";

// Sort orders for the transaction lists. Pure logic: no DOM, so node
// tests cover it fully. Every mode sorts a copy; the stored order of
// the document is never mutated.

// Recurring rules, keyed by sort id. Each rule's next occurrence date
// comes from the injected resolver so tests can pin dates.
// Modes: "upcoming" (default), "amount", "startdate".
export function sortRecurring(rules, mode, nextResolver) {
  const list = rules.slice();
  if (mode === "amount") {
    // Largest amount first.
    list.sort((a, b) => b.amount - a.amount);
  } else if (mode === "startdate") {
    // Oldest start date first; ties by larger amount for stability.
    list.sort((a, b) =>
      (cmpISO(a.startDate, b.startDate)) || (b.amount - a.amount));
  } else {
    // Upcoming: nearest next occurrence first; ties by larger amount.
    // Rules with no next occurrence (resolver returns null or an
    // unparseable value) sort last.
    list.sort((a, b) =>
      (timeOrInf(time(nextResolver(a))) - timeOrInf(time(nextResolver(b)))) ||
      (b.amount - a.amount));
  }
  return list;
}

// One-time entries, keyed by sort id.
export function sortOnetime(entries, mode) {
  const list = entries.slice();
  if (mode === "amount") {
    // Largest amount first.
    list.sort((a, b) => b.amount - a.amount);
  } else if (mode === "startdate") {
    // Chronological by date; oldest first, ties by larger amount.
    list.sort((a, b) => cmpISO(a.date, b.date) || (b.amount - a.amount));
  } else {
    // Upcoming: soonest date first; past entries fall to the end,
    // ordered chronologically among themselves.
    const now = todayMidnight();
    list.sort((a, b) =>
      (upcomingKey(a.date, now) - upcomingKey(b.date, now)) ||
      (b.amount - a.amount));
  }
  return list;
}

// Sort key for "upcoming": future and today entries rank by date
// ascending; past entries rank after all future ones, also ascending.
function upcomingKey(iso, now) {
  const t = time(iso);
  if (isNaN(t)) return Infinity;
  return t < now ? 1e15 + t : t;
}

// "YYYY-MM-DD" strings compare correctly as plain strings. Missing or
// non-string values sort last.
function cmpISO(a, b) {
  const va = typeof a === "string" ? a : "~";
  const vb = typeof b === "string" ? b : "~";
  return va < vb ? -1 : va > vb ? 1 : 0;
}

function time(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const parts = v.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.getTime();
  }
  return NaN;
}

function timeOrInf(t) {
  return (t === null || t === undefined || isNaN(t)) ? Infinity : t;
}

function todayMidnight() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
