"use strict";
/* who-app.js — form controller, results panel, builds the 8 charts. */

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { sex: "girls", units: "metric", pos: "standing", posManual: false, oed: "no", result: null };
  function getState() { return state; }

  // ---- unit helpers ----
  function toCm(v) { return state.units === "imperial" ? v * 2.54 : v; }
  function toKg(v) { return state.units === "imperial" ? v / 2.20462 : v; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // ---- segmented controls ----
  function wireSeg(id, attr, onPick) {
    var seg = $(id);
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || b.disabled) return;
      Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on"); onPick(b.getAttribute(attr)); recompute();
    });
  }

  // ---- age handling ----
  // Direct-age mode: age years+months are inputs, dates disabled.
  // Date mode (default): dates are inputs, age years+months are calculated (read-only).
  function syncAgeFields() {
    var direct = $("ageMode").checked;
    $("ageY").readOnly = !direct; $("ageM").readOnly = !direct;
    $("dob").disabled = direct; $("meas").disabled = direct;
  }
  function ageDaysFromForm() {
    if ($("ageMode").checked) {
      var y = parseFloat($("ageY").value) || 0, m = parseFloat($("ageM").value) || 0;
      return WHO_AGE.monthsToDays(y * 12 + m);
    }
    var dob = $("dob").value, meas = $("meas").value;
    if (!dob || !meas) return NaN;
    return WHO_AGE.daysBetween(dob, meas);
  }

  function setPos(p) {
    state.pos = p;
    Array.prototype.forEach.call($("posSeg").children, function (b) { b.classList.toggle("on", b.dataset.pos === p); });
  }
  // Position follows the WHO convention by default: recumbent <24mo, standing >=24mo.
  // <24mo is editable (override -> +0.7cm); >=24mo is forced to standing (disabled).
  function syncPosEnabled(ageDays) {
    var under2 = ageDays < 731;
    var seg = $("posSeg");
    Array.prototype.forEach.call(seg.children, function (b) { b.disabled = !under2; });
    seg.classList.toggle("disabled", !under2);
    if (isNaN(ageDays)) return;
    if (!under2) { setPos("standing"); state.posManual = false; }   // >=24mo always standing
    else if (!state.posManual) { setPos("lying"); }                 // <24mo default recumbent
  }

  // ---- results rendering ----
  var NA_TXT = { oedema: "NA (oedema)", "age>10y": "NA (>10y)", range: "NA (out of range)", input: "—" };
  function cellZ(r) {
    if (r.na) return '<span class="na">' + (NA_TXT[r.naReason] || "NA") + "</span>";
    var cls = r.flag ? "flag" : zClass(r.z);
    return '<span class="zbox ' + cls + '">' + (r.z >= 0 ? "+" : "") + r.z.toFixed(2) + " SD</span>";
  }
  function cellPct(r) {
    if (r.na) return '<span class="na">—</span>';
    var p = r.pct; var txt = p < 0.1 ? "<0.1" : p > 99.9 ? ">99.9" : p.toFixed(1);
    return txt + " %";
  }
  function zClass(z) { var a = Math.abs(z); return a <= 1 ? "z-ok" : a <= 2 ? "z-watch" : "z-warn"; }
  function fmtVal(r) { return r.value > 0 ? round2(r.value) : "—"; }

  function render(res) {
    var tb = $("results").querySelector("tbody"); tb.innerHTML = "";
    INDICATORS.forEach(function (ind) {
      var r = res.indicators[ind.key];
      var sub = (ind.key === "wflh" && r.table ? " <small>(" + (r.table === "wfl" ? "length" : "height") + ")</small>" : "");
      var label = '<span class="ind-full">' + ind.label + '</span>' +
                  '<span class="ind-short">' + ind.short + '</span>' + sub;
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + label + "</td><td>" + fmtVal(r) + "</td><td>" + cellZ(r) + "</td><td>" + cellPct(r) + "</td>";
      tb.appendChild(tr);
    });
    var ex = $("extras");
    var bsa = res.bsa != null ? round2(res.bsa) : "—";
    var bmi = res.bmi != null ? round1(res.bmi) : "—";
    var med = res.bmiMedian != null ? round1(res.bmiMedian) : "—";
    var s1 = res.bmi1SD != null ? round1(res.bmi1SD) : "—";
    var s2 = res.bmi2SD != null ? round1(res.bmi2SD) : "—";
    var pm = res.bmiPctMedian != null ? Math.round(res.bmiPctMedian) + "%" : "—";
    ex.innerHTML =
      '<span><b>BMI</b> ' + bmi + ' kg/m²</span>' +
      '<span><b>BSA</b> ' + bsa + ' m²</span>' +
      '<span><b>BMI-for-age</b> median ' + med + ' | +1SD ' + s1 + ' | +2SD ' + s2 + '</span>' +
      '<span><b>Patient BMI</b> ' + pm + ' of median</span>';
  }

  // ---- compute & redraw ----
  var charts = [];
  function recompute() {
    var ageDays = ageDaysFromForm();
    // In date mode, populate the (read-only) age year/month fields from the dates.
    if (!$("ageMode").checked && !isNaN(ageDays)) {
      var tot = Math.floor(WHO_AGE.daysToMonths(ageDays));
      $("ageY").value = Math.floor(tot / 12); $("ageM").value = tot % 12;
    }
    syncPosEnabled(ageDays);
    $("computed").innerHTML = isNaN(ageDays) ? "<span class='warn'>Enter dates or age.</span>" :
      "<span><b>Age</b> " + WHO_AGE.formatAge(ageDays) + "</span>" +
      "<span>" + round2(WHO_AGE.daysToMonths(ageDays)) + " months · " + round2(WHO_AGE.daysToYears(ageDays)) + " years</span>";
    if (isNaN(ageDays)) { state.result = null; charts.forEach(function (c) { c.invalidate(); }); return; }

    var p = {
      sex: state.sex, ageDays: ageDays,
      weight: toKg(parseFloat($("weight").value)),
      lenht: toCm(parseFloat($("lenht").value)),
      measuredPos: $("posSeg").classList.contains("disabled") ? "standing" : state.pos,
      oedema: state.oed === "yes",
    };
    var res = WHO_CALC.computeAll(p);
    state.result = res.ok ? res : null;
    if (res.ok) render(res);
    charts.forEach(function (c) { c.invalidate(); });
  }

  // ---- build charts ----
  function buildCharts() {
    var host = $("charts");
    INDICATORS.forEach(function (ind) {
      ["z", "pct"].forEach(function (view) {
        var fig = document.createElement("figure"); fig.className = "chart-card";
        var cap = document.createElement("figcaption");
        cap.textContent = ind.label + " — " + (view === "z" ? "z-scores" : "percentiles");
        var cv = document.createElement("canvas"); cv.width = 470; cv.height = 340; cv.className = "who-chart";
        fig.appendChild(cap); fig.appendChild(cv); host.appendChild(fig);
        charts.push(buildWhoChart(cv, ind, view, getState));
      });
    });
  }

  // ---- unit labels ----
  function syncUnitLabels() {
    var imp = state.units === "imperial";
    document.querySelector('[data-u="kg"]').textContent = imp ? "(lb)" : "(kg)";
    document.querySelector('[data-u="cm"]').textContent = imp ? "(in)" : "(cm)";
  }

  // ---- wire up ----
  function init() {
    buildCharts();
    wireSeg("sexSeg", "data-sex", function (v) { state.sex = v; });
    wireSeg("posSeg", "data-pos", function (v) { state.pos = v; state.posManual = true; });
    wireSeg("oedSeg", "data-oed", function (v) { state.oed = v; });
    $("units").addEventListener("change", function () { state.units = $("units").value; syncUnitLabels(); recompute(); });
    ["dob", "meas", "ageY", "ageM", "weight", "lenht"].forEach(function (id) {
      $(id).addEventListener("input", recompute);
    });
    $("ageMode").addEventListener("change", function () { syncAgeFields(); recompute(); });
    $("newBtn").addEventListener("click", function () { ["weight", "lenht"].forEach(function (id) { $(id).value = ""; }); recompute(); });
    $("resetBtn").addEventListener("click", function () { location.reload(); });

    // Set default dates: measurement = today, birth = 1 month ago
    var today = new Date();
    var dobDef = new Date(today);
    dobDef.setMonth(dobDef.getMonth() - 1);
    function toISO(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day; }
    $("meas").value = toISO(today);
    $("dob").value = toISO(dobDef);

    syncUnitLabels();
    syncAgeFields();
    recompute();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
