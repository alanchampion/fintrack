"use strict";

import { computeStats } from "./projection.js";
import { toISO, formatCents, esc, addDays, addMonthsClamped } from "./utils.js";

// Interactive SVG step chart of the projected balance.
// Pure view code: it reads the timeline and the event list, and writes
// SVG nodes. No libraries, so it works offline.

const NS = "http://www.w3.org/2000/svg";
const H = 260;
const PL = 64, PB = 26, PT = 12, PR = 8;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let state = null; // set by drawChart; kept for redraws and hover
let tip = null;   // tooltip element, created on first use

function color(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function makeEl(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]);
  return node;
}

function formatAxis(cents) {
  // Guard against -0 from tick rounding (e.g. Math.ceil on negatives).
  if (Math.abs(cents) < 1) cents = 0;
  const units = cents / 100;
  if (Math.abs(units) >= 10000) {
    return (units / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "k";
  }
  return units.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Rounded tick values: 1, 2, 2.5 or 5 times a power of ten.
function niceTicks(lo, hi, count) {
  const range = hi - lo;
  if (range <= 0) return [lo];
  const rough = range / count;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  let step = pow * 10;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (pow * m >= rough) { step = pow * m; break; }
  }
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  return ticks;
}

// X tick dates with a density that fits the plot width.
function xTickDates(first, last, plotW) {
  const maxLabels = Math.max(2, Math.floor(plotW / 90));
  const spanDays = (last - first) / 86400000;
  const ticks = [];
  if (spanDays <= 100) {
    // Short range: weekly ticks, labeled "Mon 12".
    const step = Math.max(1, Math.ceil(spanDays / maxLabels / 7) * 7);
    let d = new Date(first);
    while (d.getTime() <= last) {
      ticks.push({ date: new Date(d), label: MONTHS[d.getMonth()] + " " + d.getDate() });
      d = addDays(d, step);
    }
  } else {
    // Long range: month starts, labeled "Mon" or "Mon 2027".
    const step = Math.max(1, Math.ceil(spanDays / 30.44 / maxLabels));
    let d = new Date(first.getFullYear(), first.getMonth(), 1);
    if (d.getTime() < first.getTime()) d = addMonthsClamped(d, step);
    while (d.getTime() <= last) {
      const label = (d.getMonth() === 0 || step >= 12)
        ? MONTHS[d.getMonth()] + " " + d.getFullYear()
        : MONTHS[d.getMonth()];
      ticks.push({ date: d, label: label });
      d = addMonthsClamped(d, step);
    }
  }
  return ticks;
}

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "chart-tip";
  document.getElementById("chart").parentElement.appendChild(tip);
  return tip;
}

function hideTip() {
  if (tip) tip.style.display = "none";
  if (state && state.guide) state.guide.setAttribute("visibility", "hidden");
  if (state && state.dot) state.dot.setAttribute("visibility", "hidden");
}

// Balance "as of" time t: the value of the last timeline point at or
// before t (multiple events on one day collapse to the final value).
function balanceAt(t) {
  let bal = state.timeline[0].cents;
  for (const pt of state.timeline) {
    if (pt.date.getTime() <= t) bal = pt.cents;
    else break;
  }
  return bal;
}

function onMove(evt, geo) {
  const svg = document.getElementById("chart");
  const rect = svg.getBoundingClientRect();
  const scale = rect.width / geo.W || 1;
  let mx = (evt.clientX - rect.left) / scale;
  mx = Math.min(Math.max(mx, PL), geo.W - PR);
  const frac = (mx - PL) / (geo.W - PL - PR);
  const t = geo.x0 + frac * (geo.x1 - geo.x0);
  const raw = new Date(t);
  const day = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());

  const bal = balanceAt(t);

  const tEl = ensureTip();
  const dayList = state.byDay[toISO(day)] || [];
  let html =
    "<div class='tip-date'>" +
    day.toLocaleDateString(undefined,
      { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
    "</div>" +
    "<div class='tip-bal" + (bal < 0 ? " neg" : "") + "'>Balance: " + formatCents(bal) + "</div>";
  if (dayList.length === 0) {
    html += "<div class='meta'>No transactions on this day.</div>";
  } else {
    for (const ev of dayList) {
      const cls = ev.cents < 0 ? "debit" : "credit";
      const sign = ev.cents < 0 ? "-" : "+";
      html += "<div class='tx'><span class='tx-label'>" + esc(ev.label) +
        "</span><span class='amt " + cls + "'>" + sign +
        formatCents(Math.abs(ev.cents)) + "</span></div>";
    }
  }
  tEl.innerHTML = html;
  tEl.style.display = "block";
  const tw = tEl.offsetWidth;
  const left = (mx + 14 + tw > geo.W) ? mx - tw - 14 : mx + 14;
  tEl.style.left = Math.max(2, left) + "px";

  state.guide.setAttribute("x1", mx);
  state.guide.setAttribute("x2", mx);
  state.guide.setAttribute("visibility", "visible");
  state.dot.setAttribute("cx", mx);
  state.dot.setAttribute("cy", geo.sy(bal));
  state.dot.setAttribute("visibility", "visible");
}

export function drawChart(timeline, events) {
  // Group events by calendar day, for the hover tooltip.
  const byDay = {};
  for (const ev of events || []) {
    const key = toISO(ev.date);
    (byDay[key] = byDay[key] || []).push(ev);
  }
  state = { timeline: timeline, byDay: byDay, guide: null, dot: null };
  paint();
}

function paint() {
  if (!state) return;
  const svg = document.getElementById("chart");
  const W = Math.max(320, svg.clientWidth || 800);
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  hideTip();

  const cText = color("--muted");
  const cGrid = color("--border");
  const cAccent = color("--accent");
  const cCredit = color("--credit");
  const cDebit = color("--debit");
  const cBg = color("--bg");

  const tl = state.timeline;
  if (!tl || tl.length < 2) {
    const empty = makeEl("text",
      { x: W / 2, y: H / 2, "text-anchor": "middle", fill: cText });
    empty.textContent = "Add entries to see the projection.";
    svg.appendChild(empty);
    return;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const pt of tl) {
    if (pt.cents < lo) lo = pt.cents;
    if (pt.cents > hi) hi = pt.cents;
  }
  lo = Math.min(0, lo);
  hi = Math.max(0, hi);
  if (hi === lo) hi = lo + 100;

  const x0 = tl[0].date.getTime();
  const x1 = tl[tl.length - 1].date.getTime();
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const sx = t => PL + plotW * (t - x0) / (x1 - x0);
  const sy = v => PT + plotH * (1 - (v - lo) / (hi - lo));

  // Danger zone: the strip below zero.
  if (lo < 0) {
    svg.appendChild(makeEl("rect",
      { x: PL, width: plotW, y: sy(0), height: sy(lo) - sy(0), fill: cDebit, opacity: "0.07" }));
  }

  // Y grid lines and labels.
  for (const v of niceTicks(lo, hi, 4)) {
    const y = sy(v);
    svg.appendChild(makeEl("line",
      { x1: PL, x2: W - PR, y1: y, y2: y, stroke: cGrid, "stroke-width": "1" }));
    const lab = makeEl("text",
      { x: PL - 6, y: y + 4, "text-anchor": "end", fill: cText, "font-size": "11" });
    lab.textContent = formatAxis(v);
    svg.appendChild(lab);
  }

  // X tick marks and labels.
  for (const tk of xTickDates(tl[0].date, tl[tl.length - 1].date, plotW)) {
    const x = sx(tk.date.getTime());
    if (x < PL - 1 || x > W - PR + 1) continue;
    svg.appendChild(makeEl("line",
      { x1: x, x2: x, y1: H - PB, y2: H - PB + 4, stroke: cText, "stroke-width": "1" }));
    const lab = makeEl("text",
      { x: x, y: H - 8, "text-anchor": "middle", fill: cText, "font-size": "11" });
    lab.textContent = tk.label;
    svg.appendChild(lab);
  }

  // Zero threshold: red and dashed when the range crosses zero.
  if (lo < 0) {
    svg.appendChild(makeEl("line",
      { x1: PL, x2: W - PR, y1: sy(0), y2: sy(0), stroke: cDebit, "stroke-width": "1", "stroke-dasharray": "5 4" }));
  }

  // Step path: balance holds at the old level until the event's own x,
  // then jumps vertically at that x. (Drawing the jump at the previous
  // event's x made every step start one event too early.)
  let d = "M " + sx(x0) + " " + sy(tl[0].cents);
  for (let i = 1; i < tl.length; i++) {
    const x = sx(tl[i].date.getTime());
    d += " L " + x + " " + sy(tl[i - 1].cents);
    d += " L " + x + " " + sy(tl[i].cents);
  }
  svg.appendChild(makeEl("path",
    { d: d, fill: "none", stroke: cAccent, "stroke-width": "2" }));

  // Highest and lowest markers.
  const stats = computeStats(tl);
  for (const pair of [[stats.max, cCredit], [stats.min, cDebit]]) {
    if (!isFinite(pair[0].cents)) continue;
    svg.appendChild(makeEl("circle",
      { cx: sx(pair[0].date.getTime()), cy: sy(pair[0].cents), r: "4", fill: pair[1] }));
  }

  // Hover layer: guide line, dot, tooltip, and an input-capture rectangle.
  const guide = makeEl("line",
    { y1: PT, y2: H - PB, stroke: cText, "stroke-width": "1", "stroke-dasharray": "3 3", visibility: "hidden" });
  const dot = makeEl("circle",
    { r: "4.5", fill: cAccent, stroke: cBg, "stroke-width": "2", visibility: "hidden" });
  const capture = makeEl("rect",
    { x: PL, y: PT, width: plotW, height: plotH, fill: "transparent" });
  capture.style.cursor = "crosshair";
  svg.appendChild(guide);
  svg.appendChild(dot);
  svg.appendChild(capture);
  state.guide = guide;
  state.dot = dot;

  const geo = { W: W, x0: x0, x1: x1, sx: sx, sy: sy };
  capture.addEventListener("pointermove", evt => onMove(evt, geo));
  capture.addEventListener("pointerleave", hideTip);
}

// Redraw at the new size when the window or layout changes.
const chartHost = document.getElementById("chart");
if (chartHost && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => paint()).observe(chartHost.parentElement);
}
