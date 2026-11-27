// Checks for the inline edit tray and its chevron toggle. The tray is
// built by app.js as a <li> and inserted under the edited row, so
// these tests read the source instead of driving a DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("tray is built in app.js with all form fields", () => {
  for (const id of ["edit-tray", "form-edit", "e-label", "e-sign",
    "e-amount", "e-freq", "e-date", "e-date-label",
    "btn-close-tray"]) {
    assert.ok(app.includes(id), "missing #" + id + " in app.js");
  }
});

test("tray is placed after the edited row, not in index.html", () => {
  assert.ok(app.includes("placeTrayAfterRow"), "row placement missing");
  assert.ok(!html.includes("edit-tray"),
    "index.html must not carry a static tray");
});

test("tray fields are queried through the tray, not document", () => {
  // Regression: getElementById cannot find the detached tray, which
  // threw "Cannot set properties of null" on the first Edit click.
  const openFn = app.slice(app.indexOf("function openEditTray"),
    app.indexOf("function closeEditTray"));
  assert.ok(!openFn.includes("document.getElementById"),
    "openEditTray must read fields via the tray element");
  assert.ok(openFn.includes("tray.querySelector"), "tray.querySelector missing");
});

test("tray survives a re-render by re-expanding under the row", () => {
  assert.ok(app.includes("reopenEditor"),
    "re-render must re-open the editor");
});

test("deletion lives inside the tray, not on rows", () => {
  // The delete cross moved from the row into the tray. Rows carry no
  // .del button, and the tray has its own delete control.
  assert.ok(!app.includes("class='del'"), "rows must not carry a .del button");
  assert.ok(app.includes("btn-delete-entry"), "tray delete button missing");
  assert.ok(app.includes("Entry deleted."), "delete confirmation toast missing");
});

test("CSS hides the tray when hidden is set", () => {
  // Regression: ul.entries li's display:flex beat the browser default
  // [hidden]{display:none}, so closing left the tray visible.
  assert.ok(css.includes(".tray[hidden]"),
    "styles.css must force display:none on .tray[hidden]");
});

test("clicking the chevron on the open row closes the editor instead of reopening", () => {
  assert.ok(app.includes(
    "trayState.open && trayState.kind === editBtn.dataset.kind"),
    "toggle-on-same-row branch missing");
});

test("rows carry a rotating chevron, not an Edit label", () => {
  assert.ok(app.includes("edit chev"), "chevron class missing on rows");
  assert.ok(!app.includes(">Edit</button>"), "old Edit label still present");
  assert.ok(css.includes("ul.entries .edit.open") &&
    css.includes("rotate(90deg)"),
    "rotation style missing");
  assert.ok(app.includes("syncChevrons"),
    "chevron state sync missing");
});
