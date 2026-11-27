"use strict";

// Small helpers for dates, money formatting, and safe HTML text.

// Parse "YYYY-MM-DD" as a local-midnight date. New Date(iso) would parse as
// UTC and can shift the day by one in some timezones.
export function parseDate(iso) {
  const parts = iso.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const p = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate());
}

export function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Add months, clamping the day to the target month's length:
// Jan 31 + 1 month = Feb 28 (never spills into March).
export function addMonthsClamped(date, n) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const t = new Date(y, m + n, 1);
  const daysInTarget = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, daysInTarget));
  return t;
}

// Money is stored as integer cents everywhere. Format for display only.
export function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return sign + (abs / 100).toFixed(2);
}

// Escape user text before it goes into innerHTML.
export function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}