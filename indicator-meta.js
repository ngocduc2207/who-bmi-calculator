"use strict";
/*
 * indicator-meta.js — the 4 WHO indicators and their chart configuration.
 * The 8 charts = these 4 indicators × { z-score view, percentile view }.
 * "wflh" (weight-for-length/height) resolves to the wfl or wfh table per patient.
 */

var INDICATORS = [
  { key: "wfa",  label: "Weight-for-age",          short: "Wei", xKind: "age", xMaxMonths: 120, yLabel: "Weight (kg)",        valueKey: "weight", zLines: [3, 2, 0, -2, -3] },
  { key: "lhfa", label: "Length/height-for-age",   short: "Len", xKind: "age", xMaxMonths: 228, yLabel: "Length/height (cm)", valueKey: "lenht",  zLines: [3, 2, 0, -2, -3] },
  { key: "bfa",  label: "BMI-for-age",             short: "BMI", xKind: "age", xMaxMonths: 228, yLabel: "BMI (kg/m²)",        valueKey: "bmi",    zLines: [3, 2, 1, 0, -1, -2, -3] },
  { key: "wflh", label: "Weight-for-length/height",short: "WfL", xKind: "cm",                   yLabel: "Weight (kg)",        valueKey: "weight", zLines: [3, 2, 1, 0, -1, -2, -3] },
];

var PCT_LINES = [97, 85, 50, 15, 3];

// Resolve the data-table key for an indicator. wflh -> wfl (<24mo) or wfh (>=24mo).
function resolveTable(indicatorKey, ageDays) {
  if (indicatorKey !== "wflh") return indicatorKey;
  return ageDays < 731 ? "wfl" : "wfh";
}

// Line styling matching WHO Anthro charts.
function zLineStyle(z) {
  if (z === 0) return { color: "#2e7d32", width: 2.2, label: "Median" };       // green median
  if (z === 1 || z === -1) return { color: "#f2a000", width: 1.6, label: (z > 0 ? "+1" : "-1") + "SD" };
  if (z === 2 || z === -2) return { color: "#e23b3b", width: 1.6, label: (z > 0 ? "+2" : "-2") + "SD" };
  return { color: "#111111", width: 1.6, label: (z > 0 ? "+3" : "-3") + "SD" }; // black ±3
}
function pctLineStyle(p) {
  if (p === 50) return { color: "#2e7d32", width: 2.2, label: "50th" };
  if (p === 85 || p === 15) return { color: "#f2a000", width: 1.6, label: p + "th" };
  return { color: "#e23b3b", width: 1.6, label: (p === 3 ? "3rd" : p + "th") };  // 3rd & 97th red
}
