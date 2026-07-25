import { buildWearableSummaryFromPacket, formatTrendLine } from './wearableSummary.js?v=physician-ai-colleague-v1';
import { buildCurrencyOfTruth, resolveRiskSource, pagesUrl } from './canonicalSources.js';
import { formatClinicalNumber } from './clinicalValueFormat.js?v=physician-ai-colleague-v1';
import { normalizeActionSpace } from './actionSpaceModel.js?v=physician-ai-colleague-v1';

function array(value) {
  return Array.isArray(value) ? value : [];
}

const MEASUREMENT_LABELS = {
  systolic_bp: 'Systolic blood pressure',
  diastolic_bp: 'Diastolic blood pressure',
  blood_pressure: 'Blood pressure',
  systolic_blood_pressure: 'Systolic blood pressure',
  diastolic_blood_pressure: 'Diastolic blood pressure',
  // Wearable / vitality device metrics (schema keys + clinical_key_registry aliases)
  resting_hr: 'Resting heart rate',
  resting_heart_rate: 'Resting heart rate',
  rhr: 'Resting heart rate',
  daytime_resting_hr: 'Daytime resting heart rate',
  overnight_resting_hr: 'Overnight resting heart rate',
  overnight_resting_heart_rate: 'Overnight resting heart rate',
  overnight_spo2_nadir: 'Overnight SpO₂ nadir',
  overnight_spo2: 'Overnight SpO₂ nadir',
  spo2_nadir: 'Overnight SpO₂ nadir',
  overnight_spo2_mean: 'Overnight SpO₂ mean',
  spo2_mean: 'Overnight SpO₂ mean',
  overnight_odi: 'Oxygen desaturation index',
  odi: 'Oxygen desaturation index',
  sleep_duration: 'Sleep duration',
  sleep_hours: 'Sleep duration',
  total_sleep_time: 'Sleep duration',
  tst: 'Sleep duration',
  sleep_efficiency: 'Sleep efficiency',
  hrv: 'Heart-rate variability',
  hrv_rmssd: 'HRV (rMSSD)',
  rmssd: 'HRV (rMSSD)',
  hba1c: 'HbA1c',
  a1c: 'HbA1c',
  fasting_glucose: 'Fasting glucose',
  fasting_insulin: 'Fasting insulin',
  homa_ir: 'HOMA-IR',
  fib4: 'FIB-4',
  total_cholesterol: 'Total cholesterol',
  ldl: 'LDL-C',
  ldl_c: 'LDL-C',
  hdl: 'HDL-C',
  hdl_c: 'HDL-C',
  triglycerides: 'Triglycerides',
  apob: 'ApoB',
  apo_b: 'ApoB',
  lp_a: 'Lp(a)',
  lpa: 'Lp(a)',
  hscrp: 'hs-CRP',
  hs_crp: 'hs-CRP',
  egfr: 'eGFR (creatinine)',
  egfr_cystatin_c: 'eGFR (cystatin C)',
  uacr: 'UACR',
  uacr_prior: 'Prior UACR',
  creatinine: 'Creatinine',
  cystatin_c: 'Cystatin C',
  height: 'Height',
  height_cm: 'Height',
  weight: 'Weight',
  weight_kg: 'Weight',
  bmi: 'BMI',
  body_fat: 'Body fat',
  body_fat_percent: 'Body fat',
  waist: 'Waist circumference',
  waist_cm: 'Waist circumference',
  waist_to_height_ratio: 'Waist-to-height ratio',
  vo2max: 'VO₂ max',
  vo2_max: 'VO₂ max',
  crf_percentile: 'Cardiorespiratory fitness percentile',
  cardiorespiratory_fitness: 'Cardiorespiratory fitness',
  activity: 'Activity',
  activity_level: 'Activity level',
  steps: 'Steps',
  daily_steps: 'Steps',
  step_count: 'Steps',
  active_minutes: 'Active minutes',
  activity_minutes: 'Active minutes',
  strength: 'Strength',
  ptau217_uln_ratio: 'p-tau217 (×ULN)',
  nfl_percentile: 'NfL percentile',
  psa: 'PSA',
  smoking: 'Smoking status',
  smoking_status: 'Smoking status',
  alcohol: 'Alcohol use',
  alcohol_use: 'Alcohol use',
  genetics: 'Genetics',
  genetic_status: 'Genetics',
  anti_obesity_rx: 'Anti-obesity medication',
  medications: 'Medications',
};

export function humanLabel(key, fallback) {
  const raw = String(key ?? '').trim();
  if (!raw) return fallback ?? 'Measurement';
  if (MEASUREMENT_LABELS[raw]) return MEASUREMENT_LABELS[raw];
  const lower = raw.toLowerCase();
  if (MEASUREMENT_LABELS[lower]) return MEASUREMENT_LABELS[lower];
  // Already humanized sentence / title case without underscores
  if (!raw.includes('_') && /[a-z]/.test(raw) && /[A-Z ]/.test(raw)) return raw;
  return raw
    .replaceAll('_', ' ')
    .replace(/\bptau217\b/i, 'p-tau217')
    .replace(/\bhba1c\b/i, 'HbA1c')
    .replace(/\begfr\b/i, 'eGFR')
    .replace(/\bldl\b/i, 'LDL')
    .replace(/\bhdl\b/i, 'HDL')
    .replace(/\bpsa\b/i, 'PSA')
    .replace(/\bbmi\b/i, 'BMI')
    .replace(/\s+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

const PATIENT_DATA_PRESENTATION_GROUPS = [
  // Clinic BP stays here; device sleep/RHR/SpO2/HRV live under Wearables.
  { id: 'blood-pressure-sleep', label: 'Blood Pressure & Sleep', keys: ['blood_pressure', 'systolic_blood_pressure', 'diastolic_blood_pressure', 'systolic_bp', 'diastolic_bp'] },
  {
    id: 'wearables',
    label: 'Wearables',
    keys: [
      'resting_hr',
      'resting_heart_rate',
      'rhr',
      'daytime_resting_hr',
      'overnight_resting_hr',
      'overnight_resting_heart_rate',
      'sleep_duration',
      'sleep_hours',
      'sleep_efficiency',
      'overnight_spo2_nadir',
      'overnight_spo2',
      'spo2_nadir',
      'overnight_spo2_mean',
      'spo2_mean',
      'overnight_odi',
      'odi',
      'hrv',
      'hrv_rmssd',
      'rmssd',
      'steps',
      'daily_steps',
      'step_count',
      'active_minutes',
      'activity_minutes',
      'vo2max',
      'vo2_max',
      'crf_percentile',
      'cardiorespiratory_fitness'
    ]
  },
  { id: 'metabolic', label: 'Metabolic', keys: ['hba1c', 'a1c', 'fasting_glucose', 'fasting_insulin', 'homa_ir', 'fib4'] },
  { id: 'lipids-inflammation', label: 'Lipids & Inflammation', keys: ['total_cholesterol', 'ldl', 'ldl_c', 'hdl', 'hdl_c', 'triglycerides', 'apob', 'apo_b', 'lpa', 'lp_a', 'hscrp', 'hs_crp'] },
  { id: 'renal', label: 'Renal', keys: ['egfr', 'egfr_cystatin_c', 'uacr', 'uacr_prior', 'creatinine', 'cystatin_c'] },
  { id: 'body', label: 'Body', keys: ['height', 'height_cm', 'weight', 'weight_kg', 'bmi', 'body_fat', 'body_fat_percent', 'waist', 'waist_cm', 'waist_to_height_ratio'] },
  // Non-device fitness context (device VO2/CRF/steps are under Wearables).
  { id: 'fitness', label: 'Fitness', keys: ['activity', 'activity_level', 'strength'] },
  { id: 'neuro-biomarkers', label: 'Neuro Biomarkers', keys: ['ptau217_uln_ratio', 'nfl_percentile'] },
  { id: 'cancer-screening', label: 'Cancer Screening', keys: ['psa'] },
  { id: 'context', label: 'Context', keys: ['smoking', 'smoking_status', 'alcohol', 'alcohol_use', 'genetics', 'genetic_status', 'anti_obesity_rx', 'medications'] }
];

function presentationGroups(rows) {
  const byKey = new Map(PATIENT_DATA_PRESENTATION_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.id])));
  const grouped = new Map(PATIENT_DATA_PRESENTATION_GROUPS.map((group) => [group.id, []]));
  const uncategorized = [];
  for (const row of rows) {
    const normalizedKey = String(row.key ?? '').trim().toLowerCase();
    const groupId = byKey.get(normalizedKey);
    if (groupId) grouped.get(groupId).push(row);
    else uncategorized.push(row);
  }
  return {
    groups: PATIENT_DATA_PRESENTATION_GROUPS.map(({ id, label }) => ({ id, label, measurements: grouped.get(id) })),
    uncategorized
  };
}

function overrideRecord(value) {
  const payload = value?.payload ?? value?.structured_override;
  if (!payload) return value ?? {};
  return {
    ...payload,
    override_id: payload.override_id ?? value.override_id ?? null,
    created_at: payload.created_at ?? value.created_at ?? null
  };
}

function overrideTargetId(value) {
  const override = overrideRecord(value);
  return override.target?.artifact_id ?? override.target?.id ?? override.target_id ?? override.item_id ?? null;
}

function latestOverrides(values) {
  const latest = new Map();
  for (const value of array(values)) {
    const override = overrideRecord(value);
    const targetId = overrideTargetId(override);
    if (targetId) latest.set(targetId, override);
  }
  return latest;
}

function applyOverride(action, override) {
  if (!override) return action;
  const patch = override.patch ?? override.details ?? {};
  const field = patch.field ?? override.field;
  const value = patch.value ?? override.value;
  const wording = override.action === 'modify' && field === 'action_phrase' && value ? value : null;
  const namedPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ['title', 'action_phrase', 'what_to_do', 'why_it_matters', 'status'].includes(key)));
  return {
    ...action,
    ...namedPatch,
    ...(wording ? { action_phrase: wording, what_to_do: wording } : {}),
    physician_decision: override.action,
    physician_reason_code: override.reason_code ?? patch.reason_code ?? null,
    physician_reason: typeof override.reason === 'string' ? override.reason : override.reason?.note ?? null,
    persisted_override_id: override.override_id ?? null
  };
}

export function releaseIdentifier(release) {
  return release?.release_id ?? null;
}

export function currentArtifactLineage(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const run = caseBundle?.engine_run ?? caseBundle?.analytical_run ?? {};
  const actionMap = caseBundle?.action_map_state ?? {};
  const plan = caseBundle?.clinical_plan ?? {};
  return {
    packet_id: packet.packet_id ?? null,
    packet_hash: packet.packet_hash ?? run.patient_packet_hash ?? null,
    source_engine_run_id: run.run_id ?? plan.source_engine_run_id ?? actionMap.source_engine_run_id ?? null,
    source_action_map_state_id: actionMap.action_map_state_id ?? plan.source_action_map_state ?? null,
    source_plan_id: plan.plan_id ?? null
  };
}

export function artifactBindsCurrentLineage(caseBundle, artifact) {
  if (!artifact || typeof artifact !== 'object') return false;
  const lineage = currentArtifactLineage(caseBundle);
  const aliases = {
    packet_id: ['packet_id', 'source_packet_id'], packet_hash: ['packet_hash', 'source_packet_hash'],
    source_engine_run_id: ['source_engine_run_id', 'run_id', 'analytical_run_id'],
    source_action_map_state_id: ['source_action_map_state_id', 'source_action_map_id', 'action_map_state_id'],
    source_plan_id: ['source_plan_id', 'plan_id']
  };
  return Object.entries(aliases).every(([key, fields]) => {
    const expected = lineage[key];
    if (!expected) return false;
    return fields.map((field) => artifact[field]).find(Boolean) === expected;
  });
}

export function buildReleasePreviewRequest(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const run = caseBundle?.engine_run ?? {};
  const actionMap = caseBundle?.action_map_state ?? {};
  const plan = caseBundle?.clinical_plan ?? {};
  const overrides = array(caseBundle?.structured_overrides).map(overrideRecord);
  const requiredIds = new Set(array(plan.required_items).map((item) => String(item.id ?? '')).filter(Boolean));
  const addressedRequiredItemIds = [];
  for (const override of latestOverrides(overrides).values()) {
    const targetId = String(overrideTargetId(override) ?? '');
    if (requiredIds.has(targetId) && ['approve', 'defer', 'reject', 'modify'].includes(override.action)) addressedRequiredItemIds.push(targetId);
  }
  const payload = {
    packet_id: packet.packet_id,
    packet_hash: packet.packet_hash ?? run.patient_packet_hash ?? actionMap.patient_packet_hash,
    source_engine_run_id: run.run_id ?? plan.source_engine_run_id ?? actionMap.source_engine_run_id ?? actionMap.run_id,
    source_plan_id: plan.plan_id,
    source_action_map_state_id: actionMap.action_map_state_id ?? plan.source_action_map_state,
    addressed_required_item_ids: addressedRequiredItemIds
  };
  const missing = Object.entries(payload).filter(([key, value]) => key !== 'addressed_required_item_ids' && !value).map(([key]) => key);
  if (missing.length) throw new Error(`Release preview requires current backend artifact guards: ${missing.join(', ')}.`);
  const messageRef = caseBundle?.persisted_physician_message_ref ?? caseBundle?.physician_message_ref ?? plan.persisted_physician_message_ref;
  if (messageRef) payload.physician_message_ref = messageRef;
  return payload;
}

/**
 * @param {*} value
 * @param {*} units
 * @param {*} state
 * @param {{ modelNote?: string|null }} [context] optional clinical note for richer blocked labels
 */
export function displayValue(value, units, state, context = {}) {
  const normalized = String(state ?? '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'not_measured') return 'Not measured';
  if (normalized === 'insufficient_input' || normalized === 'insufficient_inputs') return 'Insufficient input';
  // KFRE and other blocked calculators emit not_applicable* states — never append units.
  if (normalized.includes('not_applicable') || normalized === 'na_outside_validated_population') {
    return notApplicableLabel(value, context.modelNote ?? context.note);
  }
  if (normalized === 'blocked') return 'Blocked';
  if (typeof value === 'string' && /not applicable/i.test(value)) {
    return notApplicableLabel(value, context.modelNote ?? context.note);
  }
  // Null value with note/state that still signals KFRE outside validated population.
  if ((value === null || value === undefined || value === '') && context.modelNote && /not applicable|outside validated|egfr\s*<\s*60/i.test(String(context.modelNote))) {
    return notApplicableLabel(value, context.modelNote);
  }
  if (value === null || value === undefined || value === '') return 'Missing';
  const formattedValue = formatClinicalNumber(value, units);
  if (formattedValue === 'Missing') return 'Missing';
  // Protocol states / categorical values should not append unit ranges (e.g. "0-10 score").
  if (typeof value === 'string' && /[a-z_]/i.test(value) && !/^[-+]?\d/.test(value.trim())) {
    return String(value).replaceAll('_', ' ');
  }
  if (units == null || units === '') return String(formattedValue);
  const unitText = String(units);
  // Range-like units belong on a secondary line, not glued to the primary value.
  if (/^\s*\d+\s*[-–to]+\s*\d+/i.test(unitText) || /\b0\s*[-–]\s*10\b/i.test(unitText)) {
    return String(formattedValue);
  }
  if (unitText === '%' || unitText === '％') return `${formattedValue}%`;
  return `${formattedValue} ${unitText}`;
}

/** Honest blocked-calculator label; qualify with eGFR when the model note says so. */
function notApplicableLabel(value, modelNote) {
  if (typeof value === 'string' && /egfr/i.test(value) && /not applicable/i.test(value)) {
    return value.replace(/\s+/g, ' ').trim();
  }
  const note = String(modelNote ?? '');
  if (/egfr\s*<\s*60|egfr\s*≥\s*60|egfr\s*>=\s*60|stages?\s*g3a/i.test(note)) {
    return 'Not applicable (eGFR ≥ 60)';
  }
  return 'Not applicable';
}

/** Prefer the first non-empty array. Empty arrays must not block analytical_run fallbacks. */
function firstNonEmptyArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function riskRecord(value) {
  const row = value ?? {};
  const state = row.state ?? row.calculation_state ?? null;
  const label = row.label ?? row.name ?? row.id ?? null;
  let modelNote = row.model_note ?? row.route_note ?? null;
  // Surface model family from the label when the note is generic (e.g. PREVENT staging note).
  if (label && modelNote && !String(modelNote).toLowerCase().includes(String(label).split(/[\s/]+/)[0].toLowerCase())) {
    const family = String(label).match(/PREVENT|FINDRISC|KFRE|CAIDE|cancer/i)?.[0];
    if (family && !String(modelNote).toLowerCase().includes(family.toLowerCase())) {
      modelNote = `${family}: ${modelNote}`;
    }
  }
  return {
    ...row,
    label,
    state,
    model_note: modelNote,
    model_version: row.model_version ?? null,
  };
}

function analysisStatusModelVersions(caseBundle, analyticalRun, risk, vitality) {
  const fromStatus = caseBundle?.analysis_status?.model_versions;
  const fromRun = analyticalRun?.model_versions;
  const riskMap = { ...(fromRun?.risk ?? {}), ...(fromStatus?.risk ?? {}) };
  const vitalityMap = { ...(fromRun?.vitality ?? {}), ...(fromStatus?.vitality ?? {}) };
  for (const row of risk) {
    if (row?.id && row?.model_version && !riskMap[row.id]) riskMap[row.id] = row.model_version;
  }
  for (const row of vitality) {
    if (row?.id && row?.model_version && !vitalityMap[row.id]) vitalityMap[row.id] = row.model_version;
  }
  return { risk: riskMap, vitality: vitalityMap };
}

function identity(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const demographics = packet.demographics ?? {};
  const projection = caseBundle?.patient ?? {};
  const actionPatient = caseBundle?.action_map_state?.patient ?? {};
  return {
    id: packet.patient_id ?? projection.patient_id ?? caseBundle?.patient_id ?? null,
    name: packet.display_name ?? packet.name ?? projection.display_name ?? projection.name ?? actionPatient.display_name ?? 'Patient identity missing',
    code: packet.code ?? projection.code ?? actionPatient.code ?? packet.external_id ?? (String(packet.patient_id ?? '').startsWith('e2e_') ? 'Synthetic staging' : null),
    age: packet.age?.value ?? packet.age ?? demographics.age ?? actionPatient.age ?? null,
    sex: packet.sex ?? demographics.sex_at_birth ?? actionPatient.sex ?? null,
    phenotype: packet.phenotype ?? actionPatient.phenotype ?? null,
    snapshotDate: packet.snapshot_date ?? projection.updated_at ?? null
  };
}

function patientContext(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const clinicalContext = packet.clinical_context ?? {};
  const sections = packet.structured_intake?.sections ?? {};
  const symptomNarrative = sections.symptomatology?.data?.member_narrative;
  const symptoms = array(packet.symptoms);
  if (typeof symptomNarrative === 'string' && symptomNarrative.trim()) symptoms.push(symptomNarrative.trim());
  const genetics = packet.genetics ?? {};
  const geneticFindings = array(genetics.findings).map((finding) => ({
    ...finding,
    source: finding.source ?? genetics.panel ?? 'patient packet genetics'
  }));
  if (genetics.apoe_genotype) {
    geneticFindings.unshift({ gene: 'APOE', genotype: genetics.apoe_genotype, classification: 'reported genotype', source: genetics.panel ?? 'patient packet genetics' });
  }
  return {
    familyHistory: array(packet.family_history ?? clinicalContext.family_history),
    symptoms: [...new Set(symptoms)],
    genetics: geneticFindings,
    clinicalContext
  };
}

function normalizeMeasurement(row, key, lane) {
  const value = row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row };
  const resolvedKey = value.key ?? value.id ?? value.code ?? key;
  const providedLabel = value.label ?? value.name;
  const looksRaw = !providedLabel || providedLabel === resolvedKey || String(providedLabel).includes('_');
  // Backend packets often use status; UI honesty paths read state.
  const state = value.state ?? value.status ?? value.calculation_state ?? null;
  return {
    ...value,
    key: resolvedKey,
    label: looksRaw ? humanLabel(resolvedKey, providedLabel) : providedLabel,
    value: value.value,
    units: value.units ?? value.unit ?? null,
    provenance: value.provenance ?? value.source ?? null,
    state,
    lane
  };
}

function flattenMeasurementLanes(value) {
  if (Array.isArray(value)) return value.map((row, index) => normalizeMeasurement(row, row?.key ?? String(index), row?.lane ?? 'legacy'));
  if (!value || typeof value !== 'object') return [];
  const rows = [];
  const visit = (node, lane, path = []) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, lane, [...path, String(index)]));
      return;
    }
    if (!node || typeof node !== 'object') {
      rows.push(normalizeMeasurement(node, path.at(-1), lane));
      return;
    }
    const isMeasurement = 'value' in node || 'key' in node || 'id' in node || 'code' in node;
    if (isMeasurement) {
      rows.push(normalizeMeasurement(node, path.at(-1), lane));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (['sync', 'series', 'history', 'daily', 'summary'].includes(key)) continue;
      visit(child, lane ?? key, [...path, key]);
    }
  };
  for (const [lane, laneValue] of Object.entries(value)) {
    // History/trend containers are not scalar clinical measurements.
    if (lane === 'sync' || lane === 'series' || lane === 'history' || lane === 'daily' || lane === 'summary') continue;
    visit(laneValue, lane, []);
  }
  return rows;
}

/** Canonical resting-HR family keys for cross-lane dedupe. */
const RESTING_HR_KEYS = new Set([
  'resting_hr',
  'resting_heart_rate',
  'rhr',
  'daytime_resting_hr',
  'overnight_resting_hr',
  'overnight_resting_heart_rate',
]);

function restingHrFamilyKey(key) {
  const normalized = String(key ?? '').trim().toLowerCase();
  if (!RESTING_HR_KEYS.has(normalized)) return null;
  // Collapse aliases to one presentation key so vitals+wearables don't double-render.
  if (normalized === 'overnight_resting_hr' || normalized === 'overnight_resting_heart_rate') {
    return 'overnight_resting_hr';
  }
  if (normalized === 'daytime_resting_hr') return 'daytime_resting_hr';
  return 'resting_hr';
}

/**
 * Prefer wearables.resting_hr over vitals.resting_hr when both lanes emit the same metric.
 * Drop the vitals duplicate when values/sources match, or always prefer wearables for the family key.
 */
function dedupeRestingHrAcrossLanes(rows) {
  const wearablesByFamily = new Map();
  for (const row of rows) {
    if (row.lane !== 'wearables') continue;
    const family = restingHrFamilyKey(row.key);
    if (family) wearablesByFamily.set(family, row);
  }
  if (!wearablesByFamily.size) return rows;

  return rows.filter((row) => {
    if (row.lane === 'wearables') return true;
    const family = restingHrFamilyKey(row.key);
    if (!family) return true;
    const wearable = wearablesByFamily.get(family);
    if (!wearable) return true;
    // Prefer wearables: drop vitals (or other lane) resting_hr when wearables already has it.
    // Explicit path for identical value/source still drops; different values also drop to avoid dual rows.
    return false;
  });
}

function measurements(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const direct = flattenMeasurementLanes(packet.measurements);
  const observations = array(caseBundle?.diagnostic_results).flatMap((result) => array(result?.observations).map((observation) => ({
    key: observation.code,
    label: observation.name ?? observation.code,
    value: observation.value,
    units: observation.unit,
    provenance: observation.provenance?.source ?? result.vendor,
    state: observation.state
  })));
  const directKeys = new Set(direct.map((row) => row.key ?? row.label));
  const seen = new Set();
  const rows = [...direct, ...observations.filter((row) => !directKeys.has(row.key ?? row.label))].filter((row) => {
    const key = `${row.lane ?? 'diagnostic'}:${row.key ?? row.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return attachWearableTrends(dedupeRestingHrAcrossLanes(rows), packet);
}

const TREND_KEY_ALIASES = {
  resting_hr: ['resting_hr', 'resting_heart_rate', 'rhr'],
  hrv_rmssd: ['hrv_rmssd', 'hrv', 'rmssd'],
  hrv_sdnn: ['hrv_sdnn'],
  sleep_duration: ['sleep_duration', 'sleep_hours'],
  steps: ['steps', 'daily_steps', 'step_count'],
  active_minutes: ['active_minutes', 'activity_minutes'],
  vo2max: ['vo2max', 'vo2_max']
};

function summaryMetricForKey(key) {
  const normalized = String(key ?? '').trim().toLowerCase();
  for (const [metric, aliases] of Object.entries(TREND_KEY_ALIASES)) {
    if (aliases.includes(normalized) || metric === normalized) return metric;
  }
  return null;
}

function attachWearableTrends(rows, packet) {
  const wearables = packet?.measurements?.wearables ?? {};
  const summary = buildWearableSummaryFromPacket(wearables, packet?.snapshot_date);
  if (!summary?.windows) {
    return rows.map((row) => {
      if (row.lane !== 'wearables') return row;
      return {
        ...row,
        trend_state: 'snapshot_only',
        trend_line: 'Single snapshot. No multi-day series yet.',
        sparkline: null
      };
    });
  }

  return rows.map((row) => {
    const metric = summaryMetricForKey(row.key);
    if (metric === 'vo2max') {
      return {
        ...row,
        trend_state: 'snapshot_only',
        trend_line: 'Latest sample only. Prior sample comparison was not emitted.',
        sparkline: null
      };
    }
    if (!metric || !summary.windows[metric]) {
      if (row.lane === 'wearables') {
        return {
          ...row,
          trend_state: 'snapshot_only',
          trend_line: 'Single snapshot. No multi-day series yet.',
          sparkline: null
        };
      }
      return row;
    }
    const window = summary.windows[metric]['7d'] || summary.windows[metric]['30d'];
    const formatted = formatTrendLine(window, row.units || '');
    const tail = window?.series_tail || [];
    return {
      ...row,
      trend_state: formatted.state,
      trend_line: formatted.text,
      sparkline: tail.map((p) => p.value),
      window_summary: window,
      wearable_summary_as_of: summary.as_of
    };
  });
}

function vitalityRecord(value) {
  const row = value ?? {};
  if (row.output_kind !== 'protocol_state_not_score') return row;
  const state = row.calculation_state ?? row.model_status ?? 'insufficient_data';
  return {
    ...row,
    label: row.label ?? 'Vitality improvement method',
    value: state,
    units: null,
    state: row.model_status ?? state,
    model_note: row.model_note ?? (row.score === null
      ? 'Protocol state only. No aggregate vitality score was calculated.'
      : 'Invalid vitality artifact: protocol outputs cannot contain a score.')
  };
}

const TRUST_CRITICAL_RELEASE_FIELDS = [
  ['required_item_dispositions_complete', 'required-item dispositions'],
  ['provenance_complete', 'provenance'],
  ['patient_safe_boundary_emitted', 'patient-safe boundary'],
  ['lineage_complete', 'lineage']
];

function normalizeWorkflow(caseBundle, currentReleasePreview, auditEvents = []) {
  // `workflow` is the deployed patient-api field. The aliases keep older contract
  // fixtures readable without allowing review history to become lifecycle truth.
  const projection = caseBundle.workflow ?? caseBundle.workflow_projection ?? caseBundle.physician_workflow ?? null;
  const releasePackage = currentReleasePreview ?? projection?.release_package ?? null;
  const nestedRelease = projection?.release ?? {};
  const patientVisible = projection?.patient_visible === true
    || projection?.patient_visibility === 'visible'
    || nestedRelease.patient_visible === true;
  const explicitReleased = projection?.release_state === 'released_to_patient'
    && patientVisible
    && projection?.read_only !== false;
  const lineageKeys = ['packet_id', 'packet_hash', 'source_engine_run_id', 'source_action_map_state_id', 'source_plan_id'];
  const boundary = releasePackage?.patient_safe_boundary ?? releasePackage?.clinical_patient_boundary ?? null;
  const boundaryComplete = Boolean(
    (boundary?.projection === 'patient_safe_only' && boundary?.raw_internal_artifacts === false)
    || (boundary?.patient_safe === true
      && array(boundary.visible_content).includes('doctor_message')
      && array(boundary.visible_content).includes('visible_actions'))
  );
  const release = {
    ...nestedRelease,
    preview_ready: nestedRelease.preview_ready ?? projection?.preview_ready ?? Boolean(releasePackage?.preview_hash),
    authorization_ready: nestedRelease.authorization_ready ?? projection?.authorized ?? false,
    patient_visible: patientVisible,
    released_at: nestedRelease.released_at ?? releasePackage?.released_at ?? null,
    required_item_dispositions_complete: nestedRelease.required_item_dispositions_complete
      ?? (array(releasePackage?.required_item_dispositions).length > 0),
    provenance_complete: nestedRelease.provenance_complete
      ?? Boolean(releasePackage?.provenance && typeof releasePackage.provenance === 'object'),
    patient_safe_boundary_emitted: nestedRelease.patient_safe_boundary_emitted ?? boundaryComplete,
    lineage_complete: nestedRelease.lineage_complete
      ?? lineageKeys.every((key) => Boolean(releasePackage?.[key] ?? releasePackage?.source_lineage?.[key]))
  };
  const trustBlockers = TRUST_CRITICAL_RELEASE_FIELDS
    .filter(([field]) => release[field] !== true)
    .map(([, label]) => label);
  const lifecycleState = projection?.lifecycle_state ?? projection?.state ?? 'workflow_projection_missing';
  const operationalCopy = explicitReleased
    ? { whyNow: 'The patient-facing plan has been released and requires handoff verification.', next: { label: 'Verify patient receipt', detail: 'Confirm patient visibility and review the immutable audit trail.' } }
    : projection?.release_state === 'authorized_not_released'
      ? { whyNow: 'The exact preview is authorized but has not been released to the patient.', next: { label: 'Release to patient', detail: 'Complete the final backend release after confirming authorization.' } }
      : release.preview_ready
        ? { whyNow: 'The server-generated patient-facing preview is ready for physician attestation.', next: { label: 'Review and attest to the exact preview', detail: 'Confirm dispositions, provenance, boundary, and lineage before authorization.' } }
        : projection?.review_started
          ? { whyNow: 'Physician review is in progress and release evidence is not yet complete.', next: { label: 'Resolve obligations and generate preview', detail: 'Address required items before requesting the exact release preview.' } }
          : { whyNow: 'Canonical analysis is ready for physician review.', next: { label: 'Start physician review', detail: 'Review patient inputs, risk, vitality, and required plan items.' } };
  const packet = caseBundle.patient_packet ?? {};
  const missing = array(packet.missing_data);
  const snapshot = packet.snapshot_date ?? packet.collected_at ?? packet.updated_at ?? null;
  const source = packet.provenance?.source ?? packet.provenance?.kind ?? packet.source ?? 'Backend patient packet';
  const required = array(caseBundle.clinical_plan?.required_items);
  const priority = required[0] ?? null;
  const auditErrors = [];
  auditEvents.forEach((event, index) => {
    const actor = event?.actor_id ?? event?.actor?.actor_id;
    const from = event?.from_state ?? event?.state_before;
    const to = event?.to_state ?? event?.state_after;
    if (!(event?.timestamp ?? event?.timestamp_utc ?? event?.created_at)) auditErrors.push(`Event ${index + 1} timestamp missing`);
    if (!actor) auditErrors.push(`Event ${index + 1} actor missing`);
    if (!from || !to || from === 'unknown' || to === 'unknown' || from === to) auditErrors.push(`Event ${index + 1} transition invalid`);
  });
  return {
    schemaVersion: projection?.schema_version ?? null,
    emitted: Boolean(projection),
    lifecycleState,
    releaseState: explicitReleased ? 'released_to_patient' : (projection?.release_state ?? 'release_state_missing'),
    patientVisibility: patientVisible ? 'visible' : (projection?.patient_visibility ?? 'hidden'),
    whyNow: projection?.why_now ?? operationalCopy.whyNow,
    highestPriorityIssue: projection?.highest_priority_issue ?? (priority ? {
      label: priority.title ?? priority.label ?? priority.id,
      implication: priority.reason ?? priority.why_it_matters ?? 'Required plan obligation'
    } : null),
    blockers: array(projection?.blockers).length ? array(projection.blockers) : array(caseBundle.readiness?.blockers),
    nextAction: projection?.next_action ?? operationalCopy.next,
    inputSummary: projection?.input_summary ?? {
      completeness: missing.length ? `${missing.length} reported missing input${missing.length === 1 ? '' : 's'}` : 'No missing packet inputs reported',
      recency: snapshot ? `Snapshot ${snapshot}` : 'Snapshot date not emitted',
      provenance: typeof source === 'string' ? source : 'Backend patient packet',
      missingness: missing.length ? missing.map((item) => item.label ?? item.id ?? String(item)).join(' · ') : 'None reported'
    },
    riskSummary: projection?.risk_summary ?? null,
    vitalitySummary: projection?.vitality_summary ?? null,
    release: { ...release, authorizationBlocked: !explicitReleased && trustBlockers.length > 0, trustBlockers, package: releasePackage },
    auditIntegrity: projection?.audit_integrity ?? { status: auditErrors.length ? 'error' : 'pass', errors: auditErrors },
    released: explicitReleased
  };
}

export function adaptPhysicianCase(caseBundle) {
  if (!caseBundle || typeof caseBundle !== 'object') throw new Error('Physician case bundle is missing.');
  if (caseBundle.schema_version !== 'physician_case.v1') {
    throw new Error(`Physician case must use physician_case.v1; received ${caseBundle.schema_version ?? 'missing schema_version'}.`);
  }
  const actionMap = caseBundle.action_map_state ?? {};
  const analyticalRun = caseBundle.analytical_run ?? {};
  const clinicalPlan = caseBundle.clinical_plan ?? {};
  // Prefer non-empty sources: empty [] from a partial action_map must not hide analytical_run outputs.
  const risk = firstNonEmptyArray(
    actionMap.risk_outputs,
    analyticalRun.risk_outputs,
    actionMap.model_outputs?.risk_domains,
    caseBundle.risk_outputs,
  ).map((row) => {
    const record = riskRecord(row);
    const canon = resolveRiskSource(record.id);
    return {
      ...record,
      canonical: canon ? {
        id: canon.id,
        label: canon.label,
        repoPath: canon.repoPath,
        href: pagesUrl(canon),
        role: canon.role
      } : null
    };
  });
  const vitality = firstNonEmptyArray(
    actionMap.vitality_outputs,
    analyticalRun.vitality_outputs,
    actionMap.model_outputs?.vitality?.outcomes,
    caseBundle.vitality_outputs,
  ).map((row) => {
    const record = vitalityRecord(row);
    return {
      ...record,
      canonical: {
        id: 'vitality',
        label: 'Vitality improvement method v1.5',
        repoPath: record.source || 'docs/specs/Risk & Vitality/Vitality/vitality.md',
        href: pagesUrl({ pagesPath: 'engine/system-design/diagrams/aleron-vitality-physician-outcomes.html' }),
        role: 'Within-person protocol; no composite score'
      }
    };
  });
  const modelVersions = analysisStatusModelVersions(caseBundle, analyticalRun, risk, vitality);
  const audit = array(caseBundle.audit_log);
  const overrides = array(caseBundle.structured_overrides).map(overrideRecord);
  const overridesByTarget = latestOverrides(overrides);
  const releasePreview = caseBundle.release_preview ?? caseBundle.release_package ?? null;
  const currentReleasePreview = artifactBindsCurrentLineage(caseBundle, releasePreview) ? releasePreview : null;
  const normalizedWorkflow = normalizeWorkflow(caseBundle, currentReleasePreview, audit);
  const analysisStatus = caseBundle.analysis_status ?? {};
  const analysisState = typeof analysisStatus.status === 'string' && analysisStatus.status ? analysisStatus.status : 'missing';
  const analysisCompleted = analysisState === 'completed';
  const readiness = caseBundle.readiness;
  const readyForReview = analysisCompleted && readiness?.ready_for_review === true;
  const readyForRelease = analysisCompleted && readiness?.ready_for_release === true;
  const readinessBlockers = array(readiness?.blockers);
  const blockerCodes = readiness
    ? (readinessBlockers.length
      ? readinessBlockers
      : !analysisCompleted
        ? [`analysis_${analysisState}`]
        : readyForReview
          ? []
          : ['readiness_not_ready'])
    : ['readiness_missing'];
  const patientMeasurements = measurements(caseBundle);
  const groupedPatientMeasurements = presentationGroups(patientMeasurements);
  const context = patientContext(caseBundle);
  return {
    schemaVersion: 'physician_case.v1',
    sourceSchemaVersion: caseBundle.schema_version ?? null,
    patient: identity(caseBundle),
    analysis: {
      status: analysisState,
      analyticalRunId: analysisStatus.analytical_run_id ?? null,
      modelVersions: modelVersions,
      warnings: array(analysisStatus.warnings),
      errors: array(analysisStatus.errors),
      readyForReview,
      readyForRelease,
      blockerCodes
    },
    patientData: {
      summary: normalizedWorkflow.inputSummary,
      measurements: patientMeasurements,
      groups: groupedPatientMeasurements.groups,
      uncategorized: groupedPatientMeasurements.uncategorized,
      wearableSummary: buildWearableSummaryFromPacket(
        caseBundle?.patient_packet?.measurements?.wearables,
        caseBundle?.patient_packet?.snapshot_date
      ),
      instrumentNote: 'Device instruments corroborate recovery and sleep. They are not a vitality score.',
      familyHistory: context.familyHistory,
      symptoms: context.symptoms,
      genetics: context.genetics,
      clinicalContext: context.clinicalContext,
      orders: array(caseBundle.diagnostic_orders ?? caseBundle.patient_packet?.orders),
      missing: array(caseBundle.patient_packet?.missing_data)
    },
    risk,
    vitality,
    actionMap: {
      items: normalizeActionSpace({ action_map_state: actionMap }),
      riskArrCoordinates: array(actionMap.risk_arr_coordinates),
      required: array(actionMap.required_items),
      excluded: array(actionMap.excluded_items),
      warnings: array(actionMap.warnings),
      candidates: firstNonEmptyArray(actionMap.action_selection_trace?.candidates, actionMap.candidates, actionMap.action_candidates, actionMap.candidate_trace, actionMap.selection_trace?.candidates, clinicalPlan.candidates),
      library: actionMap.action_selection_trace?.action_library ?? actionMap.action_library ?? actionMap.library ?? { library_id: actionMap.action_library_id, version: actionMap.action_library_version, hash: actionMap.action_library_hash }
    },
    carePlan: {
      id: clinicalPlan.plan_id ?? null,
      title: clinicalPlan.title ?? 'Care plan unavailable',
      state: clinicalPlan.state ?? clinicalPlan.release_state ?? clinicalPlan.clinical_note_draft?.signature_status ?? 'draft',
      overview: clinicalPlan.clinical_overview ?? clinicalPlan.summary ?? 'Clinical overview missing.',
      required: array(clinicalPlan.required_items).map((item) => applyOverride(item, overridesByTarget.get(item.id))),
      actions: array(clinicalPlan.recommended_next_steps).map((item) => applyOverride(item, overridesByTarget.get(item.id))),
      additions: overrides.filter((override) => ['add_problem', 'add_order'].includes(override.action)),
      overrides,
      deferred: array(clinicalPlan.deferred_not_selected),
      note: clinicalPlan.clinical_note_draft ?? null,
      checks: array(clinicalPlan.synthesis_checks)
    },
    journal: audit,
    ai: {
      readOnly: true,
      status: 'Case-grounded read-only evidence. New AI actions are unavailable for this release gate.',
      candidates: array(actionMap.ai_candidates ?? actionMap.ai_candidate_funnel)
    },
    workflow: {
      ...normalizedWorkflow,
      releasePackage: normalizedWorkflow.release.package,
      canvasHandoff: caseBundle.canvas_handoff ?? null,
      runAudit: caseBundle.run_audit ?? null,
      monitoringAlerts: array(caseBundle.monitoring_alerts)
    },
    // Currency of truth: live case + governing canonical documents.
    truth: buildCurrencyOfTruth(caseBundle, modelVersions),
    raw: caseBundle
  };
}
