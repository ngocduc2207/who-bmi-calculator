"use strict";
/*
 * who-charts.js — generalized canvas growth chart (one per indicator × view).
 * Draws WHO z-score or percentile reference curves (from LMS) plus the patient
 * marker, with zoom / pan / hover preserved. Reads shared state via getState().
 */

// ---- small helpers ----
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function chooseStep(range, target, cands) { var raw = range / target; for (var i = 0; i < cands.length; i++) if (cands[i] >= raw) return cands[i]; return cands[cands.length - 1]; }
function fmtNum(v) { var r = Math.round(v * 1000) / 1000; return Number.isInteger(r) ? String(r) : r.toFixed(1); }
var STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];

// Build the reference curves (one polyline per z/percentile line) for an
// indicator+sex, sampled across its x-domain. Cached by the caller.
function buildCurves(indicator, sex, ageDaysForTable, view) {
  var lines = [], xs = [], xKind, xDomain, yLabel = indicator.yLabel, tableKey;
  if (indicator.xKind === "age") {
    xKind = "age"; xDomain = [0, indicator.xMaxMonths];
    for (var m = 0; m <= indicator.xMaxMonths; m++) xs.push(m);
    var lmsFor = function (m) { return WHO_LMS.lmsAtAge(indicator.key, sex, m * 30.4375); };
    tableKey = indicator.key;
    lines = sampleLines(view, indicator, xs, lmsFor, tableKey);
  } else {
    // weight-for-length/height: pick wfl or wfh by patient convention
    tableKey = resolveTable("wflh", ageDaysForTable == null ? 0 : ageDaysForTable);
    var meta = WHO_DATA[tableKey];
    xKind = tableKey === "wfl" ? "length" : "height";
    xDomain = meta.domainCm.slice();
    yLabel = (tableKey === "wfl" ? "Weight (kg) — for length" : "Weight (kg) — for height");
    for (var c = xDomain[0]; c <= xDomain[1] + 1e-9; c += 0.5) xs.push(Math.round(c * 10) / 10);
    var lmsForC = function (cm) { return WHO_LMS.lmsAtCm(tableKey, sex, cm); };
    lines = sampleLines(view, indicator, xs, lmsForC, tableKey);
  }
  // y-range from curve extremes
  var ymin = Infinity, ymax = -Infinity;
  lines.forEach(function (ln) { ln.ys.forEach(function (y) { if (y != null && isFinite(y)) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; } }); });
  var pad = (ymax - ymin) * 0.05 || 1;
  var ylo = ymin - pad; if (ymin >= 0 && ylo < 0) ylo = 0;
  return { lines: lines, xs: xs, xKind: xKind, xDomain: xDomain, yDomain: [ylo, ymax + pad], yLabel: yLabel, tableKey: tableKey };
}

function sampleLines(view, indicator, xs, lmsFor, tableKey) {
  var specs = view === "z"
    ? indicator.zLines.map(function (z) { return { key: z, z: z, style: zLineStyle(z) }; })
    : PCT_LINES.map(function (p) { return { key: p, z: WHO_LMS.Z_FOR_PCT[p], style: pctLineStyle(p) }; });
  return specs.map(function (sp) {
    var ys = xs.map(function (x) {
      var lms = lmsFor(x);
      return lms ? WHO_LMS.valueFromZ(sp.z, lms[0], lms[1], lms[2]) : null;
    });
    return { key: sp.key, z: sp.z, style: sp.style, ys: ys };
  });
}

var PAD = { left: 52, right: 46, top: 16, bottom: 38 };

function buildWhoChart(canvas, indicator, view, getState) {
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var cssW = canvas.width, cssH = canvas.height;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.aspectRatio = cssW + " / " + cssH;
  var ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);

  var plot = { left: PAD.left, top: PAD.top, width: cssW - PAD.left - PAD.right, height: cssH - PAD.top - PAD.bottom };
  plot.right = plot.left + plot.width; plot.bottom = plot.top + plot.height;

  var cache = null, view0 = null, hover = null, pan = null;

  function ensureCache() {
    var st = getState();
    var sex = st.sex || "girls";
    var ageDays = st.result ? st.result.ageDays : null;
    var key = sex + "|" + (indicator.xKind === "age" ? "" : resolveTable("wflh", ageDays || 0));
    if (!cache || cache.key !== key) {
      cache = buildCurves(indicator, sex, ageDays, view);
      cache.key = key;
      view0 = { xMin: cache.xDomain[0], xMax: cache.xDomain[1], yMin: cache.yDomain[0], yMax: cache.yDomain[1] };
      vw = { xMin: view0.xMin, xMax: view0.xMax, yMin: view0.yMin, yMax: view0.yMax };
    }
  }
  var vw = null;

  function xToPx(x) { return plot.left + (x - vw.xMin) / (vw.xMax - vw.xMin) * plot.width; }
  function pxToX(px) { return vw.xMin + (px - plot.left) / plot.width * (vw.xMax - vw.xMin); }
  function yToPx(y) { return plot.top + (1 - (y - vw.yMin) / (vw.yMax - vw.yMin)) * plot.height; }
  function pxToY(py) { return vw.yMin + (1 - (py - plot.top) / plot.height) * (vw.yMax - vw.yMin); }

  function clampView() {
    var fx = view0.xMax - view0.xMin, fy = view0.yMax - view0.yMin;
    var sx = clamp(vw.xMax - vw.xMin, fx / 50, fx), sy = clamp(vw.yMax - vw.yMin, fy / 50, fy);
    var cx = clamp((vw.xMin + vw.xMax) / 2, view0.xMin + sx / 2, view0.xMax - sx / 2);
    var cy = clamp((vw.yMin + vw.yMax) / 2, view0.yMin + sy / 2, view0.yMax - sy / 2);
    vw.xMin = cx - sx / 2; vw.xMax = cx + sx / 2; vw.yMin = cy - sy / 2; vw.yMax = cy + sy / 2;
  }
  function zoomAt(px, py, f) {
    var ax = pxToX(px), ay = pxToY(py);
    var sx = (vw.xMax - vw.xMin) * f, sy = (vw.yMax - vw.yMin) * f;
    var frx = (ax - vw.xMin) / (vw.xMax - vw.xMin), fry = (ay - vw.yMin) / (vw.yMax - vw.yMin);
    vw.xMin = ax - frx * sx; vw.xMax = vw.xMin + sx; vw.yMin = ay - fry * sy; vw.yMax = vw.yMin + sy;
    clampView(); draw();
  }
  function resetView() { vw = { xMin: view0.xMin, xMax: view0.xMax, yMin: view0.yMin, yMax: view0.yMax }; draw(); }

  // patient marker {x, y, z, pct, label} or null
  function markerData() {
    var st = getState(); if (!st.result) return null;
    var res = st.result.indicators[indicator.key]; if (!res || res.na || res.z == null) return null;
    var x, y;
    if (indicator.xKind === "age") { x = st.result.ageMonths; y = res.value; }
    else { x = res.cm; y = res.value; }
    var lab = (indicator.xKind === "age" ? st.result.ageLabel : (fmtNum(x) + " cm")) +
      (view === "z" ? "  z " + res.z.toFixed(2) : "  " + res.pct.toFixed(1) + "th");
    return { x: x, y: y, z: res.z, pct: res.pct, label: lab };
  }

  function draw() {
    ensureCache();
    ctx.clearRect(0, 0, cssW, cssH);

    // clipped: grid + curves
    ctx.save(); ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.width, plot.height); ctx.clip();
    var xStep = chooseStep(vw.xMax - vw.xMin, 8, indicator.xKind === "age" ? [3, 6, 12, 24, 36, 48, 60] : STEPS);
    var yStep = chooseStep(vw.yMax - vw.yMin, 6, STEPS);
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1;
    for (var gx = Math.ceil(vw.xMin / xStep) * xStep; gx <= vw.xMax; gx += xStep) { var px = xToPx(gx); ctx.beginPath(); ctx.moveTo(px, plot.top); ctx.lineTo(px, plot.bottom); ctx.stroke(); }
    for (var gy = Math.ceil(vw.yMin / yStep) * yStep; gy <= vw.yMax; gy += yStep) { var py = yToPx(gy); ctx.beginPath(); ctx.moveTo(plot.left, py); ctx.lineTo(plot.right, py); ctx.stroke(); }
    // curves
    cache.lines.forEach(function (ln) {
      ctx.beginPath(); var started = false;
      for (var i = 0; i < cache.xs.length; i++) {
        if (ln.ys[i] == null) { started = false; continue; }
        var X = xToPx(cache.xs[i]), Y = yToPx(ln.ys[i]);
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      }
      ctx.strokeStyle = ln.style.color; ctx.lineWidth = ln.style.width; ctx.stroke();
    });
    // marker crosshair + dot
    var mk = markerData();
    if (mk && mk.x >= vw.xMin && mk.x <= vw.xMax) {
      var mx = xToPx(mk.x), my = yToPx(clamp(mk.y, vw.yMin, vw.yMax));
      ctx.strokeStyle = "rgba(20,20,20,0.55)"; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(mx, plot.top); ctx.lineTo(mx, plot.bottom); ctx.moveTo(plot.left, my); ctx.lineTo(plot.right, my); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#1565c0"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // curve end-labels
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "10px -apple-system,Segoe UI,Roboto,sans-serif";
    cache.lines.forEach(function (ln) {
      var last = null; for (var i = cache.xs.length - 1; i >= 0; i--) { if (ln.ys[i] != null) { last = i; break; } }
      if (last == null) return;
      var y = yToPx(ln.ys[last]); if (y < plot.top - 2 || y > plot.bottom + 2) return;
      ctx.fillStyle = ln.style.color; ctx.fillText(ln.style.label, plot.right + 3, y);
    });

    // axes labels
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.font = "10px -apple-system,Segoe UI,Roboto,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (var lx = Math.ceil(vw.xMin / xStep) * xStep; lx <= vw.xMax; lx += xStep) ctx.fillText(fmtNum(lx), xToPx(lx), plot.bottom + 4);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var ly = Math.ceil(vw.yMin / yStep) * yStep; ly <= vw.yMax; ly += yStep) ctx.fillText(fmtNum(ly), plot.left - 6, yToPx(ly));
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(cache.xKind === "age" ? "Age (months)" : (cache.xKind === "length" ? "Length (cm)" : "Height (cm)"), plot.left + plot.width / 2, plot.bottom + 18);

    // frame
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

    if (hover) {
      ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hover.px, plot.top); ctx.lineTo(hover.px, plot.bottom); ctx.moveTo(plot.left, hover.py); ctx.lineTo(plot.right, hover.py); ctx.stroke(); ctx.restore();
    }
  }

  // ---- tooltip ----
  var tip = document.createElement("div"); tip.className = "who-tip"; tip.style.display = "none"; document.body.appendChild(tip);
  function pxOf(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cssW / r.width), y: (e.clientY - r.top) * (cssH / r.height), sx: cssW / r.width, sy: cssH / r.height }; }
  var inside = function (x, y) { return x >= plot.left && x <= plot.right && y >= plot.top && y <= plot.bottom; };

  canvas.addEventListener("mousedown", function (e) { var p = pxOf(e); pan = { x: e.clientX, y: e.clientY, sx: p.sx, sy: p.sy, vw: { xMin: vw.xMin, xMax: vw.xMax, yMin: vw.yMin, yMax: vw.yMax } }; canvas.style.cursor = "grabbing"; hover = null; tip.style.display = "none"; });
  window.addEventListener("mousemove", function (e) {
    if (!pan) return;
    var dx = (e.clientX - pan.x) * pan.sx / plot.width * (pan.vw.xMax - pan.vw.xMin);
    var dy = (e.clientY - pan.y) * pan.sy / plot.height * (pan.vw.yMax - pan.vw.yMin);
    vw.xMin = pan.vw.xMin - dx; vw.xMax = pan.vw.xMax - dx; vw.yMin = pan.vw.yMin + dy; vw.yMax = pan.vw.yMax + dy; clampView(); draw();
  });
  window.addEventListener("mouseup", function () { if (pan) { pan = null; canvas.style.cursor = "crosshair"; } });
  canvas.addEventListener("wheel", function (e) { e.preventDefault(); var p = pxOf(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 0.85 : 1 / 0.85); }, { passive: false });

  // ---- touch: single-finger pan + two-finger pinch-zoom ----
  var tch = null;
  function touchDist(t1, t2) { var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY; return Math.sqrt(dx * dx + dy * dy); }
  function touchMid(t1, t2, rect, sc) { return { x: ((t1.clientX + t2.clientX) / 2 - rect.left) * sc, y: ((t1.clientY + t2.clientY) / 2 - rect.top) * sc }; }
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect(), sc = cssW / rect.width;
    if (e.touches.length === 1) {
      tch = { mode: "pan", cx: e.touches[0].clientX, cy: e.touches[0].clientY, sc: sc };
    } else if (e.touches.length >= 2) {
      var mid = touchMid(e.touches[0], e.touches[1], rect, sc);
      tch = { mode: "pinch", dist: touchDist(e.touches[0], e.touches[1]), mx: mid.x, my: mid.y };
    }
    hover = null; tip.style.display = "none";
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (!tch) return;
    var rect = canvas.getBoundingClientRect(), sc = cssW / rect.width;
    if (e.touches.length >= 2 && tch.mode === "pinch") {
      var d = touchDist(e.touches[0], e.touches[1]);
      var mid = touchMid(e.touches[0], e.touches[1], rect, sc);
      zoomAt(tch.mx, tch.my, tch.dist / d);
      tch.dist = d; tch.mx = mid.x; tch.my = mid.y;
    } else if (e.touches.length === 1 && tch.mode === "pan") {
      var dx = (e.touches[0].clientX - tch.cx) * tch.sc / plot.width * (vw.xMax - vw.xMin);
      var dy = (e.touches[0].clientY - tch.cy) * tch.sc / plot.height * (vw.yMax - vw.yMin);
      vw.xMin -= dx; vw.xMax -= dx; vw.yMin += dy; vw.yMax += dy;
      clampView(); draw();
      tch.cx = e.touches[0].clientX; tch.cy = e.touches[0].clientY;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    if (e.touches.length === 0) { tch = null; }
    else if (e.touches.length === 1 && tch && tch.mode === "pinch") {
      var rect = canvas.getBoundingClientRect(), sc = cssW / rect.width;
      tch = { mode: "pan", cx: e.touches[0].clientX, cy: e.touches[0].clientY, sc: sc };
    }
  }, { passive: false });

  canvas.addEventListener("mousemove", function (e) {
    if (pan) return;
    var p = pxOf(e); if (!inside(p.x, p.y)) { hover = null; tip.style.display = "none"; draw(); return; }
    hover = { px: p.x, py: p.y }; var st = getState(); var sex = st.sex || "girls";
    var x = pxToX(p.x), y = pxToY(p.y), lms, remapKey, xlab;
    if (indicator.xKind === "age") { lms = WHO_LMS.lmsAtAge(indicator.key, sex, x * 30.4375); remapKey = indicator.key; xlab = "Age " + fmtNum(x) + " mo"; }
    else { remapKey = cache.tableKey; lms = WHO_LMS.lmsAtCm(remapKey, sex, x); xlab = (cache.xKind === "length" ? "Length " : "Height ") + fmtNum(x) + " cm"; }
    var zline = ""; if (lms) { var s = WHO_LMS.score(remapKey, y, lms); zline = "z " + s.z.toFixed(2) + " · " + s.pct.toFixed(1) + "th"; }
    tip.innerHTML = "<b>" + indicator.label + "</b><br>" + xlab + "<br>" + indicator.yLabel.replace(/ —.*/, "") + ": " + fmtNum(y) + "<br>" + zline;
    tip.style.display = "block"; tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px";
    var tr = tip.getBoundingClientRect(); if (tr.right > innerWidth) tip.style.left = (e.clientX - tr.width - 14) + "px"; if (tr.bottom > innerHeight) tip.style.top = (e.clientY - tr.height - 14) + "px";
    draw();
  });
  canvas.addEventListener("mouseleave", function () { hover = null; tip.style.display = "none"; draw(); });

  // zoom buttons
  var card = canvas.parentElement; var ctr = document.createElement("div"); ctr.className = "zoom-ctrl";
  function mk(t, title, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = t; b.title = title; b.addEventListener("click", fn); ctr.appendChild(b); }
  mk("+", "Zoom in", function () { zoomAt(plot.left + plot.width / 2, plot.top + plot.height / 2, 0.8); });
  mk("−", "Zoom out", function () { zoomAt(plot.left + plot.width / 2, plot.top + plot.height / 2, 1 / 0.8); });
  mk("⟲", "Reset", resetView);
  card.appendChild(ctr);

  return { indicator: indicator, view: view, draw: draw, invalidate: function () { cache = null; draw(); } };
}
