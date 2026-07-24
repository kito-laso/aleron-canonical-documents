/**
 * Wearable window summaries (history & trend v1).
 * Spec: docs/engineering/WEARABLE_HISTORY_AND_TREND_REQUIREMENTS.md
 *
 * Pure functions: daily observations → 7d/30d windows vs personal baseline.
 * No composite recovery score. Within-person only.
 */

import { formatClinicalNumber } from './clinicalValueFormat.js?v=physician-design-basics-v1';

const MS_DAY = 24 * 60 * 60 * 1000;

/** Metrics that participate in trend UI (admitted instruments + movement). */
export const TREND_METRICS = [
  'resting_hr',
  'hrv_rmssd',
  'hrv_sdnn',
  'sleep_duration',
  'steps',
  'active_minutes'
];

const WINDOW_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

/** Minimum present days in a window before density_met. */
const DENSITY_REQUIRED = {
  resting_hr: { '7d': 5, '30d': 14, '90d': 40 },
  hrv_rmssd: { '7d': 5, '30d': 14, '90d': 40 },
  hrv_sdnn: { '7d': 5, '30d': 14, '90d': 40 },
  sleep_duration: { '7d': 5, '30d': 14, '90d': 40 },
  steps: { '7d': 5, '30d': 14, '90d': 40 },
  active_minutes: { '7d': 5, '30d': 14, '90d': 40 }
};

/** Prefer lower HR / higher HRV as "better" for direction copy only. */
const HIGHER_IS_BETTER = new Set(['hrv_rmssd', 'hrv_sdnn', 'sleep_duration', 'steps', 'active_minutes']);

function parseDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Normalize series entries to { local_date, value }.
 * Accepts array of { local_date|date, value } or map date→value.
 */
export function normalizeSeries(series) {
  if (!series) return [];
  if (Array.isArray(series)) {
    return series
      .map((row) => {
        const local_date = row.local_date ?? row.date ?? row.day;
        const value = row.value ?? row.v;
        const d = parseDate(local_date);
        if (!d || value == null || Number.isNaN(Number(value))) return null;
        return { local_date: toDateKey(d), value: Number(value) };
      })
      .filter(Boolean)
      .sort((a, b) => a.local_date.localeCompare(b.local_date));
  }
  if (typeof series === 'object') {
    return Object.entries(series)
      .map(([local_date, value]) => {
        const d = parseDate(local_date);
        const n = typeof value === 'object' && value != null ? value.value : value;
        if (!d || n == null || Number.isNaN(Number(n))) return null;
        return { local_date: toDateKey(d), value: Number(n) };
      })
      .filter(Boolean)
      .sort((a, b) => a.local_date.localeCompare(b.local_date));
  }
  return [];
}

function valuesInRange(series, startKey, endKey) {
  return series.filter((row) => row.local_date >= startKey && row.local_date <= endKey).map((row) => row.value);
}

function shiftDateKey(dateKey, deltaDays) {
  const d = parseDate(dateKey);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return toDateKey(d);
}

/**
 * Compute one window summary for a metric series.
 */
export function computeWindow(series, metricKey, windowKey, asOfDate) {
  const points = normalizeSeries(series);
  const asOf = parseDate(asOfDate) ? toDateKey(parseDate(asOfDate)) : (points.at(-1)?.local_date ?? toDateKey(new Date()));
  const days = WINDOW_DAYS[windowKey];
  if (!days) return null;

  const windowStart = shiftDateKey(asOf, -(days - 1));
  const windowValues = valuesInRange(points, windowStart, asOf);
  const required = DENSITY_REQUIRED[metricKey]?.[windowKey] ?? Math.ceil(days * 0.7);
  const density_met = windowValues.length >= required;
  const value = mean(windowValues);

  // Personal baseline: prior 28 days ending day before current 7d window (for 7d);
  // for 30d compare to prior 28d ending day before that window.
  const baselineEnd = shiftDateKey(windowStart, -1);
  const baselineStart = shiftDateKey(baselineEnd, -27);
  const baselineValues = valuesInRange(points, baselineStart, baselineEnd);
  const baselineRequired = 14;
  const baseline_value = baselineValues.length >= baselineRequired ? mean(baselineValues) : null;

  let delta_abs = null;
  let delta_pct = null;
  let direction = 'unknown';
  if (value != null && baseline_value != null && baseline_value !== 0) {
    delta_abs = value - baseline_value;
    delta_pct = (delta_abs / Math.abs(baseline_value)) * 100;
    const eps = Math.abs(baseline_value) * 0.03; // 3% flat band
    if (Math.abs(delta_abs) < eps) direction = 'flat';
    else if (delta_abs > 0) direction = HIGHER_IS_BETTER.has(metricKey) ? 'up' : 'up';
    else direction = 'down';
  } else if (value != null && baseline_value == null) {
    direction = 'unknown';
  }

  return {
    window: windowKey,
    as_of_date: asOf,
    n_days_present: windowValues.length,
    n_days_required: required,
    density_met,
    stat: 'mean',
    value: round(value, metricKey === 'steps' ? 0 : 1),
    baseline_value: round(baseline_value, metricKey === 'steps' ? 0 : 1),
    delta_abs: round(delta_abs, metricKey === 'steps' ? 0 : 1),
    delta_pct: round(delta_pct, 1),
    direction,
    series_tail: points.filter((p) => p.local_date >= shiftDateKey(asOf, -29) && p.local_date <= asOf)
  };
}

/**
 * Build summary.v1 from packet wearables.series or wearables.history.
 */
export function buildWearableSummaryFromPacket(wearables, asOfDate) {
  if (!wearables || typeof wearables !== 'object') return null;
  const seriesRoot = wearables.series || wearables.history || wearables.daily || null;
  const existing = wearables.summary;
  if (existing?.schema_version === 'wearable_summary.v1' && existing.windows) {
    return existing;
  }
  if (!seriesRoot || typeof seriesRoot !== 'object') return null;

  const asOf = asOfDate || wearables.sync?.synced_at || new Date().toISOString().slice(0, 10);
  const windows = {};
  let nights = 0;
  let stepDays = 0;

  for (const metric of TREND_METRICS) {
    const series = seriesRoot[metric];
    if (!series) continue;
    const w7 = computeWindow(series, metric, '7d', asOf);
    const w30 = computeWindow(series, metric, '30d', asOf);
    if (!w7 && !w30) continue;
    windows[metric] = {
      '7d': w7,
      '30d': w30,
      density_met: Boolean(w7?.density_met || w30?.density_met)
    };
    if (metric === 'sleep_duration' && w30) nights = Math.max(nights, w30.n_days_present);
    if (metric === 'steps' && w30) stepDays = Math.max(stepDays, w30.n_days_present);
  }

  if (!Object.keys(windows).length) return null;

  return {
    schema_version: 'wearable_summary.v1',
    as_of: String(asOf).slice(0, 10),
    source: wearables.sync?.source || wearables.source || 'unknown',
    device_lineage: wearables.sync?.device_lineage || null,
    windows,
    coverage: {
      nights_28d: nights,
      days_steps_28d: stepDays,
      last_sync_at: wearables.sync?.synced_at || null
    }
  };
}

/**
 * Human-readable trend line for a metric window.
 */
export function formatTrendLine(windowSummary, unit = '') {
  if (!windowSummary) return { state: 'snapshot_only', text: 'Single snapshot. No trend yet.' };
  if (!windowSummary.density_met) {
    return {
      state: 'building_baseline',
      text: `Building baseline · ${windowSummary.n_days_present}/${windowSummary.n_days_required} days`
    };
  }
  const unitSuffix = unit ? ` ${unit}` : '';
  const level = windowSummary.value != null
    ? `${formatClinicalNumber(windowSummary.value, unit)}${unitSuffix}`
    : 'Not emitted';
  if (windowSummary.baseline_value == null || windowSummary.delta_pct == null) {
    return {
      state: 'trend_ready',
      text: `${windowSummary.window} mean ${level} · baseline still forming`
    };
  }
  const baseline = formatClinicalNumber(windowSummary.baseline_value, unit);
  const deltaPercent = formatClinicalNumber(windowSummary.delta_pct, '%');
  const sign = windowSummary.delta_pct > 0 && deltaPercent !== '0' ? '+' : '';
  return {
    state: 'trend_ready',
    text: `${windowSummary.window} mean ${level} · vs your baseline ${baseline}${unitSuffix} (${sign}${deltaPercent}%)`
  };
}

/**
 * Generate synthetic daily series for staging demos (nonclinical).
 */
export function generateSyntheticSeries(metricKey, days = 30, asOfDate = new Date().toISOString().slice(0, 10), seed = 1) {
  const asOf = parseDate(asOfDate) || new Date();
  const points = [];
  let base;
  let noise;
  switch (metricKey) {
    case 'resting_hr':
      base = 52; noise = 3; break;
    case 'hrv_rmssd':
      base = 48; noise = 8; break;
    case 'sleep_duration':
      base = 7.2; noise = 0.7; break;
    case 'steps':
      base = 9200; noise = 1800; break;
    case 'active_minutes':
      base = 48; noise = 12; break;
    case 'vo2max':
      base = 54; noise = 0.3; break;
    default:
      base = 50; noise = 5;
  }
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(asOf.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    // mild recovery trend toward end of window
    const t = (days - 1 - i) / Math.max(days - 1, 1);
    const trend = metricKey === 'hrv_rmssd' ? t * 4 : metricKey === 'resting_hr' ? -t * 1.5 : 0;
    const wobble = Math.sin((i + seed) * 1.7) * noise * 0.5 + Math.cos((i + seed) * 0.9) * noise * 0.3;
    let value = base + trend + wobble;
    if (metricKey === 'steps' || metricKey === 'active_minutes') value = Math.max(0, Math.round(value));
    else value = round(value, metricKey === 'sleep_duration' ? 1 : 1);
    points.push({ local_date: toDateKey(d), value });
  }
  return points;
}

export function attachSyntheticSeriesToWearables(wearables, asOfDate = '2026-07-10') {
  const next = { ...wearables };
  const series = {};
  for (const metric of ['resting_hr', 'hrv_rmssd', 'sleep_duration', 'steps', 'active_minutes', 'vo2max']) {
    series[metric] = generateSyntheticSeries(metric, 30, asOfDate, metric.length);
  }
  next.series = series;
  next.summary = buildWearableSummaryFromPacket({ ...next, series }, asOfDate);
  return next;
}
