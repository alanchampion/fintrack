// Tests for js/storage.js - v1 schema as it exists on disk.

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
