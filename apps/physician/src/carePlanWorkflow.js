const SCHEMA_VERSION = 'care_plan_draft_state.v1';
const PATIENT_ID = 'patient-synthetic-care-plan-v1';
const PHYSICIAN = { actor_type: 'physician', actor_id: 'physician-synthetic-1', authorized: true };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value, parentKey = '') {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const normalized = [...value];
    if (parentKey === 'order_intents') normalized.sort((left, right) => String(left?.order_intent_id ?? '').localeCompare(String(right?.order_intent_id ?? '')));
    if (parentKey === 'problem_mutation_set' || parentKey === 'mutations') normalized.sort((left, right) => String(left?.entry_id ?? '').localeCompare(String(right?.entry_id ?? '')));
    return `[${normalized.map((item) => canonicalize(item)).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], key)}`).join(',')}}`;
}

// Synchronous SHA-256 over UTF-8 keeps hashes deterministic in browsers and Node.
function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const words = [];
  const bitLength = bytes.length * 8;
  for (const byte of bytes) words.push(byte);
  words.push(0x80);
  while ((words.length % 64) !== 56) words.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) words.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) words.push((low >>> shift) & 0xff);
  const k = [];
  const isPrime = (n) => { for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false; return true; };
  const primes = [];
  for (let n = 2; primes.length < 64; n += 1) if (isPrime(n)) primes.push(n);
  for (const prime of primes) k.push((Math.floor((Math.cbrt(prime) % 1) * 0x100000000)) >>> 0);
  const h = primes.slice(0, 8).map((prime) => (Math.floor((Math.sqrt(prime) % 1) * 0x100000000)) >>> 0);
  const rotr = (value, bits) => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < words.length; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i += 1) {
      const at = offset + i * 4;
      w[i] = ((words[at] << 24) | (words[at + 1] << 16) | (words[at + 2] << 8) | words[at + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, index) => { h[index] = (h[index] + value) >>> 0; });
  }
  return h.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function canonicalHash(value) {
  return `sha256:${sha256(canonicalize(value))}`;
}

function authoredField(fieldId, value, origin = 'ai_derived') {
  return {
    field_id: fieldId,
    value,
    authorship: {
      origin,
      originating_field_id: fieldId,
      originating_value: value,
      current_value: value,
      current_editor_id: null,
      edited_at: null,
      supersedes_field_version: null,
      patient_source_refs: ['patient_packet:packet-synthetic-care-plan-v1']
    },
    source_action_ids: ['action-lab-monitoring-v1'],
    source_adopted_claim_ids: origin === 'ai_derived' ? ['claim-sleep-fatigue-adopted-v1'] : [],
    source_promotion_event_ids: origin === 'ai_derived' ? ['promotion-care-plan-v1'] : [],
    source_physician_event_ids: [],
    patient_source_refs: ['patient_packet:packet-synthetic-care-plan-v1'],
    evidence_refs: ['evidence-synthetic-v1'],
    model_id: origin === 'ai_derived' ? 'gpt-5.6-sol' : null,
    prompt_version: origin === 'ai_derived' ? 'care-plan-drafting-v1' : null,
    validation_state: 'valid',
    physician_edit_state: 'unedited'
  };
}

function labIntent(id, displayName, catalogKey) {
  return {
    schema_version: 'order_intent.v1',
    order_intent_id: id,
    order_type: 'blood_laboratory',
    display_name: displayName,
    clinical_indication: 'Evaluate fatigue and cardiometabolic risk.',
    catalog_test_key: catalogKey,
    catalog_match_state: catalogKey ? 'verified' : 'no_match',
    specimen: 'serum',
    priority: 'routine',
    collection_method: 'Quest patient service center',
    timing: 'Within 14 days',
    ordering_physician_id: PHYSICIAN.actor_id,
    duplicate_check: 'clear',
    inclusion_state: 'included',
    validation_state: catalogKey ? 'valid' : 'blocked',
    last_validated_draft_revision: 1,
    adapter_capability: catalogKey ? 'ready' : 'blocked',
    adapter_block_reasons: catalogKey ? [] : ['catalog_match_missing'],
    version: 1,
    supersedes_order_intent_id: null
  };
}

export function syntheticCarePlanFixture() {
  const entries = [
    {
      entry_id: 'entry-fatigue-labs-v1',
      source_action_ids: ['action-lab-monitoring-v1'],
      source_adopted_claim_ids: ['claim-sleep-fatigue-adopted-v1'],
      source_promotion_event_ids: ['promotion-care-plan-v1'],
      source_physician_event_ids: [],
      problem: {
        proposed_label: authoredField('field-problem-fatigue', 'Fatigue under evaluation'),
        problem_kind: 'issue_under_evaluation',
        entry_inclusion: 'included',
        diagnostic_certainty: 'provisional',
        emr_match_state: 'no_match',
        matched_problem_id: null,
        problem_list_disposition: 'add_to_active_problem_list',
        problem_commit_state: 'pending'
      },
      assessment: authoredField('field-assessment-fatigue', 'Persistent fatigue warrants targeted laboratory evaluation while sleep-disordered breathing remains under evaluation.'),
      plan: authoredField('field-plan-fatigue', 'Obtain targeted blood laboratory testing and review the results before changing treatment.'),
      order_intents: [
        labIntent('order-cbc-v1', 'Complete blood count', 'QUEST:CBC-6399'),
        labIntent('order-tsh-v1', 'Thyroid-stimulating hormone', 'QUEST:TSH-899'),
        labIntent('order-a1c-v1', 'Hemoglobin A1c', null)
      ]
    },
    {
      entry_id: 'entry-vaccine-review-v1',
      source_action_ids: ['action-vaccine-review-v1'],
      source_adopted_claim_ids: [],
      source_promotion_event_ids: [],
      source_physician_event_ids: [],
      problem: {
        proposed_label: authoredField('field-problem-vaccine', 'Preventive immunization review', 'source_copied'),
        problem_kind: 'care_gap',
        entry_inclusion: 'included',
        diagnostic_certainty: 'not_applicable',
        emr_match_state: 'not_checked',
        matched_problem_id: null,
        problem_list_disposition: 'note_only',
        problem_commit_state: 'not_applicable'
      },
      assessment: authoredField('field-assessment-vaccine', 'Immunization history requires reconciliation.', 'source_copied'),
      plan: authoredField('field-plan-vaccine', 'Review influenza and pneumococcal immunization records at the next visit.', 'source_copied'),
      order_intents: []
    }
  ];
  return {
    bundle: {
      schema_version: 'care_plan_drafting_bundle.v1',
      bundle_id: 'bundle-synthetic-care-plan-v1',
      request_id: 'request-synthetic-care-plan-v1',
      patient_reference: PATIENT_ID,
      patient_context_packet_hash: 'packet-hash-synthetic-care-plan-v1',
      source_engine_run_id: 'engine-run-synthetic-care-plan-v1',
      source_disposition_hash: 'disposition-hash-synthetic-care-plan-v1',
      source_care_plan_version: 1,
      note_draft: {
        note_id: 'note-synthetic-care-plan-v1',
        encounter_label: 'Preventive medicine review',
        indication: authoredField('field-indication-v1', 'Preventive review with fatigue evaluation.'),
        entries,
        narrative: authoredField('field-narrative-v1', 'Preventive review addressed fatigue evaluation and immunization reconciliation.')
      },
      validation: { state: 'valid', errors: [] },
      audit: { source_event_ids: ['adoption-event-v1', 'promotion-care-plan-v1'] }
    }
  };
}

export function validateCarePlanBundle(bundle) {
  const errors = [];
  const allowedTop = ['schema_version', 'bundle_id', 'request_id', 'patient_reference', 'patient_context_packet_hash', 'source_engine_run_id', 'source_disposition_hash', 'source_care_plan_version', 'note_draft', 'validation', 'audit'];
  for (const key of Object.keys(bundle ?? {})) if (!allowedTop.includes(key)) errors.push(`unknown_property:${key}`);
  if (bundle?.schema_version !== 'care_plan_drafting_bundle.v1') errors.push('schema_version');
  if (!bundle?.patient_reference || !bundle?.note_draft?.note_id) errors.push('required_identifier');
  for (const entry of bundle?.note_draft?.entries ?? []) {
    for (const intent of entry.order_intents ?? []) {
      if (intent.order_type !== 'blood_laboratory') errors.push(`order_type_not_supported:${intent.order_intent_id}`);
      for (const field of ['specimen', 'clinical_indication', 'priority', 'collection_method', 'timing', 'ordering_physician_id', 'duplicate_check']) if (!intent[field]) errors.push(`missing:${intent.order_intent_id}:${field}`);
    }
    if (entry.source_adopted_claim_ids.length !== entry.source_promotion_event_ids.length) errors.push(`promotion_lineage:${entry.entry_id}`);
  }
  return { ok: errors.length === 0, errors };
}

function emptySyntheticCarePlanBundle(patientId, packetHash) {
  const safeId = String(patientId).replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    schema_version: 'care_plan_drafting_bundle.v1',
    bundle_id: `bundle-not-emitted-${safeId}`,
    request_id: `request-not-emitted-${safeId}`,
    patient_reference: patientId,
    patient_context_packet_hash: packetHash,
    source_engine_run_id: null,
    source_disposition_hash: null,
    source_care_plan_version: 1,
    note_draft: {
      note_id: `note-not-emitted-${safeId}`,
      encounter_label: 'Care Plan not emitted',
      indication: authoredField(`field-indication-${safeId}`, 'Not emitted for this patient fixture.', 'source_copied'),
      entries: [],
      narrative: authoredField(`field-narrative-${safeId}`, 'Not emitted for this patient fixture.', 'source_copied')
    },
    validation: { state: 'valid', errors: [] },
    audit: { source_event_ids: [] }
  };
}

function orderSetPayload(state) {
  return {
    schema_version: 'order_authorization_request.v1',
    patient_reference: state.patient_reference,
    note_id: state.note_id,
    order_intents: state.entries.flatMap((entry) => entry.order_intents)
      .filter((intent) => intent.inclusion_state === 'included')
      .sort((a, b) => a.order_intent_id.localeCompare(b.order_intent_id))
  };
}

function setPath(target, path, value) {
  const parts = path.split('.');
  let current = target;
  for (const key of parts.slice(0, -1)) current = current[Number.isInteger(Number(key)) ? Number(key) : key];
  current[parts.at(-1)] = value;
}

function notePayload(state) {
  return {
    schema_version: 'note_lock_request.v1',
    patient_reference: state.patient_reference,
    note_id: state.note_id,
    indication: state.indication,
    entries: state.entries,
    narrative: state.narrative
  };
}

function problemMutationPayload(state) {
  return {
    schema_version: 'problem_mutation_set.v1',
    patient_reference: state.patient_reference,
    note_id: state.note_id,
    mutations: state.entries.filter((entry) => entry.problem.entry_inclusion === 'included').map((entry) => ({
      entry_id: entry.entry_id,
      label: entry.problem.proposed_label.value,
      problem_kind: entry.problem.problem_kind,
      emr_match_state: entry.problem.emr_match_state,
      matched_problem_id: entry.problem.matched_problem_id,
      disposition: entry.problem.problem_list_disposition
    }))
  };
}

function refreshHashes(state) {
  state.order_set_payload = orderSetPayload(state);
  state.order_set_hash = canonicalHash(state.order_set_payload);
  state.note_payload = notePayload(state);
  state.note_hash = canonicalHash(state.note_payload);
  state.problem_mutation_set = problemMutationPayload(state);
  state.problem_mutation_set_hash = canonicalHash(state.problem_mutation_set);
}

function actorCanCommit(actor) {
  return actor?.actor_type === 'physician' && actor?.actor_id === PHYSICIAN.actor_id && actor?.authorized === true;
}

export function createSyntheticCarePlanStore({ storage = globalThis.localStorage ?? null, now = () => new Date().toISOString(), patientId = PATIENT_ID, packetHash = null, empty = false, forceNextConflict = false } = {}) {
  const fixtureBundle = syntheticCarePlanFixture().bundle;
  const bundle = empty ? emptySyntheticCarePlanBundle(patientId, packetHash) : fixtureBundle;
  const expectedPacketHash = packetHash ?? bundle.patient_context_packet_hash;
  const storageKey = `aleron-care-plan:${patientId}`;
  const initialState = () => ({
    schema_version: SCHEMA_VERSION,
    fixture_id: 'synthetic-care-plan-ai-emr-v1',
    fixture_content_state: empty ? 'not_emitted' : 'emitted',
    encounter_label: bundle.note_draft.encounter_label,
    patient_reference: patientId,
    note_id: bundle.note_draft.note_id,
    bundle_id: bundle.bundle_id,
    packet_hash: expectedPacketHash,
    disposition_hash: bundle.source_disposition_hash,
    server_revision: 1,
    client_revision: 0,
    persistence_state: 'saved',
    indication: clone(bundle.note_draft.indication),
    entries: clone(bundle.note_draft.entries),
    narrative: clone(bundle.note_draft.narrative),
    narrative_state: 'current',
    note_lock_state: 'unlocked',
    order_authorization_state: 'ready',
    pending_order_set: null,
    receipts: [],
    audit_events: [],
    projections: { notes_history: [], lab_orders: [], emr: [] },
    adapter_calls: [],
    native_ids: [],
    command_results: {},
    unknown_outcomes: {}
  });
  let state;
  const stored = storage?.getItem?.(storageKey);
  try { state = stored ? JSON.parse(stored) : initialState(); } catch { state = initialState(); }
  if (state.patient_reference !== patientId || state.packet_hash !== expectedPacketHash) state = initialState();
  refreshHashes(state);
  const persist = () => storage?.setItem?.(storageKey, JSON.stringify(state));
  const getState = () => clone(state);
  let forcedConflictPending = forceNextConflict;
  const audit = (eventType, actor, detail = {}) => state.audit_events.push({
    schema_version: 'audit_event.v1', event_id: `audit-${state.audit_events.length + 1}`, event_type: eventType,
    actor, timestamp: now(), server_revision: state.server_revision, ...detail
  });
  const conflict = (command) => command.base_server_revision !== state.server_revision
    ? { ok: false, status: 409, error: 'draft_revision_conflict', state: getState() }
    : null;
  const finishDraftMutation = (command, eventType, detail = {}) => {
    const lockedNote = state.note_lock_state.startsWith('locked')
      ? { payload: clone(state.note_payload), hash: state.note_hash }
      : null;
    state.server_revision += 1;
    state.client_revision = Math.max(state.client_revision + 1, command.client_revision ?? 0);
    state.persistence_state = 'saved';
    refreshHashes(state);
    if (lockedNote) {
      state.note_payload = lockedNote.payload;
      state.note_hash = lockedNote.hash;
    }
    audit(eventType, command.actor, detail);
    persist();
    return { ok: true, state: getState() };
  };
  const findOrder = (orderIntentId) => state.entries.flatMap((entry) => entry.order_intents).find((order) => order.order_intent_id === orderIntentId);

  const api = {
    getState,
    promoteDraftProposal(command) {
      if (state.note_lock_state.startsWith('locked')) return { ok: false, status: 409, error: 'locked_note_immutable', state: getState() };
      const stale = conflict(command); if (stale) return stale;
      const proposal = command.proposal;
      const bundle = proposal?.proposal_bundle;
      const proposalKeys = new Set(['draft_id', 'draft_type', 'patient_reference', 'source_thread_id', 'source_message_id', 'adopted_claim_ids', 'source_claim_state', 'patient_context_packet_hash', 'model', 'prompt_version', 'evidence_refs', 'physician_edit_state', 'execution_state', 'chart_write_performed', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit', 'promotion_state', 'promotion_event_id', 'promoted_at', 'created_at', 'disclosure', 'proposal_bundle']);
      const bundleKeys = new Set(['schema_version', 'proposal_id', 'patient_reference', 'patient_context_packet_hash', 'source_thread_id', 'source_message_id', 'source_adopted_claim_id', 'source_claim_state', 'narrative', 'entries', 'order_note', 'lineage']);
      const lineageKeys = new Set(['model', 'prompt_version', 'evidence_refs', 'patient_source_refs']);
      if (!proposal || !bundle || !Object.keys(proposal).every((key) => proposalKeys.has(key)) || !Object.keys(bundle).every((key) => bundleKeys.has(key)) || !Object.keys(bundle.lineage ?? {}).every((key) => lineageKeys.has(key)) || !Object.keys(bundle.narrative ?? {}).every((key) => key === 'value')) return { ok: false, status: 422, error: 'proposal_schema_invalid', state: getState() };
      if (proposal?.draft_type !== 'care_plan_bundle' || proposal?.promotion_state !== 'ready_for_promotion' || proposal?.source_claim_state !== 'adopted') return { ok: false, status: 422, error: 'proposal_not_promotion_ready', state: getState() };
      if (proposal.execution_state !== 'nonexecuting' || proposal.chart_write_performed !== false || !['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'].every((key) => proposal[key] === false)) return { ok: false, status: 422, error: 'proposal_authority_invalid', state: getState() };
      if (proposal.patient_reference !== state.patient_reference || proposal.patient_context_packet_hash !== state.packet_hash || bundle?.patient_reference !== state.patient_reference || bundle?.patient_context_packet_hash !== state.packet_hash) return { ok: false, status: 409, error: 'proposal_patient_context_mismatch', state: getState() };
      const claimId = bundle?.source_adopted_claim_id;
      const coherentLineage = typeof bundle?.proposal_id === 'string' && bundle.proposal_id.length > 0
        && bundle.source_claim_state === 'adopted'
        && bundle.source_thread_id === proposal.source_thread_id
        && bundle.source_message_id === proposal.source_message_id
        && typeof claimId === 'string' && claimId.length > 0
        && Array.isArray(proposal.adopted_claim_ids) && proposal.adopted_claim_ids.length === 1 && proposal.adopted_claim_ids[0] === claimId;
      if (!coherentLineage) return { ok: false, status: 422, error: 'proposal_lineage_invalid', state: getState() };
      const promotionEventId = String(command.promotion_event_id ?? '').trim();
      if (!promotionEventId) return { ok: false, status: 422, error: 'promotion_event_id_required', state: getState() };
      if (state.audit_events.some((event) => event.promotion_event_id === promotionEventId || event.draft_id === proposal.draft_id) || state.entries.some((entry) => entry.source_promotion_event_ids?.includes(promotionEventId) || entry.source_ai_draft_id === proposal.draft_id)) return { ok: false, status: 409, error: 'proposal_already_promoted', state: getState() };
      const lineage = bundle.lineage ?? {};
      const field = (fieldId, value) => ({
        field_id: fieldId,
        value,
        authorship: { origin: 'ai_derived', originating_field_id: fieldId, originating_value: value, current_value: value, current_editor_id: null, edited_at: null, supersedes_field_version: null, patient_source_refs: clone(lineage.patient_source_refs ?? []) },
        source_action_ids: [],
        source_adopted_claim_ids: [claimId],
        source_promotion_event_ids: [promotionEventId],
        source_physician_event_ids: [],
        patient_source_refs: clone(lineage.patient_source_refs ?? []),
        evidence_refs: clone(lineage.evidence_refs ?? []),
        model_id: lineage.model ?? proposal.model ?? null,
        prompt_version: lineage.prompt_version ?? proposal.prompt_version ?? null,
        validation_state: 'valid',
        physician_edit_state: 'unedited'
      });
      const proposalEntries = Array.isArray(bundle.entries) ? bundle.entries : [];
      if (!proposalEntries.length) return { ok: false, status: 422, error: 'proposal_entries_required', state: getState() };
      const orderIds = new Set();
      const entryKeys = new Set(['proposal_entry_id', 'problem', 'assessment', 'plan', 'order_intents']);
      const problemKeys = new Set(['proposed_label', 'problem_kind', 'diagnostic_certainty', 'problem_list_disposition']);
      const orderKeys = new Set(['schema_version', 'order_intent_id', 'order_type', 'display_name', 'clinical_indication', 'catalog_test_key', 'specimen', 'priority', 'collection_method', 'timing', 'inclusion_state', 'validation_state', 'execution_state', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit']);
      for (const entry of proposalEntries) {
        const validEntry = Object.keys(entry ?? {}).every((key) => entryKeys.has(key)) && Object.keys(entry?.problem ?? {}).every((key) => problemKeys.has(key))
          && Object.keys(entry?.problem?.proposed_label ?? {}).every((key) => key === 'value')
          && Object.keys(entry?.assessment ?? {}).every((key) => key === 'value')
          && Object.keys(entry?.plan ?? {}).every((key) => key === 'value')
          && typeof entry?.proposal_entry_id === 'string' && entry.proposal_entry_id.length > 0
          && typeof entry.problem?.proposed_label?.value === 'string' && entry.problem.proposed_label.value.trim().length > 0
          && ['issue_under_evaluation'].includes(entry.problem.problem_kind)
          && ['provisional'].includes(entry.problem.diagnostic_certainty)
          && entry.problem.problem_list_disposition === 'note_only'
          && typeof entry.assessment?.value === 'string' && entry.assessment.value.trim().length > 0
          && typeof entry.plan?.value === 'string' && entry.plan.value.trim().length > 0
          && Array.isArray(entry.order_intents);
        if (!validEntry) return { ok: false, status: 422, error: 'proposal_entry_invalid', state: getState() };
        for (const order of entry.order_intents) {
          const validOrder = Object.keys(order ?? {}).every((key) => orderKeys.has(key))
            && order.schema_version === 'order_intent.v1'
            && typeof order?.order_intent_id === 'string' && order.order_intent_id.length > 0 && !orderIds.has(order.order_intent_id)
            && order.order_type === 'blood_laboratory' && ['blood', 'serum', 'plasma'].includes(order.specimen)
            && typeof order.display_name === 'string' && order.display_name.trim().length > 0
            && typeof order.catalog_test_key === 'string' && order.catalog_test_key.trim().length > 0
            && order.execution_state === 'nonexecuting'
            && ['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'].every((key) => order[key] === false);
          if (!validOrder) return { ok: false, status: 422, error: 'proposal_order_intent_invalid', state: getState() };
          orderIds.add(order.order_intent_id);
        }
      }
      const promotedEntries = proposalEntries.map((entry, index) => {
        const entryId = `entry-${proposal.draft_id}-${index + 1}`;
        return {
          entry_id: entryId,
          source_ai_draft_id: proposal.draft_id,
          source_action_ids: [],
          source_adopted_claim_ids: [claimId],
          source_promotion_event_ids: [promotionEventId],
          source_physician_event_ids: [],
          problem: {
            proposed_label: field(`${entryId}-problem`, entry.problem?.proposed_label?.value ?? 'Adopted conclusion under evaluation'),
            problem_kind: entry.problem?.problem_kind ?? 'issue_under_evaluation',
            entry_inclusion: 'included',
            diagnostic_certainty: entry.problem?.diagnostic_certainty ?? 'provisional',
            emr_match_state: 'not_checked',
            matched_problem_id: null,
            problem_list_disposition: entry.problem?.problem_list_disposition ?? 'note_only',
            problem_commit_state: 'pending'
          },
          assessment: field(`${entryId}-assessment`, entry.assessment?.value ?? 'Not emitted'),
          plan: field(`${entryId}-plan`, entry.plan?.value ?? 'Not emitted'),
          order_intents: clone(entry.order_intents ?? [])
        };
      });

      state.entries.push(...promotedEntries);
      state.fixture_content_state = 'emitted';
      state.encounter_label = 'Physician Care Plan draft';
      return finishDraftMutation(command, 'ai_proposal_promoted_to_care_plan', { promotion_event_id: promotionEventId, proposal_id: bundle.proposal_id, draft_id: proposal.draft_id, source_adopted_claim_id: claimId });
    },
    saveDraft(command) {
      if (state.note_lock_state.startsWith('locked')) return { ok: false, status: 409, error: 'locked_note_immutable', state: getState() };
      if (forcedConflictPending) {
        forcedConflictPending = false;
        return { ok: false, status: 409, error: 'draft_revision_conflict', state: getState() };
      }
      if (state.failure_fixtures?.save_failure) {
        state.persistence_state = 'save_failed';
        return { ok: false, status: 503, error: 'draft_save_failed', state: getState() };
      }
      const stale = conflict(command); if (stale) return stale;
      let clinicalSourceChanged = false;
      for (const change of command.changes ?? []) {
        const prior = change.path.split('.').reduce((value, key) => value?.[Number.isInteger(Number(key)) ? Number(key) : key], state);
        setPath(state, change.path, clone(change.value));
        if (change.path.endsWith('.value')) {
          const fieldPath = change.path.slice(0, -6);
          const field = fieldPath.split('.').reduce((value, key) => value?.[Number.isInteger(Number(key)) ? Number(key) : key], state);
          if (field?.authorship && prior !== change.value) {
            field.authorship.origin = field.authorship.origin === 'physician_authored' ? 'physician_authored' : 'physician_edited';
            field.authorship.current_value = change.value;
            field.authorship.current_editor_id = command.actor?.actor_id ?? null;
            field.authorship.edited_at = now();
            field.authorship.supersedes_field_version = state.server_revision;
            field.physician_edit_state = 'edited';
            if (field === state.narrative) field.physician_owned = true;
          }
        }
        if (/entries\.\d+\.(assessment|plan|problem)/.test(change.path)) clinicalSourceChanged = true;
        if (change.path === 'narrative.value') state.narrative_state = 'current';
      }
      if (clinicalSourceChanged) state.narrative_state = 'out_of_date';
      return finishDraftMutation(command, 'draft_saved');
    },
    matchCatalog(command) {
      const stale = conflict(command); if (stale) return stale;
      const order = findOrder(command.order_intent_id);
      if (!order) return { ok: false, status: 404, error: 'order_not_found' };
      order.catalog_test_key = command.catalog_test_key;
      order.catalog_match_state = 'verified'; order.validation_state = 'valid'; order.adapter_capability = 'ready'; order.adapter_block_reasons = [];
      return finishDraftMutation(command, 'order_catalog_matched');
    },
    addOrder(command) {
      const stale = conflict(command); if (stale) return stale;
      const entry = state.entries.find((candidate) => candidate.entry_id === command.entry_id);
      if (!entry) return { ok: false, status: 404, error: 'entry_not_found' };
      const id = `order-physician-${state.server_revision + 1}`;
      entry.order_intents.push({ ...labIntent(id, command.order.display_name, command.order.catalog_test_key), ...clone(command.order), order_intent_id: id, source_physician_event_ids: [`physician-source-${id}`] });
      return finishDraftMutation(command, 'physician_order_added');
    },
    setOrderInclusion(command) {
      const stale = conflict(command); if (stale) return stale;
      const order = findOrder(command.order_intent_id);
      if (!order) return { ok: false, status: 404, error: 'order_not_found' };
      order.inclusion_state = command.inclusion_state;
      const result = finishDraftMutation(command, command.inclusion_state === 'included' ? 'order_restored' : 'order_excluded');
      const pending = state.projections.lab_orders.find((row) => row.projection_kind === 'pending_order_set');
      if (pending) {
        pending.order_intent_ids = state.entries.flatMap((entry) => entry.order_intents)
          .filter((candidate) => candidate.inclusion_state === 'included' && !candidate.authorization_state)
          .map((candidate) => candidate.order_intent_id);
        persist();
        result.state = getState();
      }
      return result;
    },
    authorizeOrders(command) {
      if (!actorCanCommit(command.actor)) return { ok: false, status: 403, error: 'physician_authority_required' };
      if (state.command_results[command.idempotency_key]) return clone(state.command_results[command.idempotency_key]);
      const pendingTarget = command.pending_snapshot_id ? state.pending_order_set : null;
      if (pendingTarget && (command.pending_snapshot_id !== pendingTarget.snapshot_id || command.pending_snapshot_revision !== pendingTarget.snapshot_revision)) return { ok: false, status: 409, error: 'draft_revision_conflict' };
      if (!pendingTarget && command.draft_revision !== state.server_revision) return { ok: false, status: 409, error: 'draft_revision_conflict' };
      if (command.payload_hash !== (pendingTarget?.payload_hash ?? state.order_set_hash)) return { ok: false, status: 409, error: 'stale_payload_hash' };
      if (!command.attested || !command.interaction_nonce) return { ok: false, status: 422, error: 'physician_attestation_required' };
      const included = pendingTarget
        ? pendingTarget.payload.order_intents.filter((order) => order.inclusion_state === 'included' && order.pending_state !== 'cancelled')
        : state.entries.flatMap((entry) => entry.order_intents).filter((order) => order.inclusion_state === 'included');
      if (!included.length || included.some((order) => order.validation_state !== 'valid' || order.catalog_match_state !== 'verified')) return { ok: false, status: 422, error: 'order_set_not_ready' };
      const receipt = {
        schema_version: 'simulation_receipt.v1', receipt_id: `simulation-order-${state.receipts.length + 1}`,
        receipt_kind: 'simulation_order_authorization_receipt', adapter_mode: 'simulation', adapter_capability: 'ready',
        patient_reference: state.patient_reference, note_id: state.note_id, payload_hash: command.payload_hash,
        draft_revision: state.server_revision, actor: clone(command.actor), created_at: now(), native_id: null,
        statement: 'Simulation - never placed or transmitted'
      };
      state.receipts.push(receipt); state.order_authorization_state = 'authorized_simulated';
      if (!pendingTarget) for (const order of included) order.authorization_state = 'authorized_simulated';
      audit('orders_authorized_simulated', command.actor, { receipt_id: receipt.receipt_id });
      const projection = { schema_version: 'lab_orders_projection.v1', projection_kind: 'simulated_order_authorization', receipt_id: receipt.receipt_id, note_id: state.note_id, order_intent_ids: included.map((order) => order.order_intent_id), label: receipt.statement, native_id: null, specimen_state: null, result_state: null };
      state.projections.lab_orders = [projection];
      state.projections.emr = [...state.projections.emr, { schema_version: 'emr_projection.v1', simulation_order_receipt_id: receipt.receipt_id, simulation_receipt_hash: canonicalHash(receipt), native_canvas_mutation: false, canvas_patient_link_state: 'unlinked', native_note_id: null, native_condition_ids: [], native_order_ids: [] }];
      state.pending_order_set = null;
      persist();
      const result = { ok: true, receipt: clone(receipt), state: getState() };
      state.command_results[command.idempotency_key] = clone(result); persist();
      return result;
    },
    lockNote(command) {
      if (!actorCanCommit(command.actor)) return { ok: false, status: 403, error: 'physician_authority_required' };
      if (state.command_results[command.idempotency_key]) return clone(state.command_results[command.idempotency_key]);
      if (state.persistence_state !== 'saved') return { ok: false, status: 409, error: 'current_draft_not_saved' };
      if (command.draft_revision !== state.server_revision) return { ok: false, status: 409, error: 'draft_revision_conflict' };
      if (command.payload_hash !== state.note_hash || command.problem_mutation_set_hash !== state.problem_mutation_set_hash) return { ok: false, status: 409, error: 'stale_payload_hash' };
      if (!command.attested || !command.interaction_nonce) return { ok: false, status: 422, error: 'physician_attestation_required' };
      const pending = state.entries.flatMap((entry) => entry.order_intents).filter((order) => order.inclusion_state === 'included' && !order.authorization_state);
      if (pending.length && (!command.pending_orders_acknowledged || !command.second_confirmation)) return { ok: false, status: 422, error: 'pending_orders_second_confirmation_required' };
      const receipt = { schema_version: 'simulation_receipt.v1', receipt_id: `simulation-lock-${state.receipts.length + 1}`, receipt_kind: 'simulation_note_lock_receipt', adapter_mode: 'simulation', adapter_capability: 'ready', patient_reference: state.patient_reference, note_id: state.note_id, payload_hash: state.note_hash, problem_mutation_set_hash: state.problem_mutation_set_hash, draft_revision: state.server_revision, actor: clone(command.actor), created_at: now(), native_id: null, orders_unsent: pending.length, statement: `Simulation: no Canvas record was created. ${pending.length} pending order${pending.length === 1 ? '' : 's'} not transmitted.` };
      state.receipts.push(receipt); state.note_lock_state = 'locked_simulated';
      for (const entry of state.entries) {
        if (entry.problem.problem_list_disposition === 'add_to_active_problem_list' || entry.problem.problem_list_disposition === 'update_existing_problem') {
          const problemReceipt = { schema_version: 'simulation_receipt.v1', receipt_id: `simulation-problem-${entry.entry_id}`, receipt_kind: 'simulation_problem_commit_receipt', adapter_mode: 'simulation', entry_id: entry.entry_id, native_id: null, created_at: now() };
          state.receipts.push(problemReceipt); entry.problem.problem_commit_state = 'committed_simulated';
        }
      }
      const snapshot = clone(state.note_payload);
      state.projections.notes_history.push({ schema_version: 'notes_history_projection.v1', projection_kind: 'aleron_locked_note_simulation', note_lock_receipt_id: receipt.receipt_id, note_id: state.note_id, note_hash: state.note_hash, locked_at: now(), snapshot });
      if (!state.projections.lab_orders.length && pending.length) {
        state.pending_order_set = { snapshot_id: `pending-${state.note_id}-1`, snapshot_revision: 1, payload: clone(state.order_set_payload), payload_hash: state.order_set_hash, locked_note_hash: state.note_hash, supersedes_snapshot_id: null, status: 'pending', expiration_state: 'active' };
        state.projections.lab_orders.push({ schema_version: 'lab_orders_projection.v1', projection_kind: 'pending_order_set', pending_order_set_id: state.pending_order_set.snapshot_id, note_id: state.note_id, note_hash: state.note_hash, payload_hash: state.pending_order_set.payload_hash, order_intent_ids: pending.map((order) => order.order_intent_id), status: 'pending', expiration_state: 'active', native_id: null });
      }
      state.projections.emr = [{ schema_version: 'emr_projection.v1', note_id: state.note_id, simulation_note_receipt_id: receipt.receipt_id, simulation_receipt_hash: canonicalHash(receipt), native_canvas_mutation: false, canvas_patient_link_state: 'unlinked', native_note_id: null, native_condition_ids: [], native_order_ids: [] }];
      audit('note_locked_simulated', command.actor, { receipt_id: receipt.receipt_id, orders_unsent: pending.length });
      persist();
      const result = { ok: true, receipt: clone(receipt), state: getState() };
      state.command_results[command.idempotency_key] = clone(result); persist();
      return result;
    },
    revisePendingOrderSet(command) {
      if (!actorCanCommit(command.actor)) return { ok: false, status: 403, error: 'physician_authority_required' };
      const prior = state.pending_order_set;
      if (!prior || prior.snapshot_id !== command.snapshot_id) return { ok: false, status: 404, error: 'pending_order_set_not_found' };
      if (prior.snapshot_revision !== command.expected_revision || prior.payload_hash !== command.expected_payload_hash) return { ok: false, status: 409, error: 'stale_payload_hash' };
      if (!command.reason) return { ok: false, status: 422, error: 'revision_reason_required' };
      const payload = clone(prior.payload);
      const order = payload.order_intents.find((item) => item.order_intent_id === command.order_intent_id);
      if (!order) return { ok: false, status: 404, error: 'order_not_found' };
      const previousValues = Object.fromEntries(Object.keys(command.changes ?? {}).map((key) => [key, order[key]]));
      Object.assign(order, clone(command.changes ?? {}));
      const snapshotId = `pending-${state.note_id}-${prior.snapshot_revision + 1}`;
      state.pending_order_set = { snapshot_id: snapshotId, snapshot_revision: prior.snapshot_revision + 1, payload, payload_hash: canonicalHash(payload), locked_note_hash: prior.locked_note_hash, supersedes_snapshot_id: prior.snapshot_id, revision_reason: command.reason, status: 'pending', expiration_state: 'active' };
      state.projections.lab_orders = [{ schema_version: 'lab_orders_projection.v1', projection_kind: 'pending_order_set', pending_order_set_id: snapshotId, note_id: state.note_id, note_hash: prior.locked_note_hash, payload_hash: state.pending_order_set.payload_hash, order_intent_ids: payload.order_intents.map((item) => item.order_intent_id), status: 'pending', expiration_state: 'active', native_id: null }];
      state.last_transition = { transition_kind: 'revise_pending_order_set', status: 'succeeded', snapshot_id: snapshotId, order_intent_id: order.order_intent_id, display_name: order.display_name, changes: Object.fromEntries(Object.entries(command.changes ?? {}).map(([key, value]) => [key, { from: previousValues[key], to: value }])), reason: command.reason };
      audit('pending_order_set_revised', command.actor, { snapshot_id: snapshotId, supersedes_snapshot_id: prior.snapshot_id, reason: command.reason });
      persist();
      return { ok: true, state: getState() };
    },
    cancelPendingIntent(command) {
      if (!actorCanCommit(command.actor)) return { ok: false, status: 403, error: 'physician_authority_required' };
      const prior = state.pending_order_set;
      if (!prior || prior.snapshot_id !== command.snapshot_id) return { ok: false, status: 404, error: 'pending_order_set_not_found' };
      if (prior.snapshot_revision !== command.expected_revision || prior.payload_hash !== command.expected_payload_hash) return { ok: false, status: 409, error: 'stale_payload_hash' };
      if (!command.reason) return { ok: false, status: 422, error: 'revision_reason_required' };
      const snapshotId = `pending-${state.note_id}-${prior.snapshot_revision + 1}`;
      const payload = clone(prior.payload);
      const cancelledOrder = payload.order_intents.find((item) => item.order_intent_id === command.order_intent_id);
      if (!cancelledOrder) return { ok: false, status: 404, error: 'order_not_found' };
      payload.order_intents = payload.order_intents.map((item) => item.order_intent_id === command.order_intent_id ? { ...item, pending_state: 'cancelled', inclusion_state: 'excluded' } : item);
      state.pending_order_set = { snapshot_id: snapshotId, snapshot_revision: prior.snapshot_revision + 1, payload, payload_hash: canonicalHash(payload), locked_note_hash: prior.locked_note_hash, supersedes_snapshot_id: prior.snapshot_id, revision_reason: command.reason, status: 'pending', expiration_state: 'active' };
      state.projections.lab_orders = [{ schema_version: 'lab_orders_projection.v1', projection_kind: 'pending_order_set', pending_order_set_id: snapshotId, note_id: state.note_id, note_hash: prior.locked_note_hash, payload_hash: state.pending_order_set.payload_hash, order_intent_ids: payload.order_intents.filter((item) => item.inclusion_state === 'included').map((item) => item.order_intent_id), status: 'pending', expiration_state: 'active', native_id: null }];
      state.last_transition = { transition_kind: 'cancel_pending_intent', status: 'succeeded', snapshot_id: snapshotId, order_intent_id: cancelledOrder.order_intent_id, display_name: cancelledOrder.display_name, reason: command.reason };
      audit('pending_intent_cancelled', command.actor, { snapshot_id: snapshotId, order_intent_id: command.order_intent_id, reason: command.reason });
      persist();
      return { ok: true, state: getState() };
    },
    leavePending(command) {
      if (!actorCanCommit(command.actor)) return { ok: false, status: 403, error: 'physician_authority_required' };
      if (!state.pending_order_set || state.pending_order_set.snapshot_id !== command.snapshot_id) return { ok: false, status: 404, error: 'pending_order_set_not_found' };
      audit('pending_order_set_left_pending', command.actor, { snapshot_id: command.snapshot_id });
      persist();
      return { ok: true, state: getState() };
    },
    simulateUnverifiedNativeResponse(command) {
      const failure = { state: 'unknown_outcome', failure_code: 'invalid_or_missing_native_receipt', affected_transition: 'native_commitment', what_definitely_did_not_happen: 'No verified native success was recorded.', what_may_have_happened: 'The external system may have accepted the request.', last_safe_persisted_revision: state.server_revision, external_outcome: 'unknown', retry_safety: 'reconcile_first', idempotency_key: command.idempotency_key };
      state.unknown_outcomes[command.idempotency_key] = failure; persist(); return clone(failure);
    },
    retryUnknownOutcome(idempotencyKey) {
      return state.unknown_outcomes[idempotencyKey] ? { ok: false, status: 409, error: 'reconciliation_required' } : { ok: false, status: 404, error: 'unknown_outcome_not_found' };
    },
    setFailureFixture(name, enabled) { state.failure_fixtures ??= {}; state.failure_fixtures[name] = enabled; persist(); return getState(); },
    reset() {
      storage?.removeItem?.(storageKey); state = initialState(); refreshHashes(state);
      return { drafts: 0, receipts: 0, projections: 0, native_ids: 0, audit_events: 0 };
    }
  };
  return api;
}
