import { RISK_DOMAINS } from './riskActionLibrary.js?v=risk-domain-action-space-v5';
import { RISK_DOMAIN_TIERS } from './riskDomainTiers.js?v=risk-domain-action-space-v5';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const X_L = 70;
const X_R = 700;
const Y_TOP = 20;
const Y_BOT = 300;
const SVG_H = 380;
const CONF_BANDS = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH'];
const CONF_BAND_LABELS = { VERY_LOW: 'Very low', LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High' };

// benefit% = (1 - HR/RR/adjusted RR) x 100; CI flips to [1-upper, 1-lower].
// RRR records are already percent reductions.
function benefit(action) {
  if (action.measure === 'RRR') {
    return { b: action.estimate, lo: action.lower, hi: action.upper };
  }
  return {
    b: (1 - action.estimate) * 100,
    lo: (1 - action.upper) * 100,
    hi: (1 - action.lower) * 100,
  };
}

function fmtEffect(action) {
  const m = action.measure === 'ADJUSTED_RR' ? 'adjusted RR' : action.measure;
  if (action.measure === 'RRR') return `RRR ${action.estimate}% [${action.lower}, ${action.upper}]`;
  return `${m} ${action.estimate} [${action.lower}, ${action.upper}]`;
}

function niceDomain(loB, hiB) {
  const dmin = loB >= 0 ? 0 : Math.floor((loB - 4) / 5) * 5;
  const dmax = Math.ceil((hiB + 4) / 5) * 5;
  const span = dmax - dmin;
  let step = 25;
  for (const candidate of [5, 10, 20, 25]) {
    if (span / candidate <= 6) { step = candidate; break; }
  }
  const ticks = [];
  for (let t = dmin; t <= dmax; t += step) ticks.push(t);
  if (!ticks.includes(0) && dmin < 0 && dmax > 0) ticks.push(0);
  return { dmin, dmax, ticks: ticks.sort((a, b) => a - b) };
}

function laneSvg(domain, laneDef, selectedSlug) {
  const vals = laneDef.actions.map(benefit);
  const loB = Math.min(...vals.map((v) => v.lo));
  const hiB = Math.max(...vals.map((v) => v.hi));
  const { dmin, dmax, ticks } = niceDomain(loB, hiB);
  const yOf = (v) => Y_BOT - ((v - dmin) / (dmax - dmin)) * (Y_BOT - Y_TOP);
  const bandW = (X_R - X_L) / CONF_BANDS.length;
  const parts = [];
  parts.push(`<svg viewBox="0 0 720 ${SVG_H}" role="img" aria-label="${esc(`${domain.title} actions, ${laneDef.label} lane, scatter plot. Y axis: relative benefit percent, scale ${dmin} to ${dmax}. X axis: ARR V1 matrix confidence bands.`)}">`);
  for (let b = 1; b < CONF_BANDS.length; b++) {
    const x = X_L + b * bandW;
    parts.push(`<line class="rs-band" x1="${x.toFixed(1)}" y1="${Y_TOP}" x2="${x.toFixed(1)}" y2="${Y_BOT}"></line>`);
  }
  for (const t of ticks) {
    const cls = t === 0 ? 'rs-zero' : 'rs-grid';
    parts.push(`<line class="${cls}" x1="${X_L}" y1="${yOf(t).toFixed(1)}" x2="${X_R}" y2="${yOf(t).toFixed(1)}"></line>`);
  }
  parts.push(`<line class="rs-axis" x1="${X_L}" y1="${Y_TOP}" x2="${X_L}" y2="${Y_BOT}"></line>`);
  parts.push(`<line class="rs-axis" x1="${X_L}" y1="${Y_BOT}" x2="${X_R}" y2="${Y_BOT}"></line>`);
  for (const t of ticks) {
    parts.push(`<text class="rs-tick rs-tick-y" x="${X_L - 8}" y="${(yOf(t) + 4).toFixed(1)}">${t}</text>`);
  }
  CONF_BANDS.forEach((band, b) => {
    parts.push(`<text class="rs-tick" x="${(X_L + b * bandW + bandW / 2).toFixed(1)}" y="${Y_BOT + 20}">${CONF_BAND_LABELS[band]}</text>`);
  });
  parts.push(`<text class="rs-axis-title" x="${((X_L + X_R) / 2).toFixed(1)}" y="${Y_BOT + 44}">ARR translation confidence</text>`);
  parts.push(`<text class="rs-axis-title" x="16" y="${((Y_TOP + Y_BOT) / 2).toFixed(1)}" transform="rotate(-90 16 ${((Y_TOP + Y_BOT) / 2).toFixed(1)})">Relative benefit (%)</text>`);
  const positions = new Map();
  for (const action of laneDef.actions) {
    const { b, lo, hi } = benefit(action);
    const band = CONF_BANDS.includes(action.confidence) ? action.confidence : 'LOW';
    const mates = laneDef.actions.filter((a) => (CONF_BANDS.includes(a.confidence) ? a.confidence : 'LOW') === band);
    const j = mates.indexOf(action);
    const cx = X_L + CONF_BANDS.indexOf(band) * bandW + ((j + 1) / (mates.length + 1)) * bandW;
    const cy = yOf(b);
    positions.set(action.slug, { xPct: (cx / 720) * 100, yPct: (cy / SVG_H) * 100 });
    const crosses = lo < 0 ? ', interval crosses null' : '';
    const pressed = action.slug === selectedSlug;
    parts.push(`<g class="rs-mark" data-rs-action="${esc(action.slug)}" role="button" tabindex="0" aria-pressed="${pressed}" aria-label="${esc(`${action.key} ${action.name}, ${fmtEffect(action)}, matrix confidence ${band.toLowerCase()}${crosses}`)}">`);
    parts.push(`<line class="rs-whisker" x1="${cx.toFixed(1)}" y1="${yOf(hi).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yOf(lo).toFixed(1)}"></line>`);
    parts.push(`<line class="rs-cap" x1="${(cx - 5).toFixed(1)}" y1="${yOf(hi).toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${yOf(hi).toFixed(1)}"></line>`);
    parts.push(`<line class="rs-cap" x1="${(cx - 5).toFixed(1)}" y1="${yOf(lo).toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${yOf(lo).toFixed(1)}"></line>`);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6"></circle>`);
    parts.push('</g>');
  }
  parts.push('</svg>');
  return { svg: parts.join(''), positions };
}

function hoverCard(action, coordinate, pos) {
  const confidence = String(coordinate?.matrix_confidence ?? action.confidence ?? '');
  const confLabel = confidence.charAt(0) + confidence.slice(1).toLowerCase();
  let arrLine = 'Absolute benefit not estimable for this patient';
  if (coordinate?.coordinate_status === 'materialized') {
    const arr = asFinite(coordinate.patient_coordinate?.arr);
    const nnt = asFinite(coordinate.patient_coordinate?.nnt);
    if (arr !== null) {
      arrLine = `ARR ${Number((arr * 100).toFixed(1))} percentage points`;
      if (nnt !== null) arrLine += ` · NNT ${Math.round(nnt)}`;
    }
  }
  const classes = ['rs-hovercard'];
  if (pos.xPct > 62) classes.push('flip-x');
  if (pos.yPct < 34) classes.push('below');
  return `<div class="${classes.join(' ')}" data-rs-hover="${esc(action.slug)}" style="left:${pos.xPct.toFixed(2)}%;top:${pos.yPct.toFixed(2)}%">`
    + `<div class="rs-arr-key">${esc(`${action.key} · ${action.name}`)}</div>`
    + `<div class="rs-hover-effect">${esc(fmtEffect(action))} · ${esc(confLabel)} translation confidence</div>`
    + `<div class="rs-hover-arr">${esc(arrLine)}</div>`
    + '</div>';
}

function findAction(domain, slug) {
  for (const lane of domain.lanes) {
    const found = lane.actions.find((a) => a.slug === slug);
    if (found) return { action: found, lane };
  }
  return null;
}

function normalizedActionId(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll('-', '_');
}

function riskArrCoordinates(model) {
  return Array.isArray(model?.actionMap?.riskArrCoordinates)
    ? model.actionMap.riskArrCoordinates
    : [];
}

function coordinateForAction(model, action) {
  const slug = normalizedActionId(action?.slug);
  return riskArrCoordinates(model).find((coordinate) =>
    normalizedActionId(coordinate?.native_action_id) === slug
  ) ?? null;
}

function asFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value, digits = 1) {
  const number = asFinite(value);
  return number === null ? null : `${Number((number * 100).toFixed(digits))}%`;
}

function modelRowsWithBaseline(domain, coordinate) {
  if (!coordinate || coordinate.coordinate_status !== 'materialized') return domain.modelRows;
  const baseline = percent(coordinate.baseline?.probability);
  if (!baseline) return domain.modelRows;
  const horizon = asFinite(coordinate.baseline?.horizon_years);
  const display = horizon === null ? baseline : `${baseline} at ${Number(horizon)} years`;
  return domain.modelRows.map(([key, value]) =>
    key === 'Baseline risk' ? [key, display] : [key, value]
  );
}

// Physician-facing endpoint names. Governed target_id -> clinical language.
const ENDPOINT_LABELS = {
  PREVENT_ASCVD_FIRST_EVENT: 'ASCVD first event',
  PREVENT_HF_FIRST_INCIDENT_EVENT: 'Heart failure first event',
  KIDNEY_FAILURE_KRT_FIRST_EVENT: 'Kidney failure (KRT)',
  KIDNEY_DISEASE_PROGRESSION_FIRST_EVENT: 'Kidney disease progression',
  INCIDENT_T2DM: 'Incident type 2 diabetes',
  LUNG_CANCER_INCIDENCE: 'Lung cancer incidence',
  PROSTATE_HIGH_GRADE_CANCER_BIOPSY_DETECTION: 'High-grade prostate cancer on biopsy',
  BREAST_CANCER_INCIDENCE: 'Breast cancer incidence',
  COLORECTAL_CANCER_INCIDENCE: 'Colorectal cancer incidence',
  DEMENTIA_INCIDENCE: 'Dementia incidence',
  MIXED_KIDNEY_CV_DEATH_FIRST_EVENT: 'Kidney or CV death composite',
  ALL_CAUSE_MORTALITY: 'All-cause mortality',
};

const STATE_LABELS = {
  calculated: null,
  not_applicable: 'Not applicable',
  model_unavailable: 'Model unavailable',
  directional_score_unavailable: 'Directional only',
  blocked_missing_inputs: 'Missing inputs',
  blocked_invalid_inputs: 'Invalid inputs',
};

const DOMAIN_RUNTIME_KEYS = {
  cardiovascular: 'cardiovascular',
  metabolic: 'metabolic',
  kidney: 'kidney',
  neurologic: 'neuro',
  cancer: 'cancer',
};

// Every governed baseline this domain's engines emitted, one row per endpoint x horizon.
// Never collapses multiple endpoints into a single unlabeled number.
function baselineOutputRows(model, domain) {
  const domainKey = DOMAIN_RUNTIME_KEYS[domain.id] ?? domain.id;
  return (model?.risk ?? [])
    .filter((row) => row?.domain === domainKey && row?.target_id)
    .map((row) => {
      const probability = asFinite(row.probability);
      const horizon = asFinite(row.horizon_years);
      const state = row.state ?? row.calculation_state;
      const value = probability !== null
        ? percent(probability)
        : (STATE_LABELS[state] ?? String(state ?? 'Not emitted').replaceAll('_', ' '));
      return {
        endpoint: ENDPOINT_LABELS[row.target_id] ?? String(row.target_id).replaceAll('_', ' ').toLowerCase(),
        horizon: horizon === null ? null : Number(horizon),
        value,
        emitted: probability !== null,
        modelVersion: row.model_version ?? null,
        modelId: row.model_id ?? null,
      };
    })
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint) || ((a.horizon ?? 0) - (b.horizon ?? 0)));
}

function runtimeModelRows(model, domain) {
  const runtimeIds = new Set(domain.runtimeIds ?? [domain.modelId]);
  const emitted = (model?.risk ?? []).find((row) => runtimeIds.has(row.id));
  if (!emitted) return [];
  const rawValue = emitted.display ?? emitted.value;
  const state = emitted.state ?? emitted.calculation_state;
  const units = emitted.units ? ` ${emitted.units}` : '';
  const output = rawValue !== undefined && rawValue !== null
    ? `${rawValue}${units}`
    : state ? String(state).replaceAll('_', ' ') : 'Not emitted';
  return [
    ['Backend output', output],
    ['Runtime model', emitted.model_version ?? 'Not emitted'],
    ['Runtime note', emitted.route_note ?? emitted.model_note ?? emitted.note ?? 'Not emitted'],
  ];
}

function arrCard(selected, coordinate) {
  const key = `${selected.action.key} · ${selected.action.name} · ${selected.lane.label}`;
  if (!coordinate || coordinate.coordinate_status !== 'materialized') {
    const reason = coordinate?.blocked_reason === 'MISSING_TECHNIQUE_BINDING'
      ? 'No governed technique binding'
      : 'Compatible baseline risk not emitted for this patient';
    return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-key">${esc(key)}</div>
          <strong class="rs-arr-blocked-head">Absolute benefit not estimable for this patient</strong>
          <p class="rs-arr-blocked-note">${esc(reason)}. The relative effect stays in the plot below; no ARR or NNT is shown.</p>
        </section>`;
  }
  const baseline = percent(coordinate.baseline?.probability);
  const horizon = asFinite(coordinate.baseline?.horizon_years);
  const horizonText = horizon === null ? '' : ` over ${Number(horizon)} years`;
  const horizonAt = horizon === null ? '' : ` at ${Number(horizon)} years`;
  const arr = asFinite(coordinate.patient_coordinate?.arr);
  const nnt = asFinite(coordinate.patient_coordinate?.nnt);
  const scenarios = Array.isArray(coordinate.interval_scenarios) ? coordinate.interval_scenarios : [];
  const arrValues = scenarios.map((s) => asFinite(s?.arr)).filter((v) => v !== null);
  const nntValues = scenarios.map((s) => asFinite(s?.nnt)).filter((v) => v !== null);
  if (arr === null || baseline === null) {
    return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-key">${esc(key)}</div>
          <strong class="rs-arr-blocked-head">Absolute benefit not estimable for this patient</strong>
          <p class="rs-arr-blocked-note">The materialized coordinate is incomplete; no ARR or NNT is shown.</p>
        </section>`;
  }
  const arrPp = Number((arr * 100).toFixed(1));
  const arrRange = arrValues.length
    ? `[${Number((Math.min(...arrValues) * 100).toFixed(1))}–${Number((Math.max(...arrValues) * 100).toFixed(1))}]`
    : '';
  const nntRange = nntValues.length
    ? `interval ${Math.round(Math.min(...nntValues))}–${Math.round(Math.max(...nntValues))}`
    : '';
  const benefitPct = Number(benefit(selected.action).b.toFixed(1));
  const confidence = String(coordinate.matrix_confidence ?? selected.action.confidence ?? '').toUpperCase();
  const transport = typeof coordinate.transport_disclosure === 'string' && coordinate.transport_disclosure
    ? ` · ${coordinate.transport_disclosure}`
    : '';
  return `
        <section class="panel rs-arr" aria-label="Patient-conditioned benefit">
          <div class="rs-arr-main">
            <div class="rs-arr-key">${esc(key)}</div>
            <div class="rs-arr-answer"><span class="rs-arr-hero">${arrPp} fewer events</span><span class="rs-arr-interval">${esc(arrRange)}</span><span class="rs-arr-per">per 100 patients${esc(horizonText)}</span></div>
            <div class="rs-arr-chain">${esc(baseline)} baseline${esc(horizonAt)} × ${esc(fmtEffect(selected.action))} (${benefitPct}% relative benefit)</div>
            <div class="rs-arr-conf">${esc(confidence.charAt(0) + confidence.slice(1).toLowerCase())} ARR translation confidence${esc(transport)}</div>
          </div>
          <div class="rs-arr-side">
            <div class="rs-arr-nnt"><span class="rs-arr-nnt-value">${nnt === null ? 'NNT not emitted' : `NNT ${Math.round(nnt)}`}</span><span class="rs-arr-nnt-range">${esc(nntRange)}</span></div>
          </div>
        </section>`;
}

const TIER_CLASS = {
  'Low': 'low',
  'Borderline': 'borderline',
  'Intermediate': 'intermediate',
  'High': 'high',
  'Below high-risk threshold': 'low',
};
const TIER_RANK = {
  'High': 3,
  'Intermediate': 2,
  'Borderline': 1,
  'Low': 0,
  'Below high-risk threshold': 0,
};

function domainBaselineProbability(model, domain) {
  const entry = RISK_DOMAIN_TIERS[domain.id];
  const targetId = entry?.target_id;
  const horizonYears = entry?.horizon_years;
  const domainKey = DOMAIN_RUNTIME_KEYS[domain.id] ?? domain.id;
  // Tier grades the domain's declared primary endpoint at its declared horizon.
  // Never grades whichever coordinate happens to appear first.
  const row = (model?.risk ?? []).find((candidate) =>
    candidate?.domain === domainKey &&
    candidate?.target_id === targetId &&
    (horizonYears === undefined || asFinite(candidate?.horizon_years) === horizonYears) &&
    asFinite(candidate?.probability) !== null
  );
  return row ? asFinite(row.probability) : null;
}

// Tier labels come only from the governed tier artifact (RISK_DOMAIN_TIERS).
// No table -> "Not graded". No emitted baseline -> "Not emitted".
function domainTier(model, domain) {
  const entry = RISK_DOMAIN_TIERS[domain.id];
  const probability = domainBaselineProbability(model, domain);
  // No emitted baseline is a different fact from no governed tier table. Report the
  // more specific one first: nothing to grade beats nothing to grade it with.
  if (probability === null) return { label: 'Not emitted', cls: 'none', probability: null, rank: -1 };
  if (!entry || !entry.tiers) return { label: 'Not graded', cls: 'none', probability, rank: -1 };
  const tier = entry.tiers.find((t) =>
    (t.lt === undefined || probability < t.lt) && (t.gte === undefined || probability >= t.gte)
  );
  if (!tier) return { label: 'Not graded', cls: 'none', probability, rank: -1 };
  return { label: tier.label, cls: TIER_CLASS[tier.label] ?? 'none', probability, rank: TIER_RANK[tier.label] ?? -1 };
}

export function riskSpaceView(model, state) {
  const selectedDomainId = state.selectedRiskDomain
    ?? RISK_DOMAINS.find((d) => d.modelId === state.selectedRiskId)?.id;
  const triageDomain = [...RISK_DOMAINS].sort((a, b) => {
    const ta = domainTier(model, a);
    const tb = domainTier(model, b);
    return (tb.rank - ta.rank) || ((tb.probability ?? -1) - (ta.probability ?? -1));
  })[0];
  const domain = RISK_DOMAINS.find((d) => d.id === selectedDomainId) ?? triageDomain;
  const selected = findAction(domain, state.selectedRiskAction) ?? { action: domain.lanes[0].actions[0], lane: domain.lanes[0] };
  const selectedCoordinate = coordinateForAction(model, selected.action);
  const domainCoordinate = selectedCoordinate ?? riskArrCoordinates(model).find((coordinate) =>
    coordinate?.coordinate_status === 'materialized' &&
    domain.lanes.some((lane) => lane.actions.some((action) =>
      normalizedActionId(action.slug) === normalizedActionId(coordinate?.native_action_id)
    ))
  ) ?? null;
  const hasMaterializedCoordinate = riskArrCoordinates(model).some((coordinate) => coordinate?.coordinate_status === 'materialized');

  const tabs = RISK_DOMAINS.map((d) => {
    const tier = domainTier(model, d);
    return `<button type="button" id="risk-domain-tab-${esc(d.id)}" data-rs-domain="${esc(d.id)}" data-risk-domain="${esc(d.modelId)}" role="tab" aria-controls="risk-domain-panel" aria-selected="${d.id === domain.id}" tabindex="${d.id === domain.id ? '0' : '-1'}" class="rs-tab${d.id === domain.id ? ' on' : ''}">${esc(d.title)}<span class="rs-tab-tier rs-tier-${tier.cls}">${esc(tier.label)}</span></button>`;
  }).join('');

  const modelRows = [...modelRowsWithBaseline(domain, domainCoordinate), ...runtimeModelRows(model, domain)]
    .map(([k, v]) => `<li><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></li>`).join('');

  // Multi-endpoint baseline table: every governed output this domain's engines emitted.
  const baselines = baselineOutputRows(model, domain);
  const emittedCount = baselines.filter((row) => row.emitted).length;
  const baselineHeadNote = baselines.length === 0
    ? 'No governed baseline outputs for this domain'
    : `${emittedCount} of ${baselines.length} endpoint${baselines.length === 1 ? '' : 's'} emitted`;
  const baselineTable = baselines.length === 0
    ? ''
    : `<table class="rs-baselines"><caption class="rs-baselines-cap">Baseline risk by endpoint</caption>
        <thead><tr><th scope="col">Endpoint</th><th scope="col">Horizon</th><th scope="col">Absolute risk</th></tr></thead>
        <tbody>${
          baselines.map((row) => `<tr${row.emitted ? '' : ' class="rs-baseline-blocked"'}>
            <td>${esc(row.endpoint)}</td>
            <td class="rs-baseline-horizon">${row.horizon === null ? '—' : `${row.horizon} yr`}</td>
            <td class="rs-baseline-value">${esc(row.value)}</td>
          </tr>`).join('')
        }</tbody></table>`;

  const lanes = domain.lanes.map((laneDef) => {
    const { svg, positions } = laneSvg(domain, laneDef, selected.action.slug);
    const cards = laneDef.actions
      .map((action) => hoverCard(action, coordinateForAction(model, action), positions.get(action.slug)))
      .join('');
    const keys = laneDef.actions
      .map((action) => `<button type="button" class="${action.slug === selected.action.slug ? 'on' : ''}" data-rs-action="${esc(action.slug)}"><span class="rs-key-code">${esc(action.key)}</span> ${esc(action.name)}</button>`)
      .join('');
    return `
    <div class="rs-lane">
      <div class="rs-lane-label"><strong>${esc(laneDef.label)}</strong><span>${laneDef.actions.length} production ready</span></div>
      <div class="rs-plot">${svg}${cards}</div>
      <div class="rs-key">${keys}</div>
    </div>`;
  }).join('');

  const tray = domain.tray.length ? `
    <section class="panel rs-tray"><div class="panel-head"><h3>Outside this plot</h3></div>
      <ul class="rs-model-list">${domain.tray.map(([name, reason, confidence]) => `<li><span class="k">${esc(name)}</span><span class="v">${esc(`${reason}${confidence ? ` Matrix confidence ${confidence}.` : ''}`)}</span></li>`).join('')}</ul>
    </section>` : '';

  const ledger = domain.lanes.flatMap((laneDef) => laneDef.actions.map((action) => `
    <div class="rs-ledger-row${action.slug === selected.action.slug ? ' selected' : ''}" data-rs-ledger="${esc(action.slug)}">
      <div class="rs-key">${esc(action.key)}</div>
      <div><div class="rs-action-name">${esc(action.name)}</div><div class="rs-action-detail">${esc(laneDef.label)}</div></div>
      <div class="rs-effect">${esc(fmtEffect(action))}</div>
      <div class="rs-confidence">Confidence · ${esc(action.confidence.charAt(0) + action.confidence.slice(1).toLowerCase())}</div>
    </div>`)).join('');

  return `
    <header class="screen-head"><div><h1>Risk</h1><p>${hasMaterializedCoordinate ? 'Patient-conditioned baseline risk and absolute risk reduction are emitted where endpoint-compatible.' : 'Native relative effects by disease domain. Baseline risk not yet emitted; absolute risk reduction appears when it is.'}</p></div></header>
    <nav class="rs-tabs" role="tablist" aria-label="Risk domains">${tabs}</nav>
    <div class="rs-workspace" id="risk-domain-panel" role="tabpanel" aria-labelledby="risk-domain-tab-${esc(domain.id)}">
      <section class="rs-main">
        <div class="rs-domain-intro"><h2>${esc(domain.title)}</h2><span>${domain.ready} production ready</span></div>
        <section class="panel rs-model"><div class="panel-head"><h3>Risk model state</h3><span>${esc(baselineHeadNote)}</span></div>
          <div class="rs-model-block"><h4>${esc(domain.modelHead)}</h4>
            ${baselineTable}
            <ul class="rs-model-list">${modelRows}</ul>
          </div>
        </section>
        ${arrCard(selected, selectedCoordinate)}
        <section class="panel rs-space">
          <div class="panel-head"><h3>Action Space</h3><span>Dot: source estimate · whisker: 95% interval · X band: ARR V1 matrix confidence · hover a dot for detail</span></div>
          ${lanes}
          <p class="rs-axis-note">Relative benefit = (1 minus HR or RR) x 100. Vertical position is comparable only within its endpoint lane. X bands are ARR V1 matrix confidence, grading translation confidence, not trial evidence quality.</p>
        </section>
        ${tray}
        <section class="panel rs-ledger"><div class="panel-head"><h3>Selected actions</h3><span>Native effect and confidence shown as independent fields</span></div>
          ${ledger}
        </section>
      </section>
    </div>`;
}
