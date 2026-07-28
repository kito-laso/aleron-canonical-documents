import { assertFixtureBundle, loadFixtureBundle, selectFixtureBundle } from './fixtureLoader.js?v=physician-ai-care-plan-v9';
import { PHYSICIAN_RUNTIME_CONFIG } from './runtimeConfig.js?v=physician-ai-care-plan-v9';
import { createPhysicianAIBackendClient } from './aiColleagueBackend.js?v=physician-ai-care-plan-v9';
import { createCarePlanBackendClient } from './carePlanBackend.js?v=physician-ai-care-plan-v9';

let fixtureCache;
let backendCache;
let physicianAIClientCache;
let carePlanClientCache;

function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function normalizedHTTPURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function backendBaseURL() {
  if (typeof window === 'undefined') return null;
  const pageURL = new URL(window.location.href);
  if (pageURL.searchParams.get('fixture') === '1') return null;

  const runtimeURL = normalizedHTTPURL(PHYSICIAN_RUNTIME_CONFIG.apiBaseUrl);
  if (!runtimeURL) throw new Error('Physician runtime API URL must use http or https.');

  const overrideValue = pageURL.searchParams.get('apiBase');
  if (!overrideValue || !isLoopbackHostname(pageURL.hostname)) return runtimeURL.href;
  const overrideURL = normalizedHTTPURL(overrideValue);
  return overrideURL && isLoopbackHostname(overrideURL.hostname) ? overrideURL.href : runtimeURL.href;
}

async function getJSON(baseURL, path) {
  const url = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const response = await fetch(url, {
    headers: {
      'x-request-id': `physician-app-${Date.now()}`
    }
  });
  if (!response.ok) {
    const error = new Error(`Backend request failed for ${path}: ${response.status}`);
    error.status = response.status;
    error.path = path;
    throw error;
  }
  return response.json();
}

async function postJSON(baseURL, path, payload = {}) {
  const url = new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': `physician-app-${Date.now()}`
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.detail ?? body.error ?? body.message ?? `HTTP ${response.status}`;
    const error = new Error(`Backend request failed for ${path}: ${response.status} ${reason}`);
    error.status = response.status;
    error.backend = body;
    error.path = path;
    throw error;
  }
  return body;
}

function invalidateBackendCache() {
  backendCache = undefined;
}

export function getPhysicianAIBackendClient() {
  const baseURL = backendBaseURL();
  if (!baseURL) throw new Error('Physician AI backend client is unavailable in explicit fixture mode.');
  if (!physicianAIClientCache || physicianAIClientCache.baseURL !== baseURL) {
    physicianAIClientCache = { baseURL, client: createPhysicianAIBackendClient({ baseURL }) };
  }
  return physicianAIClientCache.client;
}

export function getCarePlanBackendClient() {
  const baseURL = backendBaseURL();
  if (!baseURL) throw new Error('Care Plan backend client is unavailable in explicit fixture mode.');
  if (!carePlanClientCache || carePlanClientCache.baseURL !== baseURL) {
    carePlanClientCache = { baseURL, client: createCarePlanBackendClient({ baseURL }) };
  }
  return carePlanClientCache.client;
}

async function loadBackendBundle(baseURL, patientId = null) {
  const cacheKey = `${baseURL}|${patientId ?? 'active'}`;
  if (backendCache?.cacheKey === cacheKey) return backendCache.bundle;

  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : '';
  const bundle = await getJSON(baseURL, `physician/cases/active${query}`);
  if (bundle?.case !== null && bundle?.case?.schema_version !== 'physician_case.v1') {
    throw new Error(`Backend physician case must use physician_case.v1; received ${bundle?.case?.schema_version ?? 'missing schema_version'}.`);
  }
  if (!Array.isArray(bundle.queue)) throw new Error('Backend physician case bundle must include a queue array.');
  backendCache = { cacheKey, baseURL, bundle };
  return bundle;
}

export async function getPhysicianFixture(patientId = null) {
  if (!fixtureCache) {
    fixtureCache = await loadFixtureBundle();
    fixtureCache.source = 'fixture';
    assertFixtureBundle(fixtureCache);
  }
  return selectFixtureBundle(fixtureCache, patientId);
}

export async function getPhysicianBundle(patientId = null) {
  const baseURL = backendBaseURL();
  if (baseURL) return loadBackendBundle(baseURL, patientId);
  return getPhysicianFixture(patientId);
}

export async function getQueue() {
  const bundle = await getPhysicianBundle();
  return bundle.queue;
}

export async function getActiveCase(patientId = null) {
  const bundle = await getPhysicianBundle(patientId);
  return bundle.case;
}

export async function startPhysicianReview(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const result = await postJSON(baseURL, `patients/${patientId}/reviews`, payload);
  invalidateBackendCache();
  return result;
}

export async function persistStructuredEdit(planId, edit) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const result = await postJSON(baseURL, `clinical-plans/${planId}/overrides`, edit);
  invalidateBackendCache();
  return result;
}

export async function requestReleasePreview(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const result = await postJSON(baseURL, `release/${patientId}/preview`, payload);
  invalidateBackendCache();
  return result;
}

export async function requestPhysicianAuthorization(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const result = await postJSON(baseURL, `release/${patientId}/sign`, payload);
  invalidateBackendCache();
  return result;
}

export async function requestFinalRelease(patientId, payload = {}) {
  const baseURL = backendBaseURL();
  if (!baseURL) return null;
  const result = await postJSON(baseURL, `release/${patientId}/release`, payload);
  invalidateBackendCache();
  return result;
}

const OVERRIDE_TAXONOMY = {
  approve: { label: 'Approve as written', reasons: ['clinical_judgment_confirmed', 'evidence_reviewed'] },
  defer: { label: 'Defer', reasons: ['timing', 'prerequisite_pending', 'patient_preference', 'monitoring_first'] },
  reject: { label: 'Reject', reasons: ['contraindication', 'not_indicated', 'duplicate', 'patient_preference'] },
  modify: { label: 'Modify', reasons: ['dose_or_frequency', 'safety', 'patient_context', 'clarification'] },
  add_problem: { label: 'Add problem', reasons: ['new_clinical_problem', 'documentation_correction'] },
  add_order: { label: 'Add order intent', reasons: ['diagnostic_clarification', 'monitoring', 'treatment_support'] }
};
const MODIFY_PATCH_FIELDS = new Set(['title', 'action_phrase', 'what_to_do', 'why_it_matters', 'status']);
const ADD_PATCH_FIELDS = new Set(['title', 'label', 'what_to_do', 'why_it_matters', 'provenance_summary', 'status']);

export function getOverrideTaxonomy() {
  return OVERRIDE_TAXONOMY;
}

export function createStructuredEdit({ itemId, field = null, value = null, patch = null, action = 'approve', reasonCode, reason }) {
  if (!OVERRIDE_TAXONOMY[action]) {
    throw new Error('Structured overrides require an approve, defer, reject, modify, add_problem, or add_order action.');
  }
  if (!reasonCode || !OVERRIDE_TAXONOMY[action].reasons.includes(reasonCode)) {
    throw new Error('Structured overrides require a taxonomy reason for the selected action.');
  }
  if (!reason || reason.trim().length < 6) {
    throw new Error('Structured overrides require a physician note before they can be audited.');
  }

  const isAdd = action === 'add_problem' || action === 'add_order';
  const allowedPatchFields = isAdd ? ADD_PATCH_FIELDS : MODIFY_PATCH_FIELDS;
  const namedPatch = patch ?? (field && value ? { [field]: value } : null);
  if (action === 'approve' || action === 'defer' || action === 'reject') {
    if (!itemId) throw new Error(`${action} requires a current plan target.`);
    if (namedPatch) throw new Error(`${action} does not accept a patch.`);
    return { action, reason_code: reasonCode, target_id: itemId };
  }
  if (!namedPatch || !Object.keys(namedPatch).length || Object.entries(namedPatch).some(([key, patchValue]) => !allowedPatchFields.has(key) || typeof patchValue !== 'string' || !patchValue.trim())) {
    throw new Error(`${action} requires a non-empty named patch using allowed fields.`);
  }
  if (isAdd) return { action, reason_code: reasonCode, patch: namedPatch };
  if (!itemId) throw new Error('modify requires a current plan target.');
  return { action, reason_code: reasonCode, target_id: itemId, patch: namedPatch };
}
