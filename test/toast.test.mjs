// Tests for js/toast.js - injected-env toaster, no DOM needed.

import test from "node:test";
import assert from "node:assert/strict";

const { createToaster } = await import("../js/toast.js");

// Minimal document stub: createElement returns a tiny element object
// with the API toast.js uses (className, textContent, setAttribute,
// addEventListener, remove).
function fakeDocument() {
  const created = [];
  return {
    created,
    createElement(tag) {
      const el = {
        tag,
        className: "",
        textContent: "",
        attrs: {},
        children: [],
        listeners: {},
        removed: false,
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        append(...kids) { this.children.push(...kids); },
        remove() { this.removed = true; }
      };
      created.push(el);
      return el;
    }
  };
}

// Timer stub: records callbacks; runAll() fires them in order.
function fakeTimers() {
  const pending = [];
  return {
    pending,
    set(fn, ms) { pending.push({ fn, ms }); return pending.length; },
    clear() {},
    runAll() { for (const p of pending.splice(0)) p.fn(); }
  };
}

function makeEnv() {
  const children = [];
  const host = {
    children,
    appendChild(el) { children.push(el); }
  };
  return { host, doc: fakeDocument(), timers: fakeTimers() };
}

test("show appends a toast with the message and default kind", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  const el = t.show("Saved");
  assert.equal(env.host.children.length, 1);
  assert.equal(el.className, "toast info");
  assert.equal(el.textContent, "Saved");
  assert.equal(el.attrs.role, "status");
});

test("kind classes map to info, warn and error", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  assert.equal(t.show("a", "info").className, "toast info");
  assert.equal(t.show("b", "warn").className, "toast warn");
  assert.equal(t.show("c", "error").className, "toast error");
});

test("default timeout schedules removal of 4000 ms", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  const el = t.show("bye");
  assert.equal(env.timers.pending.length, 1);
  assert.equal(env.timers.pending[0].ms, 4000);
  env.timers.runAll();
  assert.equal(el.removed, true);
});

test("ms <= 0 keeps the toast until clicked", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  const el = t.show("sticky", "error", 0);
  assert.equal(env.timers.pending.length, 0);
  el.listeners.click();
  assert.equal(el.removed, true);
});

test("custom duration uses the given ms", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  t.show("quick", "info", 800);
  assert.equal(env.timers.pending[0].ms, 800);
});

test("missing host yields a no-op toaster that returns null", () => {
  const t = createToaster({ document: fakeDocument(), timers: fakeTimers() });
  assert.equal(t.show("ignored"), null);
});

test("clicking a timed toast removes it early", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  const el = t.show("click me");
  el.listeners.click();
  assert.equal(el.removed, true);
});

test("showUndo builds a toast with a message span and an Undo button", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  let undone = 0;
  const el = t.showUndo("Entry deleted.", () => { undone++; });
  assert.equal(el.className, "toast info undo");
  assert.equal(el.children.length, 2);
  assert.equal(el.children[0].textContent, "Entry deleted.");
  assert.equal(el.children[1].textContent, "Undo");
  assert.equal(el.children[1].className, "toast-undo");
});

test("clicking Undo removes the toast and runs the callback once", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  let undone = 0;
  const el = t.showUndo("Entry deleted.", () => { undone++; });
  el.children[1].listeners.click();
  assert.equal(el.removed, true);
  assert.equal(undone, 1);
});

test("expiring without a click removes the toast but does not undo", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  let undone = 0;
  const el = t.showUndo("Entry deleted.", () => { undone++; }, 500);
  assert.equal(env.timers.pending.length, 1);
  assert.equal(env.timers.pending[0].ms, 500);
  env.timers.runAll();
  assert.equal(el.removed, true);
  assert.equal(undone, 0);
});

test("double-clicking Undo runs the callback only once", () => {
  const env = makeEnv();
  const t = createToaster({ host: env.host, document: env.doc, timers: env.timers });
  let undone = 0;
  const el = t.showUndo("Entry deleted.", () => { undone++; });
  el.children[1].listeners.click();
  el.children[1].listeners.click();
  assert.equal(undone, 1);
});
