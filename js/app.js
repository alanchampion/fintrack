"use strict";

import { loadDoc, saveDoc } from "./storage.js";
import { defaultEnd, maxEnd, buildEvents, buildTimeline, computeStats, STEP, nextOccurrence } from "./projection.js";
import { drawChart } from "./chart.js";
import { createToaster } from "./toast.js";
import { sortRecurring, sortOnetime } from "./sorting.js";
import { parseDate, toISO, today, addDays, addMonthsClamped, formatCents, esc } from "./utils.js";

// Toast notices (non-blocking replacements for alert()).
const toaster = createToaster();

let doc = loadDoc();
let projectionEnd = defaultEnd();
// Sort modes for the two entry lists ("upcoming" | "amount" | "startdate").
let sortModeRecur = "upcoming";
let sortModeOnetime = "upcoming";
document.getElementById("p-end").value = toISO(projectionEnd);
document.getElementById("p-end").max = toISO(maxEnd());
// The default range equals the 6-month preset, so mark it active.
const sixMonthBtn = document.querySelector(".preset[data-months='6']");
if (sixMonthBtn) sixMonthBtn.classList.add("active");

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

// ---------- rendering ----------

function renderEntries() {
  const lr = document.getElementById("list-recur");
  lr.innerHTML = "";
  for (const r of sortRecurring(doc.recurring, sortModeRecur,
    rule => nextOccurrence(rule, today()))) {
    const li = document.createElement("li");
    // Next charge date replaces the old "from <start date>" display.
    const next = nextOccurrence(r, today());
    const nextTxt = next ? toISO(next) : "no upcoming date";
    li.innerHTML =
      "<span>" + esc(r.label) + " <span class='meta'>(" + (STEP[r.frequency] ? STEP[r.frequency].label : r.frequency) +
      ", next " + nextTxt + ")</span></span>" +
      "<span><span class='amount " + r.sign + "'>" + (r.sign === "debit" ? "-" : "+") +
      formatCents(r.amount) + "</span> " +
      "<button class='edit chev' data-kind='recurring' data-id='" + r.id + "' title='Edit' aria-expanded='false'>&#9656;</button></span>";
    lr.appendChild(li);
  }

  const lo = document.getElementById("list-onetime");
  lo.innerHTML = "";
  for (const o of sortOnetime(doc.onetime, sortModeOnetime, today())) {
    const li = document.createElement("li");
    li.innerHTML =
      "<span>" + esc(o.label) + " <span class='meta'>(" + o.date + ")</span></span>" +
      "<span><span class='amount " + o.sign + "'>" + (o.sign === "debit" ? "-" : "+") +
      formatCents(o.amount) + "</span> " +
      "<button class='edit chev' data-kind='onetime' data-id='" + o.id + "' title='Edit' aria-expanded='false'>&#9656;</button></span>";
    lo.appendChild(li);
  }

  // If a row's editor was open before the re-render, re-expand it
  // under the same item so editing survives sorting and deletion.
  if (trayState.open && trayState.id) reopenEditor();
}

function renderDue(events) {
  const ul = document.getElementById("list-due");
  ul.innerHTML = "";
  const start = today();
  const end = addDays(start, 7);
  const due = events.filter(e => e.date >= start && e.date <= end);
  if (due.length === 0) {
    ul.innerHTML = "<li class='meta'>Nothing due this week.</li>";
    return;
  }
  for (const e of due) {
    const li = document.createElement("li");
    li.innerHTML =
      "<span>" + esc(e.label) + " <span class='meta'>(" + toISO(e.date) + ")</span></span>" +
      "<span class='amount " + (e.cents < 0 ? "debit" : "credit") + "'>" +
      (e.cents < 0 ? "-" : "+") + formatCents(Math.abs(e.cents)) + "</span>";
    ul.appendChild(li);
  }
}

function render() {
  saveDoc(doc);
  const end = projectionEnd;
  const events = buildEvents(doc, end);
  const timeline = buildTimeline(doc, events);
  const stats = computeStats(timeline);

  document.getElementById("bal-now").textContent = formatCents(timeline[0].cents);
  const rangeTxt = " (to " + projectionEnd.toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" }) + ")";
  document.getElementById("lbl-max").textContent = "Highest" + rangeTxt;
  document.getElementById("lbl-min").textContent = "Lowest" + rangeTxt;
  document.getElementById("bal-max").textContent =
    isFinite(stats.max.cents) ? formatCents(stats.max.cents) : "-";
  document.getElementById("bal-min").textContent =
    isFinite(stats.min.cents) ? formatCents(stats.min.cents) : "-";

  renderEntries();
  renderDue(events);
  drawChart(timeline, events);
}

// ---------- forms ----------

document.getElementById("form-recur").addEventListener("submit", e => {
  e.preventDefault();
  doc.recurring.push({
    id: uid(),
    label: document.getElementById("r-label").value.trim(),
    sign: document.getElementById("r-sign").value,
    amount: Math.round(parseFloat(document.getElementById("r-amount").value) * 100),
    frequency: document.getElementById("r-freq").value,
    startDate: document.getElementById("r-start").value
  });
  e.target.reset();
  render();
});

document.getElementById("form-onetime").addEventListener("submit", e => {
  e.preventDefault();
  doc.onetime.push({
    id: uid(),
    label: document.getElementById("o-label").value.trim(),
    sign: document.getElementById("o-sign").value,
    amount: Math.round(parseFloat(document.getElementById("o-amount").value) * 100),
    date: document.getElementById("o-date").value
  });
  e.target.reset();
  render();
});

document.getElementById("form-start").addEventListener("submit", e => {
  e.preventDefault();
  doc.startingBalance = Math.round(parseFloat(document.getElementById("s-amount").value) * 100);
  render();
});

// Row clicks: the chevron opens/closes the inline editor.
document.body.addEventListener("click", e => {
  const editBtn = e.target.classList.contains("edit") ? e.target : null;
  if (!editBtn) return;
  // Clicking the chevron on the row that is already open closes the
  // editor and discards any unsaved changes.
  if (trayState.open && trayState.kind === editBtn.dataset.kind &&
      trayState.id === editBtn.dataset.id) {
    closeEditTray();
  } else {
    openEditTray(editBtn.dataset.kind, editBtn.dataset.id);
  }
});

// ---------- edit tray ----------

// Which item the inline editor is editing: kind is "recurring" or
// "onetime". The tray is a <li> built once and moved under whichever
// row is being edited, so it gets that row's full width.
const trayState = { open: false, kind: null, id: null };

const tray = buildTrayElement();

function buildTrayElement() {
  const li = document.createElement("li");
  li.id = "edit-tray";
  li.className = "tray";
  li.hidden = true;
  li.innerHTML =
    "<button type='button' class='secondary tray-close' id='btn-close-tray' title='Close'>&times;</button>" +
    "<form id='form-edit'>" +    "<div class='field'><label>Description</label><input id='e-label' required placeholder='Rent'></div>" +
    "<div class='field'><label>Type</label>" +
    "<select id='e-sign'><option value='debit'>Debit</option><option value='credit'>Credit</option></select></div>" +
    "<div class='field'><label>Amount (major units)</label><input id='e-amount' type='number' step='0.01' min='0.01' required></div>" +
    "<div class='field'><label>Frequency</label>" +
    "<select id='e-freq'>" +
    "<option value='weekly'>Every week</option>" +
    "<option value='biweekly'>Every other week</option>" +
    "<option value='monthly'>Every month</option>" +
    "<option value='bimonthly'>Every 2 months</option>" +
    "<option value='quarterly'>Every 3 months</option>" +
    "<option value='semiannual'>Every 6 months</option>" +
    "<option value='yearly'>Every year</option>" +
    "</select></div>" +
    "<div class='field'><label id='e-date-label'>Start date</label><input id='e-date' type='date' required></div>" +
    "<div class='field'><label>&nbsp;</label><button type='submit'>Save</button></div>" +
    "<div class='field'><label>&nbsp;</label>" +
    "<button type='button' class='danger' id='btn-delete-entry'>Delete</button></div>" +
    "</form>";

  li.querySelector("#form-edit").addEventListener("submit", e => {
    e.preventDefault();
    if (!trayState.open) return;
    const item = findItem(trayState.kind, trayState.id);
    if (!item) { closeEditTray(); return; }
    const amount = Math.round(parseFloat(li.querySelector("#e-amount").value) * 100);
    if (!isFinite(amount) || amount <= 0) {
      toaster.show("Enter an amount greater than zero.", "warn");
      return;
    }
    item.label = li.querySelector("#e-label").value.trim();
    item.sign = li.querySelector("#e-sign").value;
    item.amount = amount;
    if (trayState.kind === "recurring") {
      item.frequency = li.querySelector("#e-freq").value;
      item.startDate = li.querySelector("#e-date").value;
    } else {
      item.date = li.querySelector("#e-date").value;
    }
    closeEditTray();
    render();
    toaster.show("Changes saved.", "info");
  });

// Delete: remove the item the tray is editing, then re-render.
  li.querySelector("#btn-delete-entry").addEventListener("click", () => {
    if (!trayState.open) return;
    const kind = trayState.kind;
    const id = trayState.id;
    if (!kind || !id) return;
    // Keep a copy so Undo can put the entry back exactly as it was.
    const removed = findItem(kind, id);
    if (!removed) return;
    doc[kind] = doc[kind].filter(item => item.id !== id);
    closeEditTray();
    render();
    toaster.showUndo("Entry deleted.",
      () => {
        doc[kind].push(removed);
        render();
      },
      8000);
  });

  li.querySelector("#btn-close-tray").addEventListener("click", closeEditTray);
  return li;
}

function findItem(kind, id) {
  return doc[kind].find(item => item.id === id);
}

function listEl(kind) {
  return document.getElementById(kind === "recurring" ? "list-recur" : "list-onetime");
}

// Move the tray into the list, right below the row being edited.
function placeTrayAfterRow(row) {
  row.after(tray);
  tray.hidden = false;
}

// Find the <li> row of trayState.id in its list, or null if missing.
function findRow() {
  return listEl(trayState.kind)
    .querySelector("button.edit[data-id='" + trayState.id + "']")
    ?.closest("li") || null;
}

// Re-attach the tray after a re-render. Hides itself when the item
// no longer exists. Field values are not reloaded: the tray keeps
// what the user typed through sort toggles and deletions.
function reopenEditor() {
  const row = findRow();
  if (!row) { closeEditTray(); return; }
  placeTrayAfterRow(row);
}

// Expand the editor under the edited row. The frequency field is
// shown for recurring rules only; one-time entries edit a plain date.
// The tray must be attached to the DOM first: document.getElementById
// does not see detached elements, so fields are read via the tray.
function openEditTray(kind, id) {
  const item = findItem(kind, id);
  if (!item) return;
  trayState.open = true;
  trayState.kind = kind;
  trayState.id = id;

  const row = listEl(kind)
    .querySelector("button.edit[data-id='" + id + "']")
    ?.closest("li");
  if (!row) { closeEditTray(); return; }
  row.after(tray);
  tray.hidden = false;

  const q = sel => tray.querySelector(sel);
  q("#e-label").value = item.label;
  q("#e-sign").value = item.sign;
  q("#e-amount").value = (item.amount / 100).toFixed(2);

  const isRecurring = kind === "recurring";
  q("#e-freq").closest(".field").hidden = !isRecurring;
  q("#e-date-label").textContent = isRecurring ? "Start date" : "Date";
  if (isRecurring) q("#e-freq").value = item.frequency;
  q("#e-date").value = isRecurring ? item.startDate : item.date;

  q("#e-label").focus();
  syncChevrons();
}

// Toggle the chevron state on all rows: expanded and rotated on the
// open row, collapsed elsewhere. Called from open and close so the
// arrow always reflects reality.
function syncChevrons() {
  for (const btn of document.querySelectorAll("button.edit.chev")) {
    const isOpen = trayState.open && trayState.kind === btn.dataset.kind &&
      trayState.id === btn.dataset.id;
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

function closeEditTray() {
  trayState.open = false;
  trayState.kind = null;
  trayState.id = null;
  tray.hidden = true;
  syncChevrons();
}

// Close the editor when the user presses Escape.
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && trayState.open) closeEditTray();
});

// ---------- list sorting ----------

// Sort bars: clicking an option sets that list's mode, highlights it,
// and re-renders the list.
document.querySelectorAll(".sortbar").forEach(bar => {
  const list = bar.dataset.list; // "recurring" | "onetime"
  bar.addEventListener("click", e => {
    const btn = e.target.closest(".sortopt");
    if (!btn) return;
    if (list === "recurring") sortModeRecur = btn.dataset.sort;
    else sortModeOnetime = btn.dataset.sort;
    for (const b of bar.querySelectorAll(".sortopt")) {
      b.classList.toggle("active", b === btn);
    }
    renderEntries();
  });
});

// ---------- projection horizon ----------

document.getElementById("form-horizon").addEventListener("submit", e => {
  e.preventDefault();
  const picked = parseDate(document.getElementById("p-end").value);
  if (picked > today() && picked <= maxEnd()) {
    projectionEnd = picked;
    render();
  } else if (picked > maxEnd()) {
    toaster.show("Pick a date at most 5 years from today.", "warn");
  } else {
    toaster.show("Pick a date in the future.", "warn");
  }
});

// Preset horizons: end date = today + N days or N months (clamped like
// defaultEnd), then a normal render. Marks the clicked preset active
// until a custom date is applied.
function setHorizon(days, months) {
  const end = days
    ? addDays(today(), days)
    : addMonthsClamped(today(), months);
  projectionEnd = end;
  document.getElementById("p-end").value = toISO(end);
  markActivePreset(days, months);
  render();
}

function markActivePreset(days, months) {
  for (const btn of document.querySelectorAll(".preset")) {
    const active = days
      ? (btn.dataset.days && Number(btn.dataset.days) === days)
      : (btn.dataset.months && Number(btn.dataset.months) === months);
    btn.classList.toggle("active", Boolean(active));
  }
}

// Clear the active marker when a custom date is applied.
document.getElementById("form-horizon").addEventListener("input", () => {
  for (const btn of document.querySelectorAll(".preset")) {
    btn.classList.remove("active");
  }
});

for (const btn of document.querySelectorAll(".preset")) {
  btn.addEventListener("click", () => {
    if (btn.dataset.days) setHorizon(Number(btn.dataset.days), 0);
    else setHorizon(0, Number(btn.dataset.months));
  });
}

// ---------- export / import ----------

document.getElementById("btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fintrack-backup-" + toISO(today()) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("btn-import").addEventListener("click", () =>
  document.getElementById("file-import").click());

document.getElementById("file-import").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.recurring) &&
          Array.isArray(parsed.onetime)) {
        doc = parsed;
        render();
      } else {
        toaster.show("Not a valid FinTrack backup file.", "error");
      }
    } catch (err) {
      toaster.show("Could not read that file as JSON.", "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

render();