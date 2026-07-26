const FIXTURE_URL = new URL('../fixtures/physician_synthetic_case.json', import.meta.url);

export async function loadFixtureBundle() {
  const response = await fetch(FIXTURE_URL);
  if (!response.ok) {
    throw new Error(`Unable to load physician app fixture: ${response.status}`);
  }
  return response.json();
}

export function selectFixtureBundle(bundle, patientId = null) {
  const cases = Array.isArray(bundle?.cases) ? bundle.cases : [bundle?.case].filter(Boolean);
  const selectedCase = patientId
    ? cases.find((candidate) => (candidate?.patient_packet?.patient_id ?? candidate?.patient_id) === patientId)
    : bundle?.case ?? cases[0];
  if (!selectedCase) throw new Error(`Physician fixture case not emitted for patient: ${patientId ?? 'unknown'}`);
  const selectedPatientId = selectedCase?.patient_packet?.patient_id ?? selectedCase?.patient_id;
  const selected = {
    ...bundle,
    queue: (bundle?.queue ?? []).filter((item) => cases.some((candidate) => (candidate?.patient_packet?.patient_id ?? candidate?.patient_id) === item.patient_id)),
    case: selectedCase,
    selected_patient_id: selectedPatientId
  };
  assertFixtureBundle(selected);
  return selected;
}

export function assertFixtureBundle(bundle) {
  const selectedCase = bundle?.case;
  const missing = [];
  if (!Array.isArray(bundle?.queue)) missing.push('queue');
  if (!selectedCase?.patient_packet) missing.push('patient_packet');
  if (!selectedCase?.action_map_state) missing.push('action_map_state');
  if (!selectedCase?.clinical_plan) missing.push('clinical_plan');
  if (!selectedCase?.run_audit) missing.push('run_audit');
  if (!('release_package' in selectedCase)) missing.push('release_package');
  if (!Array.isArray(selectedCase?.audit_log)) missing.push('audit_log');
  if (selectedCase?.diagnostic_orders && !Array.isArray(selectedCase.diagnostic_orders)) missing.push('diagnostic_orders');
  if (selectedCase?.diagnostic_results && !Array.isArray(selectedCase.diagnostic_results)) missing.push('diagnostic_results');
  if (selectedCase?.monitoring_alerts && !Array.isArray(selectedCase.monitoring_alerts)) missing.push('monitoring_alerts');
  if (missing.length) {
    throw new Error(`Fixture missing required boundary artifact(s): ${missing.join(', ')}`);
  }
  return true;
}
