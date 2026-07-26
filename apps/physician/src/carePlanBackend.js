import { canonicalHash } from './carePlanWorkflow.js';

const CARE_PLAN_ROOT = 'physician/care-plan/';

function clone(value) {
  return structuredClone(value);
}

function hashWithoutPrefix(value) {
  return canonicalHash(value).replace(/^sha256:/, '');
}

function draftPayloadHash(payload, serverRevision) {
  return hashWithoutPrefix({ schema_version: 'care_plan_draft_state.v1', server_revision: serverRevision, payload });
}

function field(value, fieldId, fallbackOrigin = 'source_copied') {
  if (value && typeof value === 'object' && 'value' in value) {
    const origin = typeof value.authorship === 'string'
      ? value.authorship
      : value.authorship?.origin ?? fallbackOrigin;
    return {
      ...clone(value),
      field_id: value.field_id ?? fieldId,
      authorship: typeof value.authorship === 'object'
        ? clone(value.authorship)
        : { origin, originating_value: value.value, current_value: value.value },
      source_adopted_claim_ids: clone(value.source_adopted_claim_ids ?? []),
      source_promotion_event_ids: clone(value.source_promotion_event_ids ?? []),
      patient_source_refs: clone(value.patient_source_refs ?? []),
      model_id: value.model_id ?? null,
      prompt_version: value.prompt_version ?? null
    };
  }
  return {
    field_id: fieldId,
    value: value ?? '',
    authorship: { origin: fallbackOrigin, originating_value: value ?? '', current_value: value ?? '' },
    source_adopted_claim_ids: [],
    source_promotion_event_ids: [],
    patient_source_refs: [],
    model_id: null,
    prompt_version: null
  };
}

function normalizeOrder(order) {
  return {
    ...clone(order),
    catalog_test_key: order.catalog_test_key ?? order.catalog_key ?? null,
    catalog_match_state: order.catalog_match_state ?? (order.catalog_key || order.catalog_test_key ? 'verified' : 'no_match'),
    clinical_indication: order.clinical_indication ?? '',
    priority: order.priority ?? 'routine',
    collection_method: order.collection_method ?? '',
    ordering_physician_id: order.ordering_physician_id ?? null,
    duplicate_check: order.duplicate_check ?? 'not_emitted',
    adapter_capability: order.adapter_capability ?? (order.validation_state === 'valid' ? 'ready' : 'blocked'),
    adapter_block_reasons: clone(order.adapter_block_reasons ?? []),
    inclusion_state: order.inclusion_state ?? 'included'
  };
}

function normalizeEntry(entry) {
  const rawProblem = entry.problem ?? {};
  const label = rawProblem.proposed_label ?? rawProblem.label ?? '';
  return {
    ...clone(entry),
    problem: {
      ...clone(rawProblem),
      proposed_label: field(label, `field-problem-${entry.entry_id}`),
      problem_kind: rawProblem.problem_kind ?? 'issue_under_evaluation',
      entry_inclusion: rawProblem.entry_inclusion ?? 'included',
      diagnostic_certainty: rawProblem.diagnostic_certainty ?? 'not_applicable',
      emr_match_state: rawProblem.emr_match_state ?? 'not_checked',
      matched_problem_id: rawProblem.matched_problem_id ?? null,
      problem_list_disposition: rawProblem.problem_list_disposition ?? rawProblem.disposition ?? 'note_only',
      problem_commit_state: rawProblem.problem_commit_state ?? 'pending'
    },
    assessment: field(entry.assessment, `field-assessment-${entry.entry_id}`),
    plan: field(entry.plan, `field-plan-${entry.entry_id}`),
    order_intents: (entry.order_intents ?? []).map(normalizeOrder)
  };
}

function orderSetPayloadFromState(state) {
  return {
    schema_version: 'order_set.v1',
    order_set_id: state.draft_id,
    patient_reference: state.patient_reference,
    note_id: state.draft_id,
    draft_revision: state.server_revision,
    order_intents: state.entries.flatMap((entry) => entry.order_intents)
      .filter((order) => order.inclusion_state === 'included')
      .sort((left, right) => left.order_intent_id < right.order_intent_id ? -1 : left.order_intent_id > right.order_intent_id ? 1 : 0)
      .map(clone)
  };
}

export class CarePlanBackendError extends Error {
  constructor(status, code, payload, path) {
    super(`Care Plan backend request failed for ${path}: ${status} ${code}`);
    this.name = 'CarePlanBackendError';
    this.status = status;
    this.code = code;
    this.backend = payload;
    this.path = path;
    this.lastSafePersistedRevision = payload?.last_safe_persisted_revision ?? null;
    this.retrySafety = payload?.retry_safety ?? null;
    this.externalOutcome = payload?.external_outcome ?? null;
  }
}

export function isPublicStagingLocation(locationLike = globalThis.location) {
  try {
    const url = new URL(locationLike?.href ?? String(locationLike));
    return url.protocol === 'https:'
      && url.host === 'yimjason01-blip.github.io'
      && url.pathname.startsWith('/aleron-canonical-documents/apps/physician/')
      && url.searchParams.get('staging') === '1';
  } catch {
    return false;
  }
}

export function isExpectedPublicStagingCarePlanDenial(error, locationLike = globalThis.location) {
  return isPublicStagingLocation(locationLike) && error instanceof CarePlanBackendError && (error.status === 401 || error.status === 403);
}

export function adaptCarePlanBackendState(record, prior = null, expectedPatientReference = null, expectedPacketHash = null) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Care Plan current route must return an object.');
  const payload = record.payload;
  if (!payload || payload.schema_version !== 'care_plan_draft_state.v1') throw new Error('Care Plan current route returned an incompatible draft payload.');
  if (!Number.isInteger(record.server_revision) || record.server_revision < 1) throw new Error('Care Plan current route returned an invalid server revision.');
  if (typeof record.payload_hash !== 'string' || !/^[0-9a-f]{64}$/.test(record.payload_hash)) throw new Error('Care Plan current route returned an invalid payload hash.');
  if (draftPayloadHash(payload, record.server_revision) !== record.payload_hash) throw new Error('Care Plan current route payload hash mismatch.');
  if (payload.adapter_mode !== 'simulation' || payload.clinical_use !== 'prohibited') throw new Error('Care Plan current route violated the simulation boundary.');
  const recordPatient = record.patient_reference ?? record.patient_id ?? null;
  const payloadPatient = payload.patient_reference ?? payload.patient_id ?? null;
  if (!recordPatient || !payloadPatient || recordPatient !== payloadPatient || (expectedPatientReference && recordPatient !== expectedPatientReference)) throw new Error('Care Plan current route patient boundary mismatch.');
  const packetHash = payload.patient_context_packet_hash ?? payload.packet_hash ?? null;
  if (expectedPacketHash && packetHash !== expectedPacketHash) throw new Error('Care Plan current route patient-state packet mismatch.');
  const entries = (payload.entries ?? []).map(normalizeEntry);
  const state = {
    source: 'backend',
    schema_version: payload.schema_version,
    scenario_id: record.scenario_id ?? null,
    draft_id: record.draft_id ?? payload.draft_id,
    patient_reference: recordPatient,
    packet_hash: packetHash,
    encounter_id: record.encounter_id ?? payload.encounter_id,
    note_id: payload.note_id ?? record.draft_id ?? payload.draft_id,
    bundle_id: payload.bundle_id ?? null,
    server_revision: record.server_revision,
    client_revision: record.server_revision,
    persistence_state: 'saved',
    payload_hash: record.payload_hash,
    indication: field(payload.indication, 'field-indication'),
    entries,
    narrative: field(payload.narrative, 'field-narrative'),
    narrative_state: payload.narrative?.state ?? 'current',
    note_lock_state: record.note_lock_state ?? 'unlocked',
    order_authorization_state: prior?.order_authorization_state ?? 'ready',
    adapter_mode: payload.adapter_mode,
    clinical_use: payload.clinical_use,
    receipts: clone(prior?.receipts ?? []),
    projections: clone(prior?.projections ?? { notes_history: [], lab_orders: [], emr: [] }),
    pending_order_set: clone(prior?.pending_order_set ?? null),
    last_transition: clone(prior?.last_transition ?? null),
    unknown_outcome: clone(prior?.unknown_outcome ?? null),
    conflict: null,
    ui_error: null,
    backend_payload: clone(payload),
    backend_record: clone(record)
  };
  state.order_set_payload = orderSetPayloadFromState(state);
  state.order_set_hash = hashWithoutPrefix(state.order_set_payload);
  state.note_hash = record.payload_hash;
  state.problem_mutation_set = entries.filter((entry) => entry.problem.entry_inclusion === 'included').map((entry) => ({
    entry_id: entry.entry_id,
    problem_label: entry.problem.proposed_label.value,
    problem_kind: entry.problem.problem_kind,
    emr_match_state: entry.problem.emr_match_state,
    matched_problem_id: entry.problem.matched_problem_id,
    action: entry.problem.problem_list_disposition === 'add_to_active_problem_list' ? 'add' : entry.problem.problem_list_disposition === 'update_existing_problem' ? 'update' : 'note_only'
  })).sort((left, right) => left.entry_id < right.entry_id ? -1 : left.entry_id > right.entry_id ? 1 : 0);
  state.problem_mutation_set_hash = hashWithoutPrefix({
    schema_version: 'problem_mutation_set.v1',
    mutations: state.problem_mutation_set
  });
  return state;
}

export function payloadFromCarePlanState(state) {
  const payload = clone(state.backend_payload);
  payload.indication = clone(state.indication);
  if (typeof payload.indication?.authorship === 'object' && Object.keys(payload.indication.authorship).length <= 3) payload.indication.authorship = payload.indication.authorship.origin;
  payload.entries = state.entries.map((entry) => {
    const original = clone(payload.entries.find((candidate) => candidate.entry_id === entry.entry_id) ?? {});
    original.entry_id = entry.entry_id;
    original.problem = {
      ...clone(original.problem ?? {}),
      label: entry.problem.proposed_label.value,
      disposition: entry.problem.problem_list_disposition,
      problem_kind: entry.problem.problem_kind,
      entry_inclusion: entry.problem.entry_inclusion,
      diagnostic_certainty: entry.problem.diagnostic_certainty,
      emr_match_state: entry.problem.emr_match_state,
      matched_problem_id: entry.problem.matched_problem_id
    };
    original.assessment = clone(entry.assessment);
    original.plan = clone(entry.plan);
    for (const named of ['assessment', 'plan']) if (typeof original[named]?.authorship === 'object' && Object.keys(original[named].authorship).length <= 3) original[named].authorship = original[named].authorship.origin;
    original.order_intents = entry.order_intents.map((order) => {
      const next = clone(order);
      if ('catalog_key' in (original.order_intents?.find((candidate) => candidate.order_intent_id === order.order_intent_id) ?? {})) next.catalog_key = next.catalog_test_key;
      return next;
    });
    return original;
  });
  payload.narrative = clone(state.narrative);
  if (typeof payload.narrative?.authorship === 'object' && Object.keys(payload.narrative.authorship).length <= 3) payload.narrative.authorship = payload.narrative.authorship.origin;
  payload.narrative.state = state.narrative_state;
  return payload;
}

export function mergeCarePlanTransition(inputState, result, transitionKind) {
  const state = clone(inputState);
  state.last_transition = { transition_kind: transitionKind, ...clone(result) };
  const outcomeState = result.authorization_state ?? result.status;
  if (['unknown_outcome', 'reconciliation_pending'].includes(outcomeState)) {
    state.unknown_outcome = clone(result);
    state.ui_error = outcomeState === 'unknown_outcome'
      ? 'Outcome unknown. Reconcile this request before retrying.'
      : 'Response could not be verified. Reconciliation is required and retry is disabled.';
    return state;
  }
  if (!['succeeded', 'authorized_simulated', 'locked_simulated'].includes(outcomeState ?? result.note_lock_state)) return state;
  const expectedTargetHash = transitionKind === 'authorize_order_set' ? (state.pending_order_set?.payload_hash ?? state.order_set_hash) : state.payload_hash;
  const expectedTargetId = transitionKind === 'authorize_order_set' ? (state.pending_order_set?.snapshot_id ?? state.draft_id) : state.draft_id;
  const resultHash = transitionKind === 'authorize_order_set' ? result.payload_hash : result.note_hash;
  if (result.patient_reference !== state.patient_reference || result.target_revision !== state.server_revision || result.target_id !== expectedTargetId || resultHash !== expectedTargetHash) throw new Error('Care Plan transition response patient or target binding mismatch.');
  const rawReceipt = result.receipt ?? result.note_receipt;
  const receipt = rawReceipt ? { ...clone(rawReceipt), receipt_id: rawReceipt.receipt_id ?? rawReceipt.receipt_hash } : null;
  if (!receipt || receipt.patient_reference !== state.patient_reference || receipt.target_revision !== state.server_revision || receipt.target_id !== expectedTargetId || receipt.payload_hash !== expectedTargetHash || receipt.transition_kind !== transitionKind) throw new Error('Care Plan transition receipt binding mismatch.');
  const problemReceipts = transitionKind === 'lock_note' ? (result.problem_receipts ?? []) : [];
  if (transitionKind === 'lock_note') {
    if (!Array.isArray(problemReceipts) || problemReceipts.length !== state.problem_mutation_set.length) throw new Error('Care Plan problem receipts are incomplete.');
    for (const problemReceipt of problemReceipts) {
      const mutation = state.problem_mutation_set.find((candidate) => candidate.entry_id === problemReceipt.problem_entry_id);
      if (!mutation || problemReceipt.schema_version !== 'simulation_receipt.v1' || problemReceipt.receipt_kind !== 'simulation_problem_commit_receipt' || problemReceipt.transition_kind !== 'commit_problem' ||
          problemReceipt.patient_reference !== state.patient_reference || problemReceipt.target_id !== mutation.entry_id || problemReceipt.target_revision !== state.server_revision ||
          problemReceipt.payload_hash !== state.problem_mutation_set_hash || problemReceipt.problem_action !== mutation.action || problemReceipt.native_id !== null ||
          problemReceipt.vendor_id !== null || problemReceipt.transmitted !== false || problemReceipt.canvas_mutation !== false) throw new Error('Care Plan problem receipt binding mismatch.');
    }
  }
  if (receipt && !state.receipts.some((candidate) => candidate.receipt_id === receipt.receipt_id)) state.receipts.push(receipt);
  for (const problemReceipt of problemReceipts) if (!state.receipts.some((candidate) => candidate.receipt_id === problemReceipt.receipt_id)) state.receipts.push(clone(problemReceipt));
  if (transitionKind === 'authorize_order_set') {
    state.order_authorization_state = 'authorized_simulated';
    state.projections.lab_orders = [{
      projection_kind: 'simulated_order_authorization',
      receipt_id: receipt?.receipt_id ?? null,
      receipt_hash: receipt?.receipt_hash ?? null,
      label: 'Simulation - never placed or transmitted',
      native_id: null,
      specimen_state: null,
      result_state: null
    }];
    if (state.pending_order_set?.snapshot_id === result.authorized_target_id || state.pending_order_set) state.pending_order_set = null;
  }
  if (transitionKind === 'lock_note') {
    state.note_lock_state = 'locked_simulated';
    state.projections.notes_history = [{
      projection_kind: 'aleron_locked_note_simulation',
      snapshot_id: result.locked_note_snapshot_id,
      note_hash: state.payload_hash,
      note_lock_receipt_id: receipt?.receipt_id ?? null
    }];
    state.projections.emr = [{
      projection_kind: 'emr_simulation_reference',
      simulation_receipt_id: receipt?.receipt_id ?? null,
      simulation_receipt_hash: receipt?.receipt_hash ?? null,
      locked_note_snapshot_id: result.locked_note_snapshot_id,
      native_canvas_mutation: false,
      canvas_patient_link_state: 'unlinked',
      native_note_id: null,
      native_condition_ids: [],
      native_order_ids: []
    }];
    if (result.pending_order_set_snapshot_id && result.orders_unsent > 0) {
      state.pending_order_set = {
        snapshot_id: result.pending_order_set_snapshot_id,
        snapshot_revision: 1,
        payload: clone(state.order_set_payload),
        payload_hash: state.order_set_hash,
        locked_note_snapshot_id: result.locked_note_snapshot_id,
        locked_note_hash: state.payload_hash,
        status: 'pending',
        expiration_state: 'active',
        supersedes_snapshot_id: null
      };
      state.projections.lab_orders = [{
        projection_kind: 'pending_order_set',
        snapshot_id: result.pending_order_set_snapshot_id,
        payload_hash: state.order_set_hash,
        status: 'pending',
        expiration_state: 'active',
        native_id: null
      }];
    }
  }
  return state;
}

function validatePendingSnapshot(snapshot, state, pending) {
  const patientReference = snapshot?.patient_reference ?? snapshot?.patient_id;
  if (patientReference !== state.patient_reference || snapshot?.snapshot_kind !== 'pending_order_set' || snapshot?.supersedes_snapshot_id !== pending.snapshot_id || snapshot?.snapshot_revision !== pending.snapshot_revision + 1 || hashWithoutPrefix(snapshot?.payload) !== snapshot?.payload_hash || snapshot?.locked_note_hash !== pending.locked_note_hash) throw new Error('Pending order transition response binding mismatch.');
  const forbiddenAuthority = (value) => value && typeof value === 'object' && Object.entries(value).some(([key, child]) => ((key.startsWith('native_') || ['transmitted', 'canvas_mutation', 'commit_authority'].includes(key)) && child !== null && child !== false && !(Array.isArray(child) && child.length === 0)) || forbiddenAuthority(child));
  if (forbiddenAuthority(snapshot)) throw new Error('Pending order transition introduced native authority.');
  return snapshot;
}

export function createCarePlanBackendClient({
  baseURL,
  fetchImpl = globalThis.fetch,
  requestIdFactory = () => globalThis.crypto?.randomUUID?.() ?? `care-plan-${Date.now()}`,
  idempotencyKeyFactory = () => globalThis.crypto?.randomUUID?.() ?? `care-plan-idem-${Date.now()}`
}) {
  const root = new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const promotionIdempotencyKeys = new Map();
  async function request(method, path, body = null) {
    const response = await fetchImpl(new URL(`${CARE_PLAN_ROOT}${path}`, root), {
      method,
      credentials: 'include',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'x-request-id': requestIdFactory() },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload.error ?? payload.code ?? payload.detail ?? payload.message ?? `HTTP ${response.status}`;
      throw new CarePlanBackendError(response.status, code, payload, path);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CarePlanBackendError(500, 'invalid_care_plan_response', payload, path);
    return payload;
  }
  async function nonce(patientReference, transitionKind, revision, payloadHash, proposalSource = null) {
    return request('POST', 'nonce', {
      schema_version: 'care_plan_nonce_request.v1',
      patient_reference: patientReference,
      transition_kind: transitionKind,
      draft_revision: revision,
      payload_hash: payloadHash,
      ...(proposalSource ? { source_thread_id: proposalSource.sourceThreadId, source_draft_id: proposalSource.sourceDraftId } : {})
    });
  }
  async function current(prior = null, expectedPatientReference = null) {
    const path = expectedPatientReference ? `current?patient_reference=${encodeURIComponent(expectedPatientReference)}` : 'current';
    return request('GET', path).then((record) => prior ? { record, state: adaptCarePlanBackendState(record, prior, expectedPatientReference) } : (expectedPatientReference ? adaptCarePlanBackendState(record, null, expectedPatientReference).backend_record : record));
  }
  async function save(record, nextPayload, prior = null) {
    const clientRevision = record.server_revision + 1;
    const payloadHash = draftPayloadHash(nextPayload, clientRevision);
    const patientReference = record.patient_reference ?? nextPayload.patient_reference;
    const issued = await nonce(patientReference, 'save_draft', record.server_revision, record.payload_hash);
    const result = await request('POST', 'save', {
      schema_version: 'care_plan_save_request.v1',
      patient_reference: patientReference,
      note_id: record.draft_id ?? nextPayload.draft_id,
      base_server_revision: record.server_revision,
      client_revision: clientRevision,
      payload: nextPayload,
      payload_hash: payloadHash,
      idempotency_key: idempotencyKeyFactory(),
      interaction_nonce: issued.interaction_nonce
    });
    const latest = await request('GET', `current?patient_reference=${encodeURIComponent(patientReference)}`);
    return { result, record: latest, state: adaptCarePlanBackendState(latest, prior, patientReference, prior?.packet_hash ?? null) };
  }
  async function commit(path, transitionKind, state, command, targetRevision, displayedHash) {
    const issued = await nonce(state.patient_reference, transitionKind, targetRevision, displayedHash);
    return request('POST', path, {
      patient_reference: state.patient_reference,
      ...command,
      idempotency_key: command.idempotency_key ?? idempotencyKeyFactory(),
      interaction_nonce: issued.interaction_nonce
    });
  }
  return {
    current,
    save,
    async promote(state, { sourceThreadId, sourceDraftId }) {
      const commandKey = `${state.patient_reference}\u0000${sourceThreadId}\u0000${sourceDraftId}`;
      if (!promotionIdempotencyKeys.has(commandKey)) promotionIdempotencyKeys.set(commandKey, idempotencyKeyFactory());
      const issued = await nonce(state.patient_reference, 'promote_ai_proposal', state.server_revision, state.payload_hash, { sourceThreadId, sourceDraftId });
      return request('POST', 'promote', {
        schema_version: 'care_plan_ai_proposal_promotion_request.v1',
        patient_reference: state.patient_reference,
        care_plan_draft_id: state.draft_id,
        base_server_revision: state.server_revision,
        payload_hash: state.payload_hash,
        source_thread_id: sourceThreadId,
        source_draft_id: sourceDraftId,
        idempotency_key: promotionIdempotencyKeys.get(commandKey),
        interaction_nonce: issued.interaction_nonce
      }).then((result) => ({ ...result, state: adaptCarePlanBackendState(result.record, state, state.patient_reference, state.packet_hash ?? null) }));
    },
    authorize(state, { attested = true, pending = null } = {}) {
      const target = pending ?? state.pending_order_set;
      const targetId = target?.snapshot_id ?? state.draft_id;
      const revision = target?.snapshot_revision ?? state.server_revision;
      const payloadHash = target?.payload_hash ?? state.order_set_hash;
      return commit('authorize', 'authorize_order_set', state, {
        schema_version: 'order_authorization_request.v1',
        order_set_id: targetId,
        draft_revision: revision,
        payload_hash: payloadHash,
        adapter_mode: 'simulation',
        attested
      }, revision, payloadHash).then((result) => mergeCarePlanTransition(state, { ...result, authorized_target_id: targetId }, 'authorize_order_set'));
    },
    lock(state, { attested, pendingOrdersAcknowledged, secondConfirmation }) {
      return commit('lock', 'lock_note', state, {
        schema_version: 'note_lock_request.v1',
        note_id: state.draft_id,
        draft_revision: state.server_revision,
        payload_hash: state.payload_hash,
        adapter_mode: 'simulation',
        attested,
        pending_orders_acknowledged: pendingOrdersAcknowledged,
        second_confirmation: secondConfirmation,
        problem_mutation_set: clone(state.problem_mutation_set),
        problem_mutation_set_hash: state.problem_mutation_set_hash
      }, state.server_revision, state.payload_hash).then((result) => mergeCarePlanTransition(state, result, 'lock_note'));
    },
    revisePending(state, { orderIntentId, changes, reason }) {
      const pending = state.pending_order_set;
      const targetOrder = pending.payload?.order_intents?.find((order) => order.order_intent_id === orderIntentId);
      return commit('pending/revise', 'revise_pending_order_set', state, {
        schema_version: 'pending_order_set_revision_request.v1',
        order_set_id: pending.snapshot_id,
        draft_revision: pending.snapshot_revision,
        payload_hash: pending.payload_hash,
        changes: { order_intent_id: orderIntentId, ...changes },
        reason
      }, pending.snapshot_revision, pending.payload_hash).then((response) => {
        const snapshot = validatePendingSnapshot(response, state, pending);
        const next = clone(state);
        next.pending_order_set = {
          ...clone(pending),
          snapshot_id: snapshot.snapshot_id,
          snapshot_revision: snapshot.snapshot_revision,
          payload: clone(snapshot.payload),
          payload_hash: snapshot.payload_hash,
          supersedes_snapshot_id: snapshot.supersedes_snapshot_id,
          revision_reason: snapshot.revision_reason
        };
        next.projections.lab_orders = [{ projection_kind: 'pending_order_set', snapshot_id: snapshot.snapshot_id, payload_hash: snapshot.payload_hash, status: 'pending', expiration_state: 'active', native_id: null }];
        next.last_transition = { transition_kind: 'revise_pending_order_set', status: 'succeeded', snapshot_id: snapshot.snapshot_id, order_intent_id: orderIntentId, display_name: targetOrder?.display_name, changes: Object.fromEntries(Object.entries(changes ?? {}).map(([key, value]) => [key, { from: targetOrder?.[key], to: value }])), reason };
        return next;
      });
    },
    cancelPending(state, { orderIntentId, reason }) {
      const pending = state.pending_order_set;
      const targetOrder = pending.payload?.order_intents?.find((order) => order.order_intent_id === orderIntentId);
      return commit('pending/cancel', 'cancel_pending_intent', state, {
        schema_version: 'pending_order_intent_cancel_request.v1',
        order_set_id: pending.snapshot_id,
        draft_revision: pending.snapshot_revision,
        payload_hash: pending.payload_hash,
        order_intent_id: orderIntentId,
        reason
      }, pending.snapshot_revision, pending.payload_hash).then((response) => {
        const snapshot = validatePendingSnapshot(response, state, pending);
        const next = clone(state);
        next.pending_order_set = {
          ...clone(pending),
          snapshot_id: snapshot.snapshot_id,
          snapshot_revision: snapshot.snapshot_revision,
          payload: clone(snapshot.payload),
          payload_hash: snapshot.payload_hash,
          supersedes_snapshot_id: snapshot.supersedes_snapshot_id,
          revision_reason: snapshot.revision_reason
        };
        next.projections.lab_orders = [{ projection_kind: 'pending_order_set', snapshot_id: snapshot.snapshot_id, payload_hash: snapshot.payload_hash, status: 'pending', expiration_state: 'active', native_id: null }];
        next.last_transition = { transition_kind: 'cancel_pending_intent', status: 'succeeded', snapshot_id: snapshot.snapshot_id, order_intent_id: orderIntentId, display_name: targetOrder?.display_name, reason };
        return next;
      });
    },
    leavePending(state, { reason }) {
      const pending = state.pending_order_set;
      return commit('pending/leave', 'leave_pending_order_set', state, {
        schema_version: 'pending_order_set_leave_request.v1',
        order_set_id: pending.snapshot_id,
        draft_revision: pending.snapshot_revision,
        payload_hash: pending.payload_hash,
        reason
      }, pending.snapshot_revision, pending.payload_hash).then((response) => {
        const snapshot = validatePendingSnapshot(response, state, pending);
        const next = clone(state);
        next.pending_order_set = { ...clone(pending), ...clone(snapshot), status: snapshot.pending_state ?? 'pending' };
        next.projections.lab_orders = [{ projection_kind: 'pending_order_set', snapshot_id: snapshot.snapshot_id, payload_hash: snapshot.payload_hash, status: snapshot.pending_state ?? 'pending', expiration_state: 'active', native_id: null }];
        next.last_transition = { transition_kind: 'leave_pending_order_set', status: 'succeeded', snapshot_id: snapshot.snapshot_id };
        return next;
      });
    },
    reconcile(state) {
      const unknown = state.unknown_outcome;
      return commit('reconcile', 'reconcile_transition', state, {
        command_id: unknown.command_id,
        expected_revision: state.server_revision,
        expected_payload_hash: unknown.expected_payload_hash ?? state.payload_hash
      }, state.server_revision, unknown.expected_payload_hash ?? state.payload_hash).then((result) => mergeCarePlanTransition(state, result, 'reconcile_transition'));
    }
  };
}
