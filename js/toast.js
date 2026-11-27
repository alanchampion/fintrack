"use strict";

// Toast messages: small non-blocking notices in a corner of the page.
// Built for tests: the caller injects a host element, a document-like
// element factory, and a timer pair. In the browser, createToaster()
// with no arguments wires those to the real DOM and timers.

const DEFAULT_MS = 4000;

function realEnv() {
  return {
    host: document.getElementById("toasts"),
    document: document,
    // Wrap the window timers: passing them detached from the global
    // object can throw "Illegal invocation" in some browsers.
    timers: {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: id => clearTimeout(id)
    }
  };
}

// env: { host, document, timers: { set(fn, ms), clear(id) } }
// document must provide createElement(tag) returning an element with
// className, textContent, setAttribute, addEventListener, appendChild
// and remove. The host receives the finished toast nodes.
export function createToaster(env) {
  const e = env || realEnv();
  if (!e.host) return { show: () => null, showUndo: () => null };

  const dismiss = el => () => el.remove();

  return {
    // Show a message. kind: "info" | "warn" | "error". ms <= 0 keeps
    // the toast until clicked. Returns the toast element.
    show(message, kind, ms) {
      const k = kind || "info";
      const t = (ms === undefined) ? DEFAULT_MS : ms;
      const el = e.document.createElement("div");
      el.className = "toast " + k;
      el.textContent = message;
      el.setAttribute("role", "status");
      e.host.appendChild(el);
      const remove = dismiss(el);
      el.addEventListener("click", remove);
      if (t > 0) e.timers.set(remove, t);
      return el;
    },

    // Show a message with an Undo button. The button removes the
    // toast and calls onUndo. Expiring without a click also removes
    // the toast but must NOT call onUndo.
    showUndo(message, onUndo, ms) {
      const el = e.document.createElement("div");
      el.className = "toast info undo";
      el.setAttribute("role", "status");

      const span = e.document.createElement("span");
      span.textContent = message;
      const btn = e.document.createElement("button");
      btn.textContent = "Undo";
      btn.className = "toast-undo";
      el.append(span, btn);
      e.host.appendChild(el);

      let done = false;
      const remove = () => {
        done = true;
        el.remove();
      };
      btn.addEventListener("click", () => {
        if (done) return;
        remove();
        onUndo();
      });
      el.addEventListener("click", e2 => {
        // Ignore clicks on the button itself; the outer click removes
        // the toast on the undo timeout too.
        if (e2 && e2.target === btn) return;
        remove();
      });
      const t = (ms === undefined) ? DEFAULT_MS : ms;
      if (t > 0) e.timers.set(remove, t);
      return el;
    }
  };
}
