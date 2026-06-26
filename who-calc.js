"use strict";
/*
 * who-calc.js — clinical orchestration on top of WHO_LMS.
 * Input patient: { sex:'boys'|'girls', ageDays, weight(kg), lenht(cm),
 *                  measuredPos:'lying'|'standing'|null, oedema:bool }
 * Output: age fields, derived (bmi/bsa/median), and 4 indicator results.
 */

var WHO_CALC = (function () {

  // length(lying) vs height(standing) convention switches at 24 months (731 days)
  function convention(ageDays) { return ageDays < 731 ? "length" : "height"; }

  // WHO ±0.7 cm correction when measured position differs from the age convention.
  function adjustLenHt(lenht, measuredPos, ageDays) {
    if (!(lenht > 0) || !measuredPos) return { value: lenht, adjusted: false };
    if (measuredPos === "standing" && ageDays < 731) return { value: lenht + 0.7, adjusted: true };
    if (measuredPos === "lying" && ageDays >= 731) return { value: lenht - 0.7, adjusted: true };
    return { value: lenht, adjusted: false };
  }

  function indicatorResult(key, label, valueKey, X, lms, remapKey, naReason) {
    var r = { key: key, label: label, value: X, na: !!naReason, naReason: naReason || null,
              z: null, pct: null, flag: false };
    if (naReason) return r;
    var s = WHO_LMS.score(remapKey, X, lms);
    if (!s) { r.na = true; r.naReason = "range"; return r; }
    r.z = s.z; r.pct = s.pct; r.M = s.M;
    r.flag = Math.abs(s.z) > 3;   // implausible / clinically extreme
    return r;
  }

  function computeAll(p) {
    var out = { ok: true, indicators: {} };
    if (!(p.ageDays >= 0)) return { ok: false, error: "Enter date of birth & measurement (or age)." };

    out.ageDays = p.ageDays;
    out.ageMonths = WHO_AGE.daysToMonths(p.ageDays);
    out.ageYears = WHO_AGE.daysToYears(p.ageDays);
    out.ageLabel = WHO_AGE.formatAge(p.ageDays);
    out.convention = convention(p.ageDays);

    var adj = adjustLenHt(p.lenht, p.measuredPos, p.ageDays);
    out.lenHt = adj.value; out.adjusted = adj.adjusted;

    var w = p.weight, h = adj.value;
    out.bmi = (w > 0 && h > 0) ? w / Math.pow(h / 100, 2) : null;
    out.bsa = (w > 0 && h > 0) ? Math.sqrt(h * w / 3600) : null;

    var oe = p.oedema ? "oedema" : null;
    var months = out.ageMonths;

    // weight-for-age (0–120 mo; NA on oedema or >10y)
    out.indicators.wfa = indicatorResult(
      "wfa", "Weight-for-age", "weight", w,
      WHO_LMS.lmsAtAge("wfa", p.sex, p.ageDays), "wfa",
      oe || (months > 120 ? "age>10y" : (!(w > 0) ? "input" : null)));

    // length/height-for-age (always computed when height present, even with oedema)
    out.indicators.lhfa = indicatorResult(
      "lhfa", "Length/height-for-age", "lenht", h,
      WHO_LMS.lmsAtAge("lhfa", p.sex, p.ageDays), "lhfa",
      !(h > 0) ? "input" : null);

    // BMI-for-age (0–228 mo; NA on oedema)
    out.indicators.bfa = indicatorResult(
      "bfa", "BMI-for-age", "bmi", out.bmi,
      WHO_LMS.lmsAtAge("bfa", p.sex, p.ageDays), "bfa",
      oe || (!(out.bmi > 0) ? "input" : null));

    // weight-for-length/height (table by convention; NA on oedema / out of cm range)
    var table = out.convention === "length" ? "wfl" : "wfh";
    out.indicators.wflh = indicatorResult(
      "wflh", "Weight-for-length/height", "weight", w,
      WHO_LMS.lmsAtCm(table, p.sex, h), table,
      oe || (!(w > 0 && h > 0) ? "input" : null));
    out.indicators.wflh.table = table;
    out.indicators.wflh.cm = h;

    // BMI-for-age derived display (median / +1SD / +2SD) and % of median
    var bl = WHO_LMS.lmsAtAge("bfa", p.sex, p.ageDays);
    if (bl) {
      out.bmiMedian = WHO_LMS.valueFromZ(0, bl[0], bl[1], bl[2]);
      out.bmi1SD = WHO_LMS.valueFromZ(1, bl[0], bl[1], bl[2]);
      out.bmi2SD = WHO_LMS.valueFromZ(2, bl[0], bl[1], bl[2]);
      out.bmiPctMedian = (out.bmi > 0 && !p.oedema) ? 100 * out.bmi / out.bmiMedian : null;
    }
    return out;
  }

  return { computeAll: computeAll, convention: convention, adjustLenHt: adjustLenHt };
})();
