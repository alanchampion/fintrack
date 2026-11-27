"use strict";

// All app data lives in one versioned JSON document. Store rules, not
// computed balances; the projection derives balances from the rules.

const STORAGE_KEY = "fintrack.v1";

export function emptyDoc() {
  return { version: 1, startingBalance: 0, recurring: [], onetime: [] };
}

export function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDoc();
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) return parsed;
  } catch (e) {
    // Bad data: start fresh rather than crash.
  }
  return emptyDoc();
}

export function saveDoc(doc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}