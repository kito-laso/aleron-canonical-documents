import { displayValue } from './dashboardAdapter.js?v=physician-ai-colleague-v1';
import { formatTrendLine } from './wearableSummary.js?v=physician-ai-colleague-v1';
import { getOverrideTaxonomy } from './apiClient.js';
import { recommendationTraceHTML, releasePreviewHTML } from './clinicalTrace.js?v=physician-ai-colleague-v1';
import { riskSpaceView } from './riskSpaceView.js?v=physician-ai-colleague-v1';
import { screeningView } from './screeningView.js?v=physician-ai-colleague-v1';
import { aiColleagueView } from './aiColleagueView.js?v=physician-ai-colleague-v1';

// Vitality is out of scope for V1 (Jason, 2026-07-24). The tab is removed from
// navigation so the surface is unreachable; vitalityView() and its adapter path
// remain in place, unrouted, so the section can be restored by re-adding the label.
const TAB_LABELS = [
  ['patient-data', 'Patient Data'],
  ['risk', 'Risk'],
  ['screening', 'Screening'],
  ['care-plan', 'Care Plan'],
  ['journal', 'Journal'],
  ['aleron-ai', 'Aleron AI']
];

export function esc(value) {
  return String(value ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export function renderFatalError(app, title, errorMessage) {
  app.innerHTML = `<main class="login-shell"><section class="login-card"><h1>${esc(title)}</h1><p class="error-line">${esc(errorMessage)}</p></section></main>`;
}

function stateText(value) {
  return String(value ?? 'unknown').replaceAll('_', ' ');
}

/** Soft-humanize snake_case event names for journal (keep clinical tokens readable). */
function humanizeEventName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Event missing';
  if (!raw.includes('_') && /[A-Z]/.test(raw)) return raw;
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bCkd\b/g, 'CKD')
    .replace(/\bKfre\b/g, 'KFRE');
}

function empty(message) {
  return `<div class="empty-state">${esc(message)}</div>`;
}

function icon(name) {
  const paths = {
    'patient-data': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
    risk: '<path d="M12 3.5l7 3v5.3c0 4.1-2.8 7.8-7 8.7-4.2-.9-7-4.6-7-8.7V6.5l7-3Z"/><path d="M8.5 13.2l2.2-2.2 2.1 2.1 2.8-3.8"/>',
    screening: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/><path d="M8.5 11h5M11 8.5v5"/>',
    vitality: '<path d="M3 18l6-6 4 4 8-8"/><path d="M17 8h4v4"/>',
    'care-plan': '<path d="M4 5h16M4 12h16M4 19h10"/>',
    journal: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
    'aleron-ai': '<path d="M5 6.5h14a2 2 0 0 1 2 2v6.2a2 2 0 0 1-2 2H10.5L6 20v-3.3H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"/>'
  };
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function provenanceText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Provenance missing';
  if (/synthetic_representative_fixture|synthetic representative/i.test(raw)) return 'Synthetic representative packet';
  if (/patient packet/i.test(raw)) return raw;
  return raw.replaceAll('_', ' ');
}

function sparklineSvg(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return '';
  const w = 88;
  const h = 22;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => {
    const x = (i / (nums.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="wearable-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${pts}"/></svg>`;
}

function dataRows(rows, { wearables = false } = {}) {
  return rows.map((row) => {
    const measure = esc(displayValue(row.value, row.units, row.state ?? row.status));
    if (!wearables) {
      return `
    <div class="data-row">
      <div><strong>${esc(row.label ?? row.key)}</strong><small class="provenance">${esc(provenanceText(row.provenance))}</small></div>
      <div class="measure">${measure}</div>
    </div>`;
    }
    const state = row.trend_state || 'snapshot_only';
    const trend = row.trend_line ? `<small class="trend-line trend-${esc(state)}">${esc(row.trend_line)}</small>` : '';
    const spark = sparklineSvg(row.sparkline);
    return `
    <div class="data-row wearable-row" data-trend-state="${esc(state)}">
      <div>
        <strong>${esc(row.label ?? row.key)}</strong>
        <small class="provenance">${esc(provenanceText(row.provenance))}</small>
        ${trend}
      </div>
      <div class="measure wearable-measure">
        ${spark}
        <span>${measure}</span>
      </div>
    </div>`;
  }).join('');
}

function contextItem(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value ?? '');
  if (value.gene) return [value.gene, value.variant ?? value.genotype, value.classification, value.zygosity].filter(Boolean).join(' · ');
  if (value.condition || value.relation) {
    const onset = value.onset_age == null ? null : `onset ${value.onset_age}`;
    return [value.condition, value.relation, onset].filter(Boolean).join(' · ');
  }
  return value.label ?? value.title ?? value.name ?? value.value ?? JSON.stringify(value);
}

function contextRows(model) {
  const rows = [];
  if (model.patientData.familyHistory.length) rows.push({ label: 'Family history', value: model.patientData.familyHistory.map(contextItem).join('; '), provenance: 'patient packet' });
  if (model.patientData.symptoms.length) rows.push({ label: 'Symptoms', value: model.patientData.symptoms.map(contextItem).join('; '), provenance: 'patient packet' });
  if (model.patientData.genetics?.length) rows.push({ label: 'Genetics', value: model.patientData.genetics.map(contextItem).join('; '), provenance: 'patient packet · synthetic representative' });
  return rows;
}

function patientDataView(model) {
  // Density: omit empty clinical groups rather than rendering placeholder shelves.
  const instrumentNote = model.patientData.instrumentNote
    ? `<p class="wearable-instrument-note">${esc(model.patientData.instrumentNote)}</p>`
    : '';
  const coverage = model.patientData.wearableSummary?.coverage;
  const coverageLine = coverage
    ? `<p class="wearable-coverage">Coverage · nights ${esc(coverage.nights_28d ?? 'Not emitted')} · step days ${esc(coverage.days_steps_28d ?? 'Not emitted')}${coverage.last_sync_at ? ` · last sync ${esc(String(coverage.last_sync_at).slice(0, 16))}` : ''}</p>`
    : '';
  const groups = model.patientData.groups.map((group) => {
    const rows = group.id === 'context' ? [...group.measurements, ...contextRows(model)] : group.measurements;
    if (!rows.length) return '';
    const extra = group.id === 'wearables' ? `${instrumentNote}${coverageLine}` : '';
    return `<section class="data-group" data-clinical-group="${esc(group.id)}"><h2>${esc(group.label)}</h2>${extra}<div class="data-rows">${dataRows(rows, { wearables: group.id === 'wearables' })}</div></section>`;
  }).join('');
  const uncategorized = model.patientData.uncategorized.length
    ? `<section class="data-group" data-clinical-group="uncategorized"><h2>Other / Uncategorized</h2><div class="data-rows">${dataRows(model.patientData.uncategorized)}</div></section>`
    : '';
  const filledGroups = groups + uncategorized;
  const orders = model.patientData.orders.map((order) => `
    <div class="data-row compact">
      <div><strong>${esc(order.vendor ?? order.order_type ?? 'Order')}</strong><small class="provenance">${esc(stateText(order.panel ?? order.order_id ?? 'Panel missing'))}</small></div>
      <div class="status-word status-baseline">${esc(stateText(order.status ?? order.state ?? 'pending'))}</div>
    </div>`).join('');
  const summary = model.patientData.summary;
  const summaryHtml = summary ? `<section class="input-summary"><span class="section-label">Input readiness</span><div class="summary-grid"><div><span>Completeness</span><strong>${esc(summary.completeness ?? 'Not emitted')}</strong></div><div><span>Recency</span><strong>${esc(summary.recency ?? 'Not emitted')}</strong></div><div><span>Provenance</span><strong>${esc(summary.provenance ?? 'Not emitted')}</strong></div><div><span>Missingness</span><strong>${esc(summary.missingness ?? 'None emitted')}</strong></div></div>${Array.isArray(summary.abnormal_findings) && summary.abnormal_findings.length ? `<p><strong>Abnormal findings</strong> ${esc(summary.abnormal_findings.join(' · '))}</p>` : ''}</section>` : `<section class="input-summary integrity-error"><strong>Input readiness summary not emitted by backend.</strong></section>`;
  return `
    <header class="screen-head"><div><h1>Patient data</h1><p>Identity, signals, and the labs the models read from, governed by packet schema and wearable history requirements.</p></div></header>
    ${summaryHtml}
    <section class="instrument-panel patient-data-panel">
      <div class="patient-line"><strong>${esc(model.patient.name)}</strong>${model.patient.code && model.patient.code !== 'Code missing' ? `<span>${esc(model.patient.code)}</span>` : ''}<span>${esc(displayValue(model.patient.age, 'years'))}</span><span>${esc(model.patient.sex ?? 'Sex missing')}</span>${model.patient.phenotype ? `<span>${esc(model.patient.phenotype)}</span>` : ''}</div>
      <div class="clinical-groups">${filledGroups || empty('Not measured or insufficient input.')}</div>
    </section>
    <section class="instrument-panel"><div class="panel-head"><h2>Orders</h2><span>Backend order state</span></div>${orders || empty('No lab orders on this synthetic case')}</section>`;
}

function riskView(model, state) {
  if (!model.risk.length) return `<header class="screen-head"><div><h1>Risk</h1><p>Model interpretation by disease domain.</p></div></header>${empty('Risk outputs unavailable. Insufficient input or model run pending.')}`;
  const selectedId = state.selectedRiskId && model.risk.some((row) => row.id === state.selectedRiskId) ? state.selectedRiskId : model.risk[0].id;
  const row = model.risk.find((candidate) => candidate.id === selectedId);
  const domainShort = {
    prevent_base_representative: 'Cardiovascular',
    metabolic_qdiabetes_representative: 'Metabolic',
    kidney_ckd_representative: 'Kidney',
    neuro_cogdrisk_representative: 'Neuro',
    cancer_site_engines_representative: 'Cancer',
  };
  const domainTitle = (domain) => domainShort[domain.id] ?? domain.label ?? domain.id;
  const emittedList = (value) => Array.isArray(value) ? value : [];
  const itemText = (item) => typeof item === 'string' ? item : item?.label ?? item?.title ?? item?.name ?? item?.value ?? 'Unavailable';
  const itemDetail = (item) => typeof item === 'object' ? item?.detail ?? item?.reason ?? item?.why ?? item?.source ?? (item?.value !== undefined ? displayValue(item.value, item.units, item.state) : '') : '';
  const levers = emittedList(row.actionable_levers ?? row.levers ?? row.modifiable_drivers);
  const evidence = emittedList(row.patient_evidence ?? row.evidence ?? row.inputs ?? row.patient_inputs);
  const moves = emittedList(row.clinical_next_moves ?? row.next_moves);
  const variables = emittedList(row.variables ?? row.model_variables);
  const audit = emittedList(row.model_audit_trail ?? row.audit_trail ?? row.outputs);
  const interpretation = row.risk_interpretation ?? row.interpretation ?? row.summary ?? row.detail;
  const confidence = row.confidence?.display ?? row.confidence?.label ?? row.confidence ?? row.confidence_note;
  const riskDisplayFor = (domain) => displayValue(
    domain.display ?? domain.value,
    domain.units,
    domain.state ?? domain.calculation_state,
    { modelNote: domain.model_note ?? domain.route_note }
  );
  const listOrUnavailable = (items, unavailable) => items.length ? items.map((item) => `<div class="risk-fact"><strong>${esc(itemText(item))}</strong>${itemDetail(item) ? `<small>${esc(itemDetail(item))}</small>` : ''}</div>`).join('') : `<div class="truth-empty">${esc(unavailable)}</div>`;
  const variableRows = variables.length ? variables.map((variable) => {
    const geometry = variable.geometry ?? {};
    const position = Number(geometry.position_percent ?? variable.position_percent);
    const hasGeometry = Number.isFinite(position) && (variable.range || variable.axis_range || geometry.range);
    return `<div class="risk-variable"><div><strong>${esc(variable.label ?? variable.name ?? variable.id)}</strong><small>${esc(displayValue(variable.display ?? variable.value, variable.units, variable.state))}</small></div>${hasGeometry ? `<div class="variable-track" style="--pos:${Math.max(0, Math.min(100, position))}%" aria-label="Backend-provided variable geometry"><i></i></div>` : ''}</div>`;
  }).join('') : '<div class="truth-empty">Variable detail not emitted by the backend.</div>';
  const auditRows = audit.length ? listOrUnavailable(audit, '') : `<div class="risk-audit-cell"><span>Model source</span><strong>${esc(row.source ?? 'Not emitted')}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}</small></div>`;
  return `
    <header class="screen-head"><div><h1>Risk</h1><p>Model interpretation by disease domain. Missing fields stay visible.</p></div></header>
    <nav class="risk-domain-nav" role="tablist" aria-label="Risk domains">${model.risk.map((domain) => {
      const modelFamily = String(domain.model_version ?? domain.label ?? '').match(/PREVENT|FINDRISC|KFRE|CAIDE|cancer/i)?.[0] ?? '';
      return `<button type="button" data-risk-domain="${esc(domain.id)}" role="tab" aria-selected="${domain.id === selectedId}" class="${domain.id === selectedId ? 'on' : ''}"><span class="risk-domain-copy"><strong>${esc(domainTitle(domain))}</strong>${modelFamily ? `<small>${esc(modelFamily)}</small>` : ''}</span><span>${esc(riskDisplayFor(domain))}</span></button>`;
    }).join('')}</nav>
    <section class="risk-dossier" role="tabpanel">
      <div class="risk-hero"><div><span class="risk-eyebrow">Risk interpretation · ${esc(domainTitle(row))}</span><h2>${esc(interpretation ?? 'Interpretation not emitted by the backend.')}</h2><p>${esc(row.route_note ?? row.model_note ?? 'No additional interpretation was emitted.')}</p><small class="model-version-line">${esc(row.model_version ?? 'Model version not emitted')} · ${esc(row.label ?? row.id)}${row.canonical ? ` · <a class="truth-inline" href="${esc(row.canonical.href || '#')}" target="_blank" rel="noopener noreferrer">${esc(row.canonical.label)}</a> <code class="truth-path">${esc(row.canonical.repoPath)}</code>` : ''}</small></div><div class="risk-scorecard"><span class="risk-eyebrow">Current read</span><strong>${esc(riskDisplayFor(row))}</strong><small>${esc(row.horizon ?? 'Horizon not emitted')}<br>${esc(row.source ?? 'Model provenance not emitted')}</small></div></div>
      ${(() => {
        const meaningBits = [];
        if (levers.length) meaningBits.push(`<section><span>Actionable levers</span>${listOrUnavailable(levers, '')}</section>`);
        if (evidence.length) meaningBits.push(`<section><span>Patient evidence</span>${listOrUnavailable(evidence, '')}</section>`);
        if (confidence) meaningBits.push(`<section><span>Confidence</span><div class="risk-fact"><strong>${esc(confidence)}</strong><small>${esc(row.confidence?.note ?? row.confidence_note ?? '')}</small></div></section>`);
        return meaningBits.length ? `<div class="risk-meaning-grid">${meaningBits.join('')}</div>` : '';
      })()}
      ${moves.length ? `<section class="risk-next"><div class="risk-section-head"><h3>Clinical next moves</h3></div>${moves.map((move, index) => `<div class="risk-next-row"><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${esc(itemText(move))}</strong><small>${esc(itemDetail(move) || '')}</small></div></div>`).join('')}</section>` : ''}
      ${variables.length ? `<section class="risk-variables"><div class="risk-section-head"><h3>Variables</h3></div>${variableRows}</section>` : ''}
      <section class="risk-audit"><div class="risk-section-head"><h3>Model audit trail</h3></div><div class="risk-audit-grid">${auditRows}</div></section>
    </section>`;
}

const ACTION_SPACE_EVIDENCE = [
  ['component_pass', 'Contract pass'],
];

function actionSpaceCategory(item) {
  if (item.kind === 'diagnostic') return { id: 'diagnostics', label: 'Diagnostics' };
  if (item.kind !== 'action') return null;
  const explicit = String(item.category ?? '').trim();
  return explicit ? { id: `category:${encodeURIComponent(explicit)}`, label: explicit } : { id: 'actions', label: 'Actions' };
}

function actionSpaceValue(value) {
  if (!Number.isFinite(value)) return 'Not plottable';
  return `${Number(value.toFixed(4))} QALY`;
}

function axisQalyValue(value) {
  const decimals = Math.abs(value) >= 1 ? 1 : 2;
  return `${Number(value.toFixed(decimals))} QALY`;
}

function auditQalyValue(value) {
  return Number.isFinite(value) ? `${Number(value.toFixed(6))} QALY` : 'Missing';
}

function actionSpaceEvidenceLabel(item) {
  return ACTION_SPACE_EVIDENCE.find(([id]) => id === item.evidenceCategory)?.[1] ?? 'Confidence contract incomplete';
}

function actionSpaceRecordText(value) {
  if (Array.isArray(value)) {
    const items = value.map(actionSpaceRecordText).filter((item) => item && item !== 'Not emitted');
    return items.length ? items.join(' · ') : 'Not emitted';
  }
  if (value && typeof value === 'object') {
    const named = value.label ?? value.title ?? value.name ?? value.id;
    const detail = value.value ?? value.result ?? value.state ?? value.status;
    if (named !== undefined && detail !== undefined) return `${named}: ${detail}${value.units ? ` ${value.units}` : ''}`;
    if (named !== undefined) return String(named);
    const primitiveFields = Object.entries(value)
      .filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry))
      .slice(0, 5)
      .map(([key, entry]) => `${stateText(key)}: ${entry}`);
    return primitiveFields.length ? primitiveFields.join(' · ') : 'Structured record emitted';
  }
  const text = String(value ?? '').trim();
  return text || 'Not emitted';
}

function actionSpaceValueBasis(item) {
  if (item.kind !== 'diagnostic') return 'Expected net patient value';
  const factor = (value) => {
    const raw = value && typeof value === 'object' ? value.value : value;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };
  const probability = factor(item.diagnosticFactors?.reclassificationProbability);
  const qaly = factor(item.diagnosticFactors?.qalyIfReclassified);
  const parts = [];
  if (probability !== null && probability >= 0 && probability <= 1) parts.push(`${Number((probability * 100).toFixed(1))}% reclassification`);
  if (qaly !== null) parts.push(`${actionSpaceValue(qaly)} if reclassified`);
  return parts.length ? parts.join(' · ') : 'Diagnostic factors not emitted';
}

function actionSpaceView(model, state) {
  const records = model.actionMap.items ?? [];
  const plottable = records.filter((item) => item.plottable);
  const groups = [];
  for (const item of plottable) {
    const group = actionSpaceCategory(item);
    if (group && !groups.some((entry) => entry.id === group.id)) groups.push(group);
  }
  const filters = [{ id: 'all', label: 'All' }, ...groups.sort((left, right) => (left.id === 'diagnostics' ? -1 : right.id === 'diagnostics' ? 1 : 0))];
  const activeFilter = filters.some((filter) => filter.id === state.actionSpaceFilter) ? state.actionSpaceFilter : 'all';
  const visible = plottable.filter((item) => activeFilter === 'all' || actionSpaceCategory(item)?.id === activeFilter);
  const selectedId = visible.some((item) => item.id === state.selectedActionSpaceItemId)
    ? state.selectedActionSpaceItemId
    : visible[0]?.id ?? null;
  const selectedItem = visible.find((item) => item.id === selectedId) ?? null;
  const evidenceIndex = (item) => Math.max(0, ACTION_SPACE_EVIDENCE.findIndex(([id]) => id === item.evidenceCategory));
  const values = visible.map((item) => item.expectedValueQaly);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const hasRange = max !== min;
  const domainScale = Math.max(Math.abs(min), Math.abs(max), 1);
  const scaledMin = min / domainScale;
  const scaledMax = max / domainScale;
  const scaledRange = scaledMax - scaledMin;
  const laneTotals = new Map();
  for (const item of visible) {
    const lane = evidenceIndex(item);
    laneTotals.set(lane, (laneTotals.get(lane) ?? 0) + 1);
  }
  const laneCounts = new Map();
  const xFor = (item) => {
    const lane = evidenceIndex(item);
    const order = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, order + 1);
    const total = laneTotals.get(lane) ?? 1;
    const center = 360;
    if (total === 1) return center;
    const maxExtent = 250;
    const extent = Math.min(maxExtent, (total - 1) * 7);
    return center - extent + (order * extent * 2) / (total - 1);
  };
  const yForValue = (value) => hasRange
    ? 300 - (((value / domainScale) - scaledMin) / scaledRange) * 240
    : 300;
  const yFor = (item) => yForValue(item.expectedValueQaly);
  const midpoint = min / 2 + max / 2;
  const axisValues = (hasRange ? [max, midpoint, 0, min] : [0])
    .filter((value, index, values) => values.findIndex((candidate) => Math.abs(candidate - value) < 1e-9) === index)
    .sort((left, right) => right - left);
  let previousTickLabelY = -Infinity;
  const axisTicks = axisValues.map((value) => {
    const y = yForValue(value);
    const zero = Math.abs(value) < 1e-9;
    const labelY = Math.max(y + 4, previousTickLabelY + 16);
    previousTickLabelY = labelY;
    return `<line class="action-space-grid${zero ? ' zero' : ''}" x1="76" y1="${y}" x2="690" y2="${y}"/><text data-qaly-tick="${value}" x="70" y="${labelY}" text-anchor="end">${esc(axisQalyValue(value))}</text>`;
  }).join('');
  const evidenceGuides = '';
  const marks = visible.map((item) => {
    const x = xFor(item);
    const y = yFor(item);
    const selected = item.id === selectedId;
    const shape = item.kind === 'diagnostic'
      ? `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="1"/>`
      : `<circle cx="${x}" cy="${y}" r="7"/>`;
    const fullLabel = item.label ?? item.id;
    const shortLabel = fullLabel.length > 44 ? `${fullLabel.slice(0, 41)}...` : fullLabel;
    const labelX = x > 520 ? x - 14 : x + 14;
    const labelAnchor = x > 520 ? 'end' : 'start';
    const labelY = Math.max(38, y - 11);
    const selectedLabel = selected
      ? `<text data-action-space-selected-label="${esc(item.id)}" class="action-space-selected-label" x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}"><tspan x="${labelX}" dy="0">${esc(shortLabel)}</tspan><tspan x="${labelX}" dy="14">${esc(actionSpaceValue(item.expectedValueQaly))}</tspan></text>`
      : '';
    return `<g data-action-space-mark="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(`${fullLabel}, ${actionSpaceValue(item.expectedValueQaly)}`)}" aria-pressed="${selected}" data-mark-kind="${esc(item.kind)}" class="action-space-mark ${selected ? 'selected ' : ''}${esc(item.disposition ?? 'staged')}" transform="translate(0 0)">${shape}${selected ? `<circle class="selection-ring" cx="${x}" cy="${y}" r="13"/>` : ''}<title>${esc(fullLabel)} · ${esc(actionSpaceValue(item.expectedValueQaly))}</title></g>${selectedLabel}`;
  }).join('');
  const labels = ACTION_SPACE_EVIDENCE.map(([, label]) => `<text x="360" y="334" text-anchor="middle">${esc(label)}</text>`).join('');
  const ledger = visible.map((item) => {
    const status = item.disposition ? stateText(item.disposition) : 'Not emitted';
    return `<button type="button" data-action-space-item="${esc(item.id)}" aria-pressed="${item.id === selectedId}" class="action-space-ledger-row ${item.id === selectedId ? 'selected' : ''}">
      <span class="action-space-ledger-item"><span class="mark-key ${esc(item.kind)}" aria-hidden="true"></span><span><strong>${esc(item.label ?? item.id)}</strong><small>${esc(item.source ?? 'Source not emitted')}</small></span></span>
      <span class="action-space-ledger-value"><strong>${esc(actionSpaceValue(item.expectedValueQaly))}</strong><small>${esc(actionSpaceValueBasis(item))}</small></span>
      <span class="action-space-ledger-status"><strong>${esc(status)}</strong><small>${esc(actionSpaceEvidenceLabel(item))}</small></span>
      <span class="action-space-ledger-logic">${esc(item.decisionLogic ?? 'Decision logic not emitted')}</span>
    </button>`;
  }).join('');
  const detailField = (label, value) => `<div><span>${esc(label)}</span><p>${esc(actionSpaceRecordText(value))}</p></div>`;
  const selectedDetail = selectedItem ? `<section class="action-space-detail" data-action-space-detail="${esc(selectedItem.id)}">
    <div class="panel-head"><h2>Selected item provenance</h2><span>${esc(stateText(selectedItem.kind))} · ${esc(actionSpaceEvidenceLabel(selectedItem))}</span></div>
    <div class="action-space-detail-grid">
      ${detailField('Patient signals', selectedItem.patientSignals)}
      ${detailField('Model references', selectedItem.modelOutputRefs)}
      ${detailField('Evidence basis', selectedItem.evidenceBasis)}
      ${detailField('Eligibility', selectedItem.eligibility)}
      ${detailField('Selection rationale', selectedItem.whySelected ?? selectedItem.whyNotSelected)}
      ${detailField('Source and decision logic', [selectedItem.source, selectedItem.decisionLogic].filter(Boolean))}
    </div>
  </section>` : '';
  const adjacent = (title, items, kind, collapsible = false) => {
    const rows = items.map((item) => {
      const id = item.id ?? item.candidate_id ?? item.library_item_id ?? item.label ?? 'unidentified';
      return `<div data-adjacent-item="${esc(id)}"><strong>${esc(item.label ?? id)}</strong><small>${esc(item.reason ?? item.nonPlottableReason ?? item.whyNotSelected ?? item.decisionLogic ?? item.source ?? id)}</small></div>`;
    }).join('');
    if (collapsible && items.length) {
      const countLabel = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
      return `<details class="action-space-adjacent action-space-adjacent-collapsed" data-action-space-${kind}><summary><span>${esc(title)}</span><span>${esc(countLabel)}</span></summary><div class="action-space-adjacent-list">${rows}</div></details>`;
    }
    return `<section class="action-space-adjacent" data-action-space-${kind}><h3>${esc(title)}</h3>${items.length ? rows : empty(`No ${title.toLowerCase()} emitted.`)}</section>`;
  };
  const nonPlottable = records.filter((item) => !item.plottable && item.disposition !== 'excluded');

  const excludedScored = records.filter((item) => item.disposition === 'excluded');
  const excluded = [...(model.actionMap.excluded ?? []), ...excludedScored]
    .filter((item, index, items) => {
      const id = item.id ?? item.candidate_id ?? item.library_item_id ?? item.label;
      return items.findIndex((candidate) => (candidate.id ?? candidate.candidate_id ?? candidate.library_item_id ?? candidate.label) === id) === index;
    });
  return `<header class="screen-head"><div><h1>Action Space</h1><p>Expected patient value for records that pass the governed component confidence contract. Actions plot expected net value; diagnostics plot emitted optimized-policy value of information.</p></div></header>
    <div class="action-space-boundary">A library status such as fully_derived_v2 is not clinical promotion. Only records with a complete typed confidence contract and explicit promotion eligibility are plotted.</div>
    <section class="action-space-layout" data-action-space-layout="reference-stack">
      <div class="action-space-map"><div class="panel-head"><h2>Action map</h2><span>Every promoted action and diagnostic on one patient-QALY scale</span></div><div class="action-space-plot" role="region" aria-label="Action map plot" tabindex="0"><svg viewBox="0 0 720 360" role="img" aria-label="Expected QALY for confidence-contract-pass records"><line class="action-space-axis" x1="76" y1="60" x2="76" y2="300"/>${evidenceGuides}${axisTicks}<text x="20" y="28">Expected QALY ↑</text><text x="382" y="354" text-anchor="middle">Confidence contract state</text>${labels}${marks}${visible.length ? '' : '<text x="360" y="180" text-anchor="middle">No confidence-contract-pass promoted items</text>'}</svg></div><div class="action-space-legend" data-action-space-legend><span><i class="mark-key action" aria-hidden="true"></i>Action</span><span><i class="mark-key diagnostic" aria-hidden="true"></i>Diagnostic</span><span><i class="mark-key selected-key" aria-hidden="true"></i>Selected</span><span><i class="mark-key deferred-key" aria-hidden="true"></i>Deferred</span></div></div>
      <div class="action-space-ledger"><div class="panel-head"><h2>Confidence ledger</h2><span>Every plotted mark, its value, status, and decision logic · ${visible.length} plotted</span></div><nav class="action-space-filters" aria-label="Action Space categories">${filters.map((filter) => `<button type="button" data-action-space-filter="${esc(filter.id)}" aria-pressed="${filter.id === activeFilter}" class="${filter.id === activeFilter ? 'on' : ''}">${esc(filter.label)} <span>${filter.id === 'all' ? plottable.length : plottable.filter((item) => actionSpaceCategory(item)?.id === filter.id).length}</span></button>`).join('')}</nav><div class="action-space-ledger-head" data-action-space-ledger-head aria-hidden="true"><span>Item</span><span>Patient value</span><span>Status</span><span>Decision logic</span></div>${ledger || empty('No confidence-contract-pass promoted items.')}</div>
      ${selectedDetail}
    </section>
    <section class="action-space-audit"><h2>Adjacent audit</h2>${adjacent('Non-plottable records', nonPlottable, 'nonplottable')}${adjacent('Required obligations', model.actionMap.required ?? [], 'required')}${adjacent('Excluded items', excluded, 'excluded', true)}</section>`;
}

function modelsView(model, state) {
  return riskSpaceView(model, state);
}

function vitalityRange(row) {
  const range = row.chart_range ?? row.range ?? row.axis_range;
  const min = Number(range?.min);
  const max = Number(range?.max);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

function vitalityChart(row) {
  const range = vitalityRange(row);
  const value = Number(row.value);
  if (!range || !Number.isFinite(value)) return '';
  const yFor = (input) => 82 - ((Number(input) - range.min) / (range.max - range.min)) * 60;
  const y = yFor(value);
  const bands = Array.isArray(row.bands) ? row.bands : [];
  const bandGeometry = bands.map((band) => {
    const min = Number(band.min);
    const max = Number(band.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return '';
    const top = yFor(max);
    const height = yFor(min) - top;
    return `<rect class="chart-reference" x="8" y="${top}" width="264" height="${height}"><title>${esc(band.label ?? `${band.min} to ${band.max}`)}</title></rect>`;
  }).join('');
  const bandLabels = bands.map((band) => band.label).filter(Boolean).map((label) => `<span>${esc(label)}</span>`).join('');
  return `<div class="vitality-figure"><svg class="vitality-chart" viewBox="0 0 280 108" role="img" aria-label="${esc(row.label)} backend-ranged value">
    <line class="chart-grid" x1="8" y1="82" x2="272" y2="82"/><line class="chart-grid" x1="8" y1="22" x2="272" y2="22"/>
    ${bandGeometry}<path class="chart-line" d="M12 ${y} H218"/><circle class="chart-dot" cx="218" cy="${y}" r="5"/>
    <text class="chart-label" x="8" y="100">${esc(displayValue(range.min, row.units))}</text><text class="chart-label chart-label-end" x="272" y="100">${esc(displayValue(range.max, row.units))}</text><text class="chart-value" x="226" y="${y - 8}">${esc(displayValue(row.value, row.units))}</text>
  </svg>${bandLabels ? `<div class="chart-band-labels">${bandLabels}</div>` : ''}</div>`;
}

const DEVICE_INSTRUMENT_ORDER = [
  ['resting_hr', 'Resting heart rate (RHR)', 'bpm'],
  ['hrv_rmssd', 'HRV (rMSSD)', 'ms'],
  ['hrv_sdnn', 'HRV (SDNN)', 'ms'],
  ['sleep_duration', 'Sleep duration', 'h'],
  ['steps', 'Steps', 'count'],
  ['active_minutes', 'Active minutes', 'min']
];

const DEVICE_CONTEXT_ROLE = {
  resting_hr: 'Corroborator only. Illness and stress context; not a Vitality endpoint.',
  hrv_rmssd: 'Corroborator only. Read as a 7-day or longer within-person trend; felt report wins on conflict.',
  hrv_sdnn: 'Corroborator only. Read as a 7-day or longer within-person trend; felt report wins on conflict.',
  sleep_duration: 'Dial read. Sleep-duration context; not a separate Vitality score.',
  steps: 'Movement context only. Not a patient-reported outcome or causal attribution.',
  active_minutes: 'Movement context only. Not a patient-reported outcome or causal attribution.',
  vo2max: 'Fitness context only. Not a Vitality endpoint or composite input.'
};

const FELT_OUTCOME_FIELDS = [
  ['energy', 'Energy'],
  ['mood', 'Mood'],
  ['body', 'Body'],
  ['mind', 'Mind'],
  ['meaning', 'Meaning']
];

function feltOutcomeChart(label, value) {
  const y = 84 - (Number(value) / 10) * 60;
  return `<div class="vitality-single-figure" data-vitality-outcome-chart data-vitality-single-point>
    <svg viewBox="0 0 320 116" role="img" aria-label="${esc(label)} ${esc(value)} of 10, one emitted timepoint">
      <line class="chart-grid" x1="36" y1="24" x2="304" y2="24"/>
      <line class="chart-grid" x1="36" y1="54" x2="304" y2="54"/>
      <line class="chart-grid" x1="36" y1="84" x2="304" y2="84"/>
      <text class="chart-label" x="8" y="28">10</text><text class="chart-label" x="14" y="58">5</text><text class="chart-label" x="14" y="88">0</text>
      <line class="vitality-intake-guide" x1="222" y1="18" x2="222" y2="90"/>
      <circle class="chart-dot" cx="222" cy="${y}" r="5"/>
      <text class="chart-value" x="232" y="${Math.max(18, y - 8)}">${esc(displayValue(value, '0-10 self-report'))}</text>
      <text class="chart-label" x="222" y="108" text-anchor="middle">Emitted</text>
    </svg>
    <small>One emitted timepoint · No prior observations emitted</small>
  </div>`;
}

function deviceInstrumentLines(model) {
  const summary = model.patientData?.wearableSummary;
  if (!summary?.windows) return [];
  const lines = [];
  for (const [metric, label, unit] of DEVICE_INSTRUMENT_ORDER) {
    const entry = summary.windows[metric];
    if (!entry) continue;
    const densityMet = entry.density_met === true
      || entry['7d']?.density_met === true
      || entry['30d']?.density_met === true;
    if (!densityMet) continue;
    const window = entry['7d']?.density_met ? entry['7d'] : (entry['30d'] || entry['7d']);
    const formatted = formatTrendLine(window, unit);
    lines.push({ metric, label, unit, text: formatted.text, state: formatted.state, window, summary });
  }
  return lines;
}

function instrumentTemporalChart(line) {
  const points = (Array.isArray(line.window?.series_tail) ? line.window.series_tail : [])
    .flatMap((point) => {
      const rawValue = point?.value;
      if (rawValue == null || (typeof rawValue === 'string' && !rawValue.trim())) return [];
      return [{ date: String(point?.local_date ?? ''), value: Number(rawValue) }];
    })
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) return '<div class="vitality-series-missing">Repeated observations were not emitted.</div>';
  const baseline = line.window?.baseline_value == null ? Number.NaN : Number(line.window.baseline_value);
  const values = points.map((point) => point.value);
  if (Number.isFinite(baseline)) values.push(baseline);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = max === min ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.12;
  min -= pad;
  max += pad;
  const xFor = (index) => 48 + (index / Math.max(1, points.length - 1)) * 376;
  const yFor = (input) => 112 - ((input - min) / (max - min)) * 88;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${xFor(index).toFixed(1)} ${yFor(point.value).toFixed(1)}`).join(' ');
  const latest = points.at(-1);
  const baselineLine = Number.isFinite(baseline)
    ? `<line class="vitality-series-baseline" x1="48" y1="${yFor(baseline)}" x2="424" y2="${yFor(baseline)}"/><text class="chart-label" x="56" y="${yFor(baseline) - 7}">Personal baseline ${esc(displayValue(baseline, line.unit))}</text>`
    : '';
  const midpoint = (min + max) / 2;
  return `<svg class="vitality-series-chart" data-vitality-instrument-chart viewBox="0 0 460 154" role="img" aria-label="${esc(line.label)} emitted series from ${esc(points[0].date)} to ${esc(latest.date)}">
    <line class="chart-grid" x1="48" y1="24" x2="424" y2="24"/><line class="chart-grid" x1="48" y1="68" x2="424" y2="68"/><line class="chart-grid" x1="48" y1="112" x2="424" y2="112"/>
    <text class="chart-label" x="4" y="28">${esc(displayValue(max, line.unit))}</text><text class="chart-label" x="4" y="72">${esc(displayValue(midpoint, line.unit))}</text><text class="chart-label" x="4" y="116">${esc(displayValue(min, line.unit))}</text>
    ${baselineLine}<path class="vitality-series-line" d="${path}"/><circle class="vitality-series-latest" cx="${xFor(points.length - 1)}" cy="${yFor(latest.value)}" r="5"/>
    <text class="chart-label" x="48" y="144">${esc(points[0].date)}</text><text class="chart-label chart-label-end" x="424" y="144">${esc(latest.date)}</text>
  </svg>`;
}

/** Subordinate device context. It never determines or completes protocol state. */
function deviceInstrumentsPanel(model, state, note = 'Device instruments corroborate recovery and sleep; they do not replace patient-reported outcomes or determine protocol state.') {
  const lines = deviceInstrumentLines(model);
  if (!lines.length) return '';
  const preferred = lines.find((line) => line.metric === 'hrv_rmssd')
    ?? lines.find((line) => line.metric === 'hrv_sdnn')
    ?? lines[0];
  const selected = lines.find((line) => line.metric === state.selectedVitalityInstrumentId) ?? preferred;
  const hrv = lines.find((line) => line.metric === 'hrv_rmssd') ?? lines.find((line) => line.metric === 'hrv_sdnn');
  const recoveryContext = hrv ? `<section class="vitality-recovery-context" data-vitality-recovery-context>
    <div><span class="section-label">Recovery context</span><h3>${esc(hrv.label)}</h3></div>
    <div><strong>${esc(hrv.text)}</strong><small>Within-person context only · not a score</small></div>
  </section>` : '';
  const selectors = lines.map((line) => `<button type="button" class="vitality-instrument-choice ${selected.metric === line.metric ? 'selected' : ''}" data-vitality-instrument="${esc(line.metric)}" id="vitality-instrument-${esc(line.metric)}" role="radio" aria-checked="${selected.metric === line.metric}" aria-controls="vitality-instrument-detail">
    <span>${esc(line.label)}</span><strong>${esc(displayValue(line.window?.value, line.unit))}</strong><small>${esc(line.window?.window ?? 'Window not emitted')} mean</small>
  </button>`).join('');
  const coverage = `${esc(selected.window?.n_days_present ?? 'Not emitted')} days present · ${esc(selected.window?.n_days_required ?? 'Not emitted')} required`;
  const source = selected.summary?.source ? String(selected.summary.source) : 'Not emitted';
  const lineage = selected.summary?.device_lineage ? String(selected.summary.device_lineage) : 'Not emitted';
  const baseline = selected.window?.baseline_value != null && Number.isFinite(Number(selected.window.baseline_value))
    ? displayValue(selected.window.baseline_value, selected.unit)
    : 'Not emitted';
  return `
    <section class="instrument-panel device-instruments-panel" data-device-instruments>
      <div class="panel-head">
        <div><span class="section-label">Objective context</span><h2>Device instruments and dial reads</h2></div>
        <span>Emitted 7d / 30d windows · not a score</span>
      </div>
      <div class="device-instruments-body">
        <p class="wearable-instrument-note">${esc(note)}</p>
        ${recoveryContext}
        <div class="vitality-instrument-grid" role="radiogroup" aria-label="Device context instruments">${selectors}</div>
        <article class="vitality-instrument-detail" id="vitality-instrument-detail" role="region" aria-live="polite" aria-labelledby="vitality-instrument-${esc(selected.metric)}" data-vitality-instrument-detail="${esc(selected.metric)}">
          <header><div><span class="section-label">Selected instrument</span><h3>${esc(selected.label)}</h3></div><strong>${esc(selected.text)}</strong></header>
          <p class="vitality-instrument-role">${esc(DEVICE_CONTEXT_ROLE[selected.metric] ?? 'Device context only. Not a Vitality endpoint.')}</p>
          ${instrumentTemporalChart(selected)}
          <dl class="vitality-instrument-provenance">
            <div><dt>Window coverage</dt><dd>${coverage}</dd></div>
            <div><dt>Personal baseline</dt><dd>${esc(baseline)}</dd></div>
            <div><dt>As of</dt><dd>${esc(selected.window?.as_of_date ?? selected.summary?.as_of ?? 'Not emitted')}</dd></div>
            <div><dt>Source</dt><dd>${esc(source)}</dd></div>
            <div><dt>Device lineage</dt><dd>${esc(lineage)}</dd></div>
          </dl>
        </article>
      </div>
    </section>`;
}

function vitalityView(model, state) {
  const records = Array.isArray(model.vitality) ? model.vitality : [];
  if (!records.length) {
    return `<header class="screen-head"><div><h1>Vitality</h1><p>Within-person protocol state and patient-reported outcomes. No composite score.</p></div></header>${empty('Vitality output was not emitted.')}`;
  }
  const protocolRows = records.filter((row) => row.output_kind === 'protocol_state_not_score');
  const measuredRows = records.filter((row) => row.output_kind !== 'protocol_state_not_score');
  const feltOutcomes = protocolRows.flatMap((row) => FELT_OUTCOME_FIELDS.flatMap(([key, label]) => {
    const value = row.felt_state?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    const chart = value >= 0 && value <= 10
      ? feltOutcomeChart(label, value)
      : `<p class="vitality-missing"><strong>Out-of-contract value:</strong> ${esc(value)} 0-10 self-report. Expected 0-10 self-report; not plotted.</p>`;
    return [`<article class="vitality-card vitality-outcome-card" data-vitality-felt-outcome="${esc(key)}"><div class="vitality-head"><div><span class="section-label">${label}</span></div><div><strong>${esc(displayValue(value, '0-10 self-report'))}</strong><small class="vitality-unit">0-10 self-report</small></div></div>${chart}</article>`];
  })).join('');
  const protocol = protocolRows.map((row) => {
    const missing = Array.isArray(row.missing_inputs) ? row.missing_inputs : [];
    const state = row.value ?? row.state;
    const modelStatus = row.model_status && stateText(row.model_status) !== stateText(state)
      ? `<small>Method status: ${esc(stateText(row.model_status))}</small>`
      : '';
    const calls = [
      row.terminal_state ? `<div><dt>Terminal state</dt><dd>${esc(stateText(row.terminal_state))}</dd></div>` : '',
      row.dominant_lever ? `<div><dt>Dominant lever</dt><dd>${esc(stateText(row.dominant_lever))}</dd></div>` : ''
    ].filter(Boolean).join('');
    const provenance = [
      row.model_version ? `Method ${row.model_version}` : '',
      row.source ? `Source ${row.source}` : ''
    ].filter(Boolean).join(' · ');
    const boundaries = [
      row.clinical_use ? `Clinical use ${stateText(row.clinical_use)}` : '',
      row.nonclinical === true ? 'Nonclinical' : '',
      row.synthetic === true ? 'Synthetic' : ''
    ].filter(Boolean).join(' · ');
    return `<section class="vitality-protocol" data-vitality-protocol>
      <div class="vitality-protocol-head"><div><span class="section-label">Protocol state</span><h2>${esc(row.label ?? row.id)}</h2></div><div><strong>${esc(stateText(state))}</strong>${modelStatus}</div></div>
      <p class="vitality-protocol-boundary">Protocol state, not a composite score.${boundaries ? ` ${esc(boundaries)}.` : ''}</p>
      ${row.model_note ? `<p>${esc(row.model_note)}</p>` : ''}
      ${missing.length ? `<div class="vitality-requirements"><h3>Inputs still required</h3><ul>${missing.map((item) => `<li>${esc(stateText(item))}</li>`).join('')}</ul></div>` : ''}
      ${calls ? `<dl class="vitality-protocol-meta">${calls}</dl>` : ''}
      ${provenance ? `<small>${esc(provenance)}</small>` : ''}
    </section>`;
  }).join('');
  const genericOutcomes = measuredRows.map((row) => {
    const missing = Array.isArray(row.missing_inputs) && row.missing_inputs.length
      ? `<p class="vitality-missing"><strong>Inputs still required:</strong> ${row.missing_inputs.map((item) => esc(stateText(item))).join(', ')}</p>`
      : '';
    const note = row.model_note ? `<p class="vitality-note">${esc(row.model_note)}</p>` : '';
    const version = row.model_version ? `<small>Method ${esc(row.model_version)}</small>` : '';
    return `<article class="vitality-card"><div class="vitality-head"><div><span class="section-label">${esc(row.label ?? row.id)}</span><strong>${esc(displayValue(row.value, row.units, row.state))}</strong>${row.units ? `<small class="vitality-unit">${esc(String(row.units).replaceAll('_',' '))}</small>` : ''}</div><span>${esc(stateText(row.state ?? 'measured'))}</span></div>${vitalityChart(row)}${note}${missing}${version}</article>`;
  }).join('');
  const outcomes = `${feltOutcomes}${genericOutcomes}`;
  const outcomesSection = outcomes
    ? `<section class="vitality-outcomes" data-vitality-outcomes><h2>Patient-reported outcomes</h2><div class="vitality-grid">${outcomes}</div></section>`
    : '';
  const blockedBaseline = protocolRows.some((row) => (Array.isArray(row.missing_inputs) && row.missing_inputs.length) || !row.felt_state);
  const instrumentNote = blockedBaseline
    ? 'Patient-reported inputs remain required. Device instruments corroborate recovery and sleep; they do not complete the Vitality protocol.'
    : 'Device instruments corroborate recovery and sleep; they do not replace patient-reported outcomes or determine protocol state.';
  const instruments = deviceInstrumentsPanel(model, state, instrumentNote);
  return `<header class="screen-head"><div><h1>Vitality</h1><p>Felt outcomes are the ground truth. Protocol state and device context remain separate. No composite score.</p></div></header><div data-vitality-reference-stack>${protocol}${outcomesSection}${instruments}</div>`;
}

export function decisionReasonsForAction(action, taxonomy = getOverrideTaxonomy()) {
  return Array.isArray(taxonomy[action]?.reasons) ? [...taxonomy[action].reasons] : [];
}

export function decisionReasonOptionsHTML(action, selectedReason = null, taxonomy = getOverrideTaxonomy()) {
  const reasons = decisionReasonsForAction(action, taxonomy);
  const validSelected = reasons.includes(selectedReason) ? selectedReason : reasons[0];
  return reasons.map((reason) => `<option value="${esc(reason)}" ${reason === validSelected ? 'selected' : ''}>${esc(reason.replaceAll('_', ' '))}</option>`).join('');
}

function decisionForm(action, taxonomy, disabled) {
  const selectedAction = ['approve', 'defer', 'reject', 'modify'].includes(action.physician_decision) ? action.physician_decision : 'approve';
  const options = ['approve', 'defer', 'reject', 'modify'].map((key) => `<option value="${key}" ${selectedAction === key ? 'selected' : ''}>${esc(taxonomy[key].label)}</option>`).join('');
  const reasons = decisionReasonOptionsHTML(selectedAction, action.physician_reason_code, taxonomy);
  return `<form class="decision-form" data-edit-item="${esc(action.id)}">
    <label>Decision<select name="action" data-decision-action ${disabled ? 'disabled' : ''}>${options}</select></label>
    <label>Reason<select name="reason_code" data-decision-reason ${disabled ? 'disabled' : ''}>${reasons}</select></label>
    <label>Action wording<input name="value" value="${esc(action.what_to_do ?? action.action_phrase ?? '')}" ${disabled ? 'disabled' : ''}></label>
    <label>Physician rationale<input name="reason" placeholder="Required for audit" ${disabled ? 'disabled' : ''}></label>
    <button type="submit" ${disabled ? 'disabled' : ''}>Save decision</button>
    ${action.persisted_override_id ? `<small class="persisted-decision">Persisted: ${esc(stateText(selectedAction))}</small>` : ''}
  </form>`;
}

function releaseRail(model, state) {
  const workflow = model.workflow;
  const preview = state.releasePackage ?? workflow.releasePackage;
  const released = workflow.released;
  const authorized = !released && workflow.releaseState === 'authorized_not_released';
  const previewReady = !released && workflow.release.preview_ready === true && Boolean(preview);
  const reviewReady = model.analysis.readyForReview && state.reviewStarted;
  const trustBlocked = workflow.release.authorizationBlocked;
  if (released) return `<aside class="release-rail"><section class="rail-card release-closure"><span class="section-label">Release complete</span><h2>Released to patient</h2><p>Patient visible · read only</p><small>${esc(workflow.release.released_at ?? preview?.released_at ?? 'Release timestamp not emitted')}</small><details class="released-preview"><summary>View exact released preview</summary>${releasePreviewHTML(preview)}</details>${state.workflowStatus ? `<p class="status-line">${esc(state.workflowStatus)}</p>` : ''}</section></aside>`;
  const blockerText = trustBlocked ? `Authorization blocked: ${workflow.release.trustBlockers.join(', ')} not emitted.` : '';
  return `<aside class="release-rail"><section class="rail-card">
    <span class="section-label">Preview · attest · release</span>
    <h2>${trustBlocked ? 'Authorization blocked' : 'Release evidence'}</h2>
    ${blockerText ? `<p class="boundary-banner signal-hazard release-blocker">${esc(blockerText)}</p>` : ''}
    ${releasePreviewHTML(preview)}
    <ol class="release-steps"><li class="${reviewReady ? 'complete' : 'current'}"><b>1</b><span>Review</span><small>${reviewReady ? 'started' : 'required'}</small></li><li class="${previewReady ? 'complete' : ''}"><b>2</b><span>Exact preview</span><small>${previewReady ? 'ready' : 'not ready'}</small></li><li class="${authorized ? 'complete' : ''}"><b>3</b><span>Attest</span><small>${authorized ? 'authorized' : 'pending'}</small></li><li><b>4</b><span>Release</span><small>pending</small></li></ol>
    <button data-release-action="request-preview" ${reviewReady ? '' : 'disabled'}>Generate release preview</button>
    <label class="attestation"><input type="checkbox" data-physician-attestation ${reviewReady && previewReady && !trustBlocked ? '' : 'disabled'}> I attest that I reviewed this exact preview and gating evidence.</label>
    <button class="secondary" data-release-action="authorize" ${reviewReady && previewReady && !authorized && !trustBlocked ? '' : 'disabled'}>Authorize release</button>
    <button data-release-action="release-backend" ${reviewReady && authorized && !trustBlocked ? '' : 'disabled'}>Release to patient</button>
    ${state.workflowStatus ? `<p class="status-line">${esc(state.workflowStatus)}</p>` : ''}${state.workflowError ? `<p class="error-line">${esc(state.workflowError)}</p>` : ''}
  </section></aside>`;
}

function modelVersionSummary(model) {
  const versions = model.analysis?.modelVersions ?? { risk: {}, vitality: {} };
  const risk = Object.entries(versions.risk ?? {}).map(([id, version]) => `${id}: ${version}`);
  const vitality = Object.entries(versions.vitality ?? {}).map(([id, version]) => `${id}: ${version}`);
  const lines = [...risk, ...vitality];
  if (!lines.length) return '<small class="model-version-line">Model versions not emitted</small>';
  return `<details class="model-version-line" data-model-versions><summary>Model lineage</summary><p>${esc(lines.join(' · '))}</p></details>`;
}

function isCaseReleased(model) {
  return model.workflow?.released === true;
}

function analysisGate(model, state) {
  const analysis = model.analysis;
  const ready = analysis.readyForReview;
  const released = isCaseReleased(model, state);
  // When released, don't surface the false "review not started" story.
  const visibleBlockers = (released
    ? analysis.blockerCodes.filter((code) => !/review_not_started|already_released/i.test(String(code)))
    : analysis.blockerCodes
  ).map(stateText);
  const details = [...visibleBlockers, ...analysis.errors.map(stateText), ...analysis.warnings.map(stateText)];
  const headline = released ? 'Released · read only' : ready ? 'Review ready' : 'Review blocked';
  const body = released
    ? 'This case was released to the patient. Structured decisions are closed; review content remains visible for audit.'
    : ready
    ? 'Ready for physician review.'
    : (details.join(' · ') || 'readiness not ready');
  return `<section class="rail-card" data-analysis-gate>
    <span class="section-label">Analysis ${esc(stateText(analysis.status))}</span>
    <h2>${esc(headline)}</h2>
    <p class="${ready || released ? 'status-line' : 'boundary-banner signal-hazard'}">${esc(body)}</p>
    ${modelVersionSummary(model)}
    <button data-review-action="start" ${ready && !state.reviewStarted && !released ? '' : 'disabled'}>${released ? 'Released · read only' : state.reviewStarted && ready ? 'Review started' : 'Start review'}</button>
  </section>`;
}


function carePlanSource(item) {
  const source = item.source
    ?? item.provenance?.source
    ?? item.provenance?.source_scored_item_id
    ?? item.provenance_summary
    ?? null;
  if (!source) return 'Source not emitted';
  return typeof source === 'string' ? source : String(source.source ?? source);
}

function carePlanDisplayTitle(item) {
  const explicit = item.title ?? item.label;
  if (explicit) return explicit;
  const id = String(item.id ?? 'Clinical item');
  const known = {
    act_egfr_dose_review: 'Review renal medication dosing',
    act_influenza_pneumococcal_vax_ckd: 'Review influenza and pneumococcal vaccination',
  };
  return known[id] ?? stateText(id.replace(/^act_/, ''));
}

function carePlanSourceLabel(item) {
  const source = carePlanSource(item);
  const known = {
    action_library: 'Action library',
    genetic_mustdo_library: 'Genetics protocol',
    vitality_protocol: 'Vitality protocol',
    workflow_release_policy: 'Release policy',
    synthetic_e2e_nonclinical: 'Synthetic staging',
  };
  return known[source] ?? stateText(source);
}

function carePlanNoteValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return String(value.label ?? value.title ?? value.name ?? value.text ?? value.id ?? '');
}

function carePlanNoteEntryHTML(value) {
  const label = carePlanNoteValue(value);
  if (!label) return '';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `<li>${esc(label)}</li>`;
  const metadata = [value.type, value.status].filter(Boolean).map(stateText).join(' · ');
  return `<li><span>${esc(label)}</span>${metadata ? `<small>${esc(metadata)}</small>` : ''}</li>`;
}

function carePlanNoteHTML(note) {
  const draft = note && typeof note === 'object' ? note : {};
  const assessment = carePlanNoteValue(draft.assessment);
  const plan = carePlanNoteValue(draft.plan);
  const orders = (Array.isArray(draft.orders) ? draft.orders : []).filter((value) => carePlanNoteValue(value));
  const referrals = (Array.isArray(draft.referrals) ? draft.referrals : []).filter((value) => carePlanNoteValue(value));
  const patientMessage = carePlanNoteValue(draft.patient_message);
  return `<section class="care-plan-note" data-care-plan-note>
    <div><h3>Assessment</h3>${assessment ? `<p>${esc(assessment)}</p>` : '<p class="truth-empty">Assessment not emitted</p>'}</div>
    <div><h3>Plan</h3>${plan ? `<p>${esc(plan)}</p>` : '<p class="truth-empty">Plan not emitted</p>'}</div>
    ${orders.length ? `<div><h3>Draft orders</h3><ul>${orders.map(carePlanNoteEntryHTML).join('')}</ul></div>` : ''}
    ${referrals.length ? `<div><h3>Draft referrals</h3><ul>${referrals.map(carePlanNoteEntryHTML).join('')}</ul></div>` : ''}
    ${patientMessage ? `<details class="plan-disclosure" data-draft-patient-message><summary><span>Draft patient message</span><small>Draft for physician review. Not a release preview.</small></summary><p>${esc(patientMessage)}</p></details>` : ''}
  </section>`;
}

function carePlanDeferredHTML(items) {
  if (!items.length) return '';
  const rows = items.map((item) => {
    const rawSummary = item.value_summary;
    const valueSummary = rawSummary && typeof rawSummary === 'object'
      ? (rawSummary.display ?? (rawSummary.value !== undefined ? displayValue(rawSummary.value, rawSummary.units) : carePlanNoteValue(rawSummary)))
      : carePlanNoteValue(rawSummary);
    const source = item.source && typeof item.source === 'object'
      ? carePlanNoteValue(item.source.source ?? item.source)
      : carePlanNoteValue(item.source);
    const kind = carePlanNoteValue(item.kind);
    const reason = carePlanNoteValue(item.reason);
    const secondary = [kind, reason].filter(Boolean);
    const audit = [valueSummary, source].filter(Boolean);
    return `<div class="plan-audit-row"><div><strong>${esc(item.label ?? item.title ?? item.id)}</strong>${secondary.map((value) => `<small>${esc(stateText(value))}</small>`).join('')}</div>${audit.length ? `<div>${valueSummary ? `<span>${esc(valueSummary)}</span>` : ''}${source ? `<small>${esc(source)}</small>` : ''}</div>` : ''}</div>`;
  }).join('');
  return `<details class="plan-disclosure plan-audit" data-care-plan-deferred><summary><span>Deferred, not selected</span><small>${items.length} item${items.length === 1 ? '' : 's'}</small></summary>${rows}</details>`;
}

function carePlanChecksHTML(checks) {
  if (!checks.length) return '';
  const rows = checks.map((check) => {
    const status = check.status ?? (check.pass === true ? 'pass' : check.pass === false ? 'fail' : 'not emitted');
    return `<div class="plan-audit-row" data-check-status="${esc(status)}"><strong>${esc(stateText(check.label ?? check.check_id ?? check.id))}</strong><span>${esc(stateText(status))}</span></div>`;
  }).join('');
  return `<details class="plan-disclosure plan-audit" data-care-plan-checks><summary><span>Synthesis checks</span><small>${checks.length} checks</small></summary>${rows}</details>`;
}

function carePlanView(model, state) {
  const taxonomy = getOverrideTaxonomy();
  const items = [...model.carePlan.required.map((item) => ({ ...item, planKind: 'problem' })), ...model.carePlan.actions.map((item) => ({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }))];
  const selected = items.find((item) => item.id === state.selectedPlanItemId) ?? null;
  const selectButton = (item, index, prefix) => `<button type="button" class="plan-item ${selected?.id === item.id ? 'selected' : ''}" data-plan-item="${esc(item.id)}" aria-pressed="${selected?.id === item.id}"><span class="plan-item-number">${prefix}${String(index + 1).padStart(2, '0')}</span><span><strong>${esc(carePlanDisplayTitle(item))}</strong><small>${esc(item.reason ?? item.why_it_matters ?? item.why_now ?? 'Clinical rationale not emitted.')}</small><em title="${esc(carePlanSource(item))}">${esc(carePlanSourceLabel(item))}${item.persisted_override_id ? ` · persisted ${esc(stateText(item.physician_decision))}` : ''}</em></span></button>`;
  const required = model.carePlan.required.map((item, index) => selectButton({ ...item, planKind: 'problem' }, index, 'P')).join('');
  const actions = model.carePlan.actions.map((item, index) => selectButton({ ...item, planKind: item.kind === 'diagnostic' ? 'order' : 'action' }, index, '')).join('');
  const noteHTML = carePlanNoteHTML(model.carePlan.note);
  const deferredHTML = carePlanDeferredHTML(model.carePlan.deferred);
  const checksHTML = carePlanChecksHTML(model.carePlan.checks);
  const actionSpaceCount = model.actionMap.items.length;
  const comparisonCount = model.actionMap.items.filter((item) => item.plottable).length;
  const auditCount = actionSpaceCount - comparisonCount;
  const actionSpaceSummary = [
    `${comparisonCount} comparison item${comparisonCount === 1 ? '' : 's'}`,
    auditCount ? `${auditCount} adjacent audit record${auditCount === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join(' · ');
  const bridgeKeys = selected ? [selected.id, selected.candidate_id, selected.library_item_id, selected.action_library_item_id].filter(Boolean) : [];
  const bridgeItem = bridgeKeys.length
    ? model.actionMap.items.find((item) => [item.id, item.libraryItemId].filter(Boolean).some((key) => bridgeKeys.includes(key)))
    : null;
  const bridgeSelection = bridgeItem?.id ?? '';
  const actionSpaceBridge = actionSpaceCount ? `<section class="plan-space-bridge"><div><h3>Action Space</h3><p>${esc(actionSpaceSummary)}.</p></div><button type="button" class="secondary" data-open-action-space="${esc(bridgeSelection)}">Open Action Space</button></section>` : '';
  const addReasons = decisionReasonOptionsHTML('add_problem', null, taxonomy);
  const caseReleased = isCaseReleased(model, state);
  const reviewActive = model.analysis.readyForReview && state.reviewStarted && !caseReleased;
  const trace = recommendationTraceHTML(model, selected);
  const traceDisclosure = trace ? `<details class="care-trace-disclosure" data-care-plan-trace><summary>Reasoning traceback</summary>${trace}</details>` : '';
  const selectedRail = selected ? `<section class="rail-card selected-item-rail"><span class="section-label">Selected item · ${esc(selected.planKind)}</span><h2>${esc(carePlanDisplayTitle(selected))}</h2><p>${esc(selected.reason ?? selected.why_it_matters ?? selected.why_now ?? 'Clinical rationale not emitted.')}</p><small title="${esc(carePlanSource(selected))}">${esc(carePlanSourceLabel(selected))}</small>${reviewActive ? decisionForm(selected, taxonomy, false) : '<div class="truth-empty">Start review to expose structured decision controls.</div>'}</section>${traceDisclosure}` : traceDisclosure;
  return `
    <header class="screen-head"><div><h1>Care plan</h1><p>Review obligations, actions, and release readiness.</p></div></header>
    ${analysisGate(model, state)}
    <div class="care-layout"><div>
      <section class="plan-document"><div class="document-head"><div><span class="section-label">${esc(caseReleased ? 'released · read only' : stateText(model.carePlan.state))}</span><h2>${esc(model.carePlan.title)}</h2></div></div><div class="document-inputs">${esc(model.carePlan.overview)}</div><div class="plan-body"><span class="plan-section-label">Assessment &amp; Plan</span>${noteHTML}<section class="plan-problem-group"><h3>Problems and obligations</h3>${required || '<div class="truth-empty">No problems or required obligations emitted.</div>'}</section><section class="plan-action-group"><h3>Recommended actions</h3>${actions || '<div class="truth-empty">No recommended actions emitted.</div>'}</section>${deferredHTML}${checksHTML}${actionSpaceBridge}</div><footer class="document-signature">${caseReleased ? 'Released to patient · patient visible · read only' : `${esc(model.carePlan.note?.signature_status ?? 'Unsigned')} · physician decisions remain staged until backend release.`}</footer></section>
    </div><aside class="care-rail">${selectedRail}<section class="rail-card physician-add"><span class="section-label">Add physician problem or order</span><form data-add-action><label>Type<select name="action" data-decision-action ${reviewActive ? '' : 'disabled'}><option value="add_problem">Problem</option><option value="add_order">Order intent</option></select></label><label>Item<input name="value" placeholder="Physician-authored item" ${reviewActive ? '' : 'disabled'}></label><label>Reason<select name="reason_code" data-decision-reason ${reviewActive ? '' : 'disabled'}>${addReasons}</select></label><label>Rationale<input name="reason" placeholder="Required for audit" ${reviewActive ? '' : 'disabled'}></label><button type="submit" ${reviewActive ? '' : 'disabled'}>Add to review</button></form>${model.carePlan.additions.map((item) => `<small class="persisted-decision">Persisted ${esc(stateText(item.action))}: ${esc(item.patch?.title ?? item.patch?.label ?? item.patch?.what_to_do ?? item.target?.artifact_id ?? item.target?.id ?? item.override_id)}</small>`).join('')}</section>${releaseRail(model, state)}</aside></div>`;
}

function journalActor(event) {
  const actor = event?.actor;
  if (typeof actor === 'string' && actor.trim()) return actor;
  if (actor && typeof actor === 'object') {
    return actor.actor_id ?? actor.id ?? actor.role ?? event.actor_id ?? event.actor_type ?? 'Actor missing';
  }
  return event?.actor_id ?? event?.actor_type ?? 'Actor missing';
}

function journalRole(event) {
  if (typeof event?.role === 'string' && event.role.trim()) return event.role;
  const actor = event?.actor;
  if (actor && typeof actor === 'object' && actor.role) return actor.role;
  return event?.actor_type ?? 'Role missing';
}

function journalTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? 'Timestamp missing');
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

function journalView(model) {
  const integrity = model.workflow.auditIntegrity;
  const integrityErrors = Array.isArray(integrity?.errors) ? integrity.errors : [];
  const renderedRows = model.journal.map((event) => {
    const timestamp = event.timestamp ?? event.timestamp_utc ?? event.created_at;
    const before = event.previous_state ?? event.state_before;
    const after = event.next_state ?? event.state_after;
    const eventId = event.event_id ?? event.id;
    const valid = timestamp && before && after && eventId && before !== 'unknown' && after !== 'unknown';
    if (!valid) return `<article class="journal-entry journal-entry-error"><div class="timeline-node"></div><div><span class="journal-hazard-tile">Audit integrity error</span><h2>${esc(humanizeEventName(event.event_name ?? event.event_type ?? event.event))}</h2><p>Required chronology fields are missing.</p><small>${esc(eventId ?? 'Event ID missing')}</small></div></article>`;
    return `<article class="journal-entry"><div class="timeline-node"></div><div><span>${esc(journalTimestamp(timestamp))}</span><h2>${esc(humanizeEventName(event.event_name ?? event.event_type ?? event.event))}</h2><p>${esc(stateText(before))} → ${esc(stateText(after))}</p><details class="journal-meta"><summary>Audit details</summary><small>${esc(journalActor(event))} · ${esc(journalRole(event))} · ${esc(eventId)}</small></details></div></article>`;
  });
  const recentLimit = 18;
  const recentRows = renderedRows.slice(-recentLimit).reverse().join('');
  const olderRows = renderedRows.slice(0, -recentLimit).reverse().join('');
  const olderCount = Math.max(0, renderedRows.length - recentLimit);
  const olderDisclosure = olderCount
    ? `<details class="journal-archive"><summary><span>Earlier events</span><small>${olderCount} events</small></summary><section class="journal-list">${olderRows}</section></details>`
    : '';
  const errorSummary = integrityErrors.length
    ? `${integrityErrors.length} validation failures require review.`
    : 'Audit integrity failed without emitted validation details.';
  const errorDisclosure = integrityErrors.length
    ? `<details><summary>Review validation details</summary><ul>${integrityErrors.map((error) => `<li>${esc(error)}</li>`).join('')}</ul></details>`
    : '';
  const banner = integrity?.status === 'pass' ? '' : `<section class="audit-integrity boundary-banner signal-hazard"><h2>Audit integrity error</h2><p>${esc(errorSummary)}</p>${errorDisclosure}</section>`;
  return `<header class="screen-head"><div><h1>Journal</h1><p>Audit trail, most recent first.</p></div></header>${banner}<section class="journal-list">${recentRows || empty('No journal events recorded.')}</section>${olderDisclosure}`;
}

function aiView(state) {
  return aiColleagueView(state.aiWorkspace);
}

function activeView(model, state) {
  if (state.activeTab === 'risk') return modelsView(model, state);
  if (state.activeTab === 'screening') return screeningView(state);
  // 'vitality' is deliberately unrouted for V1; a stale persisted tab value falls
  // through to patient data rather than rendering an unreachable surface.
  if (state.activeTab === 'care-plan') return carePlanView(model, state);
  if (state.activeTab === 'journal') return journalView(model);
  if (state.activeTab === 'aleron-ai') return aiView(state);
  return patientDataView(model);
}

export function queueOptionLabel(task) {
  const name = String(task?.display_name ?? '').trim();
  const patientId = String(task?.patient_id ?? '').trim();
  const shortId = patientId ? patientId.replace(/^member_/, '').slice(0, 8) : '';
  const lifecycle = String(task?.lifecycle_state ?? '').trim().replaceAll('_', ' ');
  const when = String(task?.last_event_at ?? '').trim();
  const day = when ? when.slice(0, 10) : '';
  const base = name || patientId || 'Unknown patient';
  // Email-only display names collide when the same address has multiple member rows.
  const parts = [base];
  if (shortId) parts.push(shortId);
  if (lifecycle) parts.push(lifecycle);
  if (day) parts.push(day);
  return parts.join(' · ');
}

function patientInitials(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '--';
  if (raw.includes('@')) {
    const local = raw.split('@')[0] || raw;
    return local.slice(0, 2).toUpperCase();
  }
  return raw.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '--';
}

export function renderEmptyStaging(app) {
  app.innerHTML = `<main class="login-shell"><section class="login-card empty-staging-card"><div class="brand">aleron<span>MD</span></div><span class="section-label">STAGING · NONCLINICAL</span><h1>No patient cases yet.</h1><p>Complete mobile onboarding to create the first staging case. It will appear here automatically when its packet and analysis are ready for physician review.</p><button type="button" data-refresh-empty>Refresh cases</button></section></main>`;
}

export function renderDashboard(app, state, model) {
  const initials = patientInitials(model.patient.name);
  const options = state.queue.map((task) => `<option value="${esc(task.patient_id)}" ${task.patient_id === state.activePatientId ? 'selected' : ''}>${esc(queueOptionLabel(task))}</option>`).join('');
  const nav = TAB_LABELS.map(([id, label]) => `<button data-tab="${id}" class="nav-item ${state.activeTab === id ? 'on' : ''}" aria-selected="${state.activeTab === id}">${icon(id)}${label}</button>`).join('');
  app.innerHTML = `<main class="dashboard-shell">
    <aside class="sidebar" aria-label="Dashboard sections"><div class="brand">aleron<span>MD</span></div><div class="case-picker"><div class="avatar">${esc(initials)}</div><div><select data-case-selector aria-label="Patient case">${options}</select><small>${model.patient.code ? `${esc(model.patient.code)} · ` : ''}${esc(displayValue(model.patient.age, 'years'))}</small></div></div><div class="rule"></div><nav role="tablist" aria-label="Dashboard sections">${nav}</nav></aside>
    <section class="main-pane">${activeView(model, state)}</section>
  </main>`;
}
