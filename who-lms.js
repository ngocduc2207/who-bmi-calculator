"use strict";
/*
 * who-lms.js — WHO growth-standard LMS calculation core (pure, no DOM).
 *
 * Methodology (validated against WHO Anthro anchors):
 *  - z = ((X/M)^L - 1)/(L*S)         (L != 0);  ln(X/M)/S  (L == 0)
 *  - value(z) = M*(1+L*S*z)^(1/L)    (L != 0);  M*exp(S*z) (L == 0)
 *  - Extreme-value remap when |z|>3 (skewed weight-based indicators only).
 *  - percentile = Φ(z)*100 from the UNROUNDED z (round only for display).
 *  - Lookup: 0-1856 days -> WHO Standards daily table (interpolated);
 *            >1856 days  -> WHO Reference 2007, L,M,S linearly interpolated
 *                           to the exact fractional age in months;
 *            wfl/wfh     -> interpolated by length/height in cm.
 */

var WHO_LMS = (function () {
  // z-scores corresponding to the percentile curves WHO plots
  var Z_FOR_PCT = { 3: -1.88079, 15: -1.03643, 50: 0, 85: 1.03643, 97: 1.88079 };

  // Indicators that get the WHO extreme-value (|z|>3) remap.
  var REMAP = { wfa: true, bfa: true, wfl: true, wfh: true, lhfa: false };

  function zFromValue(X, L, M, S) {
    return L !== 0 ? (Math.pow(X / M, L) - 1) / (L * S) : Math.log(X / M) / S;
  }
  function valueFromZ(z, L, M, S) {
    return L !== 0 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
  }
  function adjustExtremeZ(z, X, L, M, S) {
    if (z > 3) {
      var sd3p = valueFromZ(3, L, M, S), sd2p = valueFromZ(2, L, M, S);
      return 3 + (X - sd3p) / (sd3p - sd2p);
    }
    if (z < -3) {
      var sd3n = valueFromZ(-3, L, M, S), sd2n = valueFromZ(-2, L, M, S);
      return -3 + (X - sd3n) / (sd2n - sd3n);
    }
    return z;
  }
  // Abramowitz & Stegun 7.1.26 erf approximation -> standard-normal CDF.
  function erf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x < 0 ? -y : y;
  }
  function percentileFromZ(z) { return 0.5 * (1 + erf(z / Math.SQRT2)) * 100; }

  function lerp3(a, b, f) {
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // Return [L,M,S] for an age-based indicator at a given age in days, or null if out of domain.
  function lmsAtAge(ind, sex, ageDays) {
    var meta = WHO_DATA[ind], d = meta[sex];
    if (ageDays <= 1856) {
      var i0 = Math.floor(ageDays), f = ageDays - i0;
      return lerp3(d.stdByDay[i0], d.stdByDay[Math.min(i0 + 1, 1856)], f);
    }
    var mo = ageDays / 30.4375, max = meta.domainMonths[1];
    if (mo > max) return null;
    var m0 = Math.floor(mo), fm = mo - m0, idx = m0 - d.ref.start;
    if (idx < 0) return null;
    return lerp3(d.ref.rows[idx], d.ref.rows[Math.min(idx + 1, d.ref.rows.length - 1)], fm);
  }

  // Return [L,M,S] for weight-for-length/height at a given cm, or null if out of cm domain.
  function lmsAtCm(ind, sex, cm) {
    var meta = WHO_DATA[ind], d = meta[sex], lo = meta.domainCm[0], hi = meta.domainCm[1];
    if (cm < lo || cm > hi) return null;
    var pos = (cm - d.start) / meta.step, i0 = Math.floor(pos + 1e-9), f = pos - i0;
    return lerp3(d.rows[i0], d.rows[Math.min(i0 + 1, d.rows.length - 1)], f);
  }

  // Full z + percentile for a measurement X against indicator `ind`.
  // `lms` is the resolved [L,M,S]; returns {z, zRaw, pct} or null.
  function score(ind, X, lms) {
    if (!lms || !(X > 0)) return null;
    var L = lms[0], M = lms[1], S = lms[2];
    var zRaw = zFromValue(X, L, M, S);
    var z = REMAP[ind] ? adjustExtremeZ(zRaw, X, L, M, S) : zRaw;
    return { z: z, zRaw: zRaw, pct: percentileFromZ(z), L: L, M: M, S: S };
  }

  return {
    Z_FOR_PCT: Z_FOR_PCT, REMAP: REMAP,
    zFromValue: zFromValue, valueFromZ: valueFromZ, adjustExtremeZ: adjustExtremeZ,
    percentileFromZ: percentileFromZ, lerp3: lerp3,
    lmsAtAge: lmsAtAge, lmsAtCm: lmsAtCm, score: score,
  };
})();

/* who-age.js bundled here: date/age helpers */
var WHO_AGE = (function () {
  var DAY = 86400000;
  // Completed days between two YYYY-MM-DD strings (or Date objects).
  function daysBetween(dob, meas) {
    var a = (dob instanceof Date) ? dob : new Date(dob + "T00:00:00");
    var b = (meas instanceof Date) ? meas : new Date(meas + "T00:00:00");
    return Math.floor((b - a) / DAY);
  }
  // WHO month-midpoint convention for "age typed in completed months".
  function monthsToDays(months) { return Math.floor(months * 30.4375 + 15.219); }
  function daysToMonths(days) { return days / 30.4375; }
  function daysToYears(days) { return days / 365.25; }
  function formatAge(days) {
    var mTot = Math.floor(days / 30.4375);
    var y = Math.floor(mTot / 12), m = mTot % 12;
    return y + "yr " + m + "mo (" + mTot + "mo)";
  }
  return {
    daysBetween: daysBetween, monthsToDays: monthsToDays,
    daysToMonths: daysToMonths, daysToYears: daysToYears, formatAge: formatAge,
  };
})();
