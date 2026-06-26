# WHO Growth Calculator

A single-page web app that replicates the **WHO Anthro / WHO AnthroPlus / AnthroCalc** clinical workflow — computing anthropometric **z-scores and percentiles** from official WHO growth references and displaying them across **4 indicators and 8 interactive charts**.

No installation, no build step, no internet connection needed at runtime. Open `index.html` in any modern browser.

---

## Features

### Calculator panel
| Feature | Detail |
|---|---|
| **Date mode** | Enter Date of Birth + Date of Measurement → age computed automatically |
| **Direct-age mode** | Toggle to type age in years + months directly |
| **Sex** | Male / Female |
| **Measured position** | Recumbent / Standing — auto-defaults to the WHO convention (<24 mo → Recumbent, ≥24 mo → Standing locked). Manual override applies the WHO ±0.7 cm correction. |
| **Oedema** | Yes → weight-based indicators (wfa, bfa, wfl/wfh) set to NA; height-for-age still computed |
| **Units** | Metric (cm / kg) or Imperial (in / lb) |

### Results panel
Each calculation produces:
- **z-score (SD)** — colour-coded green (|z| ≤ 1), amber (|z| ≤ 2), red (|z| > 2), purple (|z| > 3 / implausible)
- **Percentile (%)**
- **BMI** (kg/m²), **BSA** (Mosteller, m²)
- **BMI-for-age: median | +1 SD | +2 SD** and **Patient BMI as % of median**

### 4 Indicators
| # | Indicator | Data source | Domain |
|---|---|---|---|
| 1 | Weight-for-age (WFA) | WHO Standards + WHO Reference 2007 | 0 – 120 months |
| 2 | Length/height-for-age (LHFA) | WHO Standards + WHO Reference 2007 | 0 – 228 months |
| 3 | BMI-for-age (BFA) | WHO Standards + WHO Reference 2007 | 0 – 228 months |
| 4 | Weight-for-length/height (WFL/WFH) | WHO Standards | Length 45–110 cm / Height 65–120 cm |

### 8 Interactive charts
Each indicator has two chart panels, arranged **one indicator per row**:

| Left | Right |
|---|---|
| z-score curves (−3 SD … +3 SD) | Percentile curves (3rd / 15th / 50th / 85th / 97th) |

Chart interactions:
- **Scroll** to zoom in/out (cursor-anchored)
- **Drag** to pan
- **Hover** anywhere to read exact value, z-score and percentile at that point
- **🔒 / 🔓** lock button (top-right of each chart) — locked by default; when locked, touch events pass through to the page so scrolling works normally on mobile; tap to unlock and enable touch pan/pinch-zoom on that chart
- **+ / − / ⟲** buttons to zoom and reset
- **Patient marker** (blue dot + dashed crosshair) shows where the current measurement sits on each curve

---

## Reference data

Data is sourced directly from WHO official CDN and baked into JS files at build time (no runtime downloads needed):

| File | Content |
|---|---|
| `who-wfa.js` | Weight-for-age LMS (0–1856 days by day; 61–120 months by month) |
| `who-lhfa.js` | Length/height-for-age LMS (0–1856 days; 61–228 months) |
| `who-bfa.js` | BMI-for-age LMS (0–1856 days; 61–228 months) |
| `who-wfl.js` | Weight-for-length LMS (45–110 cm, step 0.1 cm) |
| `who-wfh.js` | Weight-for-height LMS (65–120 cm, step 0.1 cm) |

**Sources:**
- [WHO Child Growth Standards (0–5 years)](https://www.who.int/tools/child-growth-standards) — daily tables, boys & girls
- [WHO Reference 2007 (5–19 years)](https://www.who.int/tools/growth-reference-data-for-5to19-years) — monthly tables, boys & girls

---

## Calculation methodology

### LMS z-score (Box-Cox normal)
```
z = ( (X/M)^L − 1 ) / (L × S)        [L ≠ 0]
z = ln(X/M) / S                        [L = 0]
```

### Inverse (curve value at z)
```
X(z) = M × (1 + L × S × z)^(1/L)     [L ≠ 0]
X(z) = M × exp(S × z)                 [L = 0]
```

### Extreme-value correction (WHO, |z| > 3)
Applied to **WFA, BFA, WFL, WFH** (not LHFA, where L = 1 and tails are symmetric):
```
z* = 3 + (X − SD3⁺) / (SD3⁺ − SD2⁺)   [z > 3]
z* = −3 + (X − SD3⁻) / (SD2⁻ − SD3⁻)  [z < −3]
```

### Percentile
```
percentile = Φ(z*) × 100
```
Computed from the **unrounded** z* (rounding only at display), required to reproduce WHO Anthro values such as 48.8th / 50.6th / 46.3rd.

### Measurement-position correction
| Measured | Age | Convention | Adjustment |
|---|---|---|---|
| Standing | < 24 mo | Recumbent expected | **+ 0.7 cm** |
| Recumbent | ≥ 24 mo | Standing expected | **− 0.7 cm** |
| Matches convention | — | — | None |

### Age routing
| Age | Table | Interpolation |
|---|---|---|
| 0 – 1856 days | WHO Standards (by day) | Linear L,M,S to exact day |
| > 1856 days (> ~61 mo) | WHO Reference 2007 (by month) | Linear L,M,S to exact fractional month |
| wfl/wfh | By cm | Linear L,M,S to exact cm |

### Derived quantities
| Quantity | Formula |
|---|---|
| BMI | `W (kg) / H (m)²` |
| BSA (Mosteller) | `√( H_cm × W_kg / 3600 )` m² |
| BMI % of median | `100 × BMI / M_bfa(age)` |

---

## Verification (tested anchor points)

### Anchor A — WHO Anthro (image.png)
Girl, DOB 2020-06-27, meas 2026-06-15 → **71.6 months**, W 20 kg, H 115 cm

| Indicator | z-score | Percentile |
|---|---|---|
| Weight-for-age | **−0.03** | **48.8%** |
| Length/height-for-age | **+0.01** | **50.6%** |
| BMI-for-age | **−0.09** | **46.3%** |

### Anchor B — AnthroCalc (image0.jpg)
Girl, DOB 2024-11-03, meas 2026-06-23 → **19.6 months** (597 days), L 79 cm, W 10.3 kg

| Indicator | z-score | Percentile |
|---|---|---|
| Length/height-for-age | **−1.11** | **13.3%** |
| Weight-for-age | **−0.21** | **41.8%** |
| BMI-for-age | **+0.64** | **73.8%** |
| BSA | **0.48 m²** | — |
| BMI % of median | **106%** | — |
| Median / +1 SD / +2 SD BMI | **15.6 / 17.1 / 18.7** | — |

### Oedema check (Anchor A + oedema = Yes)
WFA → **NA**, BFA → **NA**, WFL/WFH → **NA**, LHFA → **+0.01 / 50.6%** (unchanged)

All anchors reproduced exactly.

---

## File structure

```
index.html          Patient form + chart grid layout
style.css           Styling (light WHO-style theme)
who-lms.js          LMS core engine: zFromValue, valueFromZ,
                    adjustExtremeZ, normalCdf, age helpers
indicator-meta.js   Per-indicator config (domain, line sets, labels)
who-calc.js         Clinical orchestration: routing, ±0.7cm,
                    oedema NA, domain guards, BSA, %median
who-charts.js       Generalised canvas chart engine (zoom/pan/hover)
who-app.js          UI controller: form, results panel, 8 charts
who-wfa.js          WFA LMS data (~95 KB)
who-lhfa.js         LHFA LMS data (~80 KB)
who-bfa.js          BFA LMS data (~102 KB)
who-wfl.js          WFL LMS data (~32 KB)
who-wfh.js          WFH LMS data (~28 KB)
```

---

## Usage

```bash
# Option 1 — open directly (no server needed)
open index.html

# Option 2 — serve locally
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Notes

- The **visible curve kink at 60/61 months** is correct — it is the real join between the two WHO references, not a rendering artifact.
- **Weight-for-age is only defined up to 10 years (120 months)**; above that, BMI-for-age is the recommended indicator.
- **wfl** (length-based table) is used for children under 24 months; **wfh** (height-based table) for 24 months and above.
- For children ≥ 24 months, the Measured Position control is locked to Standing (disabled) — the position is fixed by WHO convention.
