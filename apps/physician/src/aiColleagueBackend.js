const THREAD_SCHEMA = 'physician_ai_thread.v1';
const WORKSPACE_SCHEMA = 'aleron.physician-ai-workspace.v1';
const DISCLOSURE = 'Illustrative fixture response, not model generated';
const PROVIDER = Object.freeze({ provider_id: 'synthetic_fixture', execution_mode: 'illustrative_fixture', model: 'illustrative-fixture-no-model' });
const CONSULTATION_TYPES = new Set(['challenge', 'blind_second_opinion', 'specialist', 'evidence_review', 'data_audit', 'action_comparison']);
const DRAFT_TYPES = new Set(['note_section', 'recommendation', 'problem_proposal', 'order_intent', 'care_plan_bundle']);
const CAPABILITY_FIELDS = Object.freeze(['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit']);
const SPECIALTIES = new Set(['General Internal Medicine', 'Cardiology', 'Endocrinology', 'Sleep Medicine', 'Clinical Pharmacology', 'Neurology', 'Psychiatry']);

function clone(value) {
  return structuredClone(value);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(object(value, label))) {
    if (!allowed.includes(key)) throw new Error(`${label} contains unknown field: ${key}`);
  }
}

function exactProvider(provider) {
  onlyKeys(provider, ['provider_id', 'execution_mode', 'model'], 'physician AI provider');
  for (const [key, expected] of Object.entries(PROVIDER)) {
    if (provider[key] !== expected) throw new Error(`physician AI provider ${key} is incompatible.`);
  }
}

function validateConfidence(confidence, label) {
  onlyKeys(confidence, ['estimate_pct', 'calibration_status', 'band', 'basis', 'main_uncertainty'], label);
  if (!Number.isFinite(confidence.estimate_pct) || confidence.estimate_pct < 0 || confidence.estimate_pct > 100) throw new Error(`${label} estimate is invalid.`);
  if (confidence.calibration_status !== 'uncalibrated') throw new Error(`${label} calibration is incompatible.`);
  const expectedBand = confidence.estimate_pct >= 90 ? 'very_high' : confidence.estimate_pct >= 70 ? 'high' : confidence.estimate_pct >= 40 ? 'moderate' : 'low';
  if (confidence.band !== expectedBand) throw new Error(`${label} band does not match its estimate.`);
  nonEmpty(confidence.basis, `${label}.basis`);
  nonEmpty(confidence.main_uncertainty, `${label}.main_uncertainty`);
}

function validateSourceFact(fact, label) {
  onlyKeys(fact, ['label', 'value', 'units', 'source_ref', 'provenance'], label);
  nonEmpty(fact.label, `${label}.label`);
  nonEmpty(fact.source_ref, `${label}.source_ref`);
  nonEmpty(fact.provenance, `${label}.provenance`);
  if (fact.units !== null && typeof fact.units !== 'string') throw new Error(`${label}.units is invalid.`);
  if (!['string', 'number', 'boolean'].includes(typeof fact.value) && fact.value !== null) throw new Error(`${label}.value is invalid.`);
}

function validateStringArray(value, label) {
  for (const item of array(value, label)) nonEmpty(item, `${label} item`);
}

function validateClaim(claim, thread, sourceRefs) {
  onlyKeys(claim, [
    'claim_id', 'thread_id', 'patient_id', 'claim_type', 'statement', 'confidence', 'supporting_patient_facts',
    'contradictory_patient_facts', 'alternative_explanations', 'displayed_patient_assertions', 'missing_information',
    'confidence_raisers', 'confidence_lowerers', 'patient_source_refs', 'evidence_refs', 'state', 'created_by', 'created_at',
    'adopted_at', 'adopted_by_actor_id', 'dismissed_at', 'dismissed_by_actor_id', 'dismissal_reason', 'revision_history'
  ], 'physician AI claim');
  nonEmpty(claim.claim_id, 'claim.claim_id');
  if (claim.thread_id !== thread.thread_id || claim.patient_id !== thread.patient_id) throw new Error('physician AI claim lineage does not match the thread patient.');
  if (!['pattern', 'hypothesis', 'interpretation', 'proposed_focus'].includes(claim.claim_type)) throw new Error('physician AI claim type is incompatible.');
  nonEmpty(claim.statement, 'claim.statement');
  validateConfidence(object(claim.confidence, 'claim.confidence'), 'claim.confidence');
  array(claim.supporting_patient_facts, 'claim.supporting_patient_facts').forEach((fact, index) => validateSourceFact(fact, `claim.supporting_patient_facts[${index}]`));
  for (const field of ['contradictory_patient_facts', 'alternative_explanations', 'missing_information', 'confidence_raisers', 'confidence_lowerers', 'patient_source_refs', 'evidence_refs']) validateStringArray(claim[field], `claim.${field}`);
  if (claim.claim_type === 'hypothesis' && claim.alternative_explanations.length === 0) throw new Error('physician AI hypothesis requires an alternative explanation.');
  for (const ref of claim.patient_source_refs) if (!sourceRefs.has(ref)) throw new Error(`physician AI claim source reference does not resolve: ${ref}`);
  array(claim.displayed_patient_assertions, 'claim.displayed_patient_assertions').forEach((assertion, index) => {
    onlyKeys(assertion, ['assertion_kind', 'text', 'patient_specific', 'source_facts'], `claim.displayed_patient_assertions[${index}]`);
    nonEmpty(assertion.text, 'displayed assertion text');
    if (assertion.patient_specific !== true) throw new Error('displayed patient assertion must remain patient-specific.');
    array(assertion.source_facts, 'displayed assertion source facts').forEach((fact, factIndex) => validateSourceFact(fact, `displayed assertion source fact ${factIndex}`));
  });
  if (!['working', 'adopted', 'dismissed'].includes(claim.state)) throw new Error('physician AI claim state is incompatible.');
  onlyKeys(claim.created_by, ['agent_role', 'model', 'prompt_version'], 'claim.created_by');
  if (claim.created_by.agent_role !== 'physician_colleague' || claim.created_by.model !== PROVIDER.model) throw new Error('physician AI claim model lineage is incompatible.');
  nonEmpty(claim.created_by.prompt_version, 'claim.created_by.prompt_version');
  nonEmpty(claim.created_at, 'claim.created_at');
  if (claim.revision_history !== undefined) {
    let expectedPrior = null;
    for (const [index, revision] of array(claim.revision_history, 'claim.revision_history').entries()) {
      onlyKeys(revision, ['prior_statement', 'revised_statement', 'source_consultation_id', 'accepted_at', 'accepted_by_actor_id'], `claim.revision_history[${index}]`);
      for (const field of ['prior_statement', 'revised_statement', 'source_consultation_id', 'accepted_at', 'accepted_by_actor_id']) nonEmpty(revision[field], `claim.revision_history[${index}].${field}`);
      if (expectedPrior !== null && revision.prior_statement !== expectedPrior) throw new Error('physician AI claim revision history is not contiguous.');
      expectedPrior = revision.revised_statement;
    }
    if (expectedPrior !== null && claim.statement !== expectedPrior) throw new Error('physician AI claim statement does not match its revision history.');
  }
  if (claim.state === 'adopted' && (!claim.adopted_at || !claim.adopted_by_actor_id)) throw new Error('adopted physician AI claim lacks adoption lineage.');
  if (claim.state === 'dismissed' && (!claim.dismissed_at || !claim.dismissed_by_actor_id || !claim.dismissal_reason)) throw new Error('dismissed physician AI claim lacks dismissal lineage.');
}

function validateMessage(message, thread, claimIds) {
  onlyKeys(message, ['message_id', 'thread_id', 'patient_id', 'role', 'content', 'context_packet_hash', 'created_at', 'response_mode', 'disclosure', 'model', 'prompt_version', 'claim_ids'], 'physician AI message');
  nonEmpty(message.message_id, 'message.message_id');
  if (message.thread_id !== thread.thread_id || message.patient_id !== thread.patient_id || message.context_packet_hash !== thread.context.packet_hash) throw new Error('physician AI message lineage does not match the thread patient and packet.');
  if (!['physician', 'assistant'].includes(message.role)) throw new Error('physician AI message role is incompatible.');
  nonEmpty(message.content, 'message.content');
  nonEmpty(message.created_at, 'message.created_at');
  if (message.role === 'assistant') {
    if (message.response_mode !== 'illustrative_fixture' || message.disclosure !== DISCLOSURE || message.model !== PROVIDER.model) throw new Error('physician AI assistant disclosure or provider lineage is incompatible.');
    nonEmpty(message.prompt_version, 'message.prompt_version');
    for (const id of array(message.claim_ids, 'message.claim_ids')) if (!claimIds.has(id)) throw new Error(`physician AI message claim reference does not resolve: ${id}`);
  }
}

function validateProviderPatientContext(context, label) {
  onlyKeys(context, ['packet_id', 'packet_hash', 'snapshot_at', 'source_facts'], label);
  for (const field of ['packet_id', 'packet_hash', 'snapshot_at']) nonEmpty(context[field], `${label}.${field}`);
  array(context.source_facts, `${label}.source_facts`).forEach((fact, index) => validateSourceFact(fact, `${label}.source_facts[${index}]`));
}

function validateConsultation(consultation, thread, claimById, consultationById) {
  onlyKeys(consultation, [
    'consultation_id', 'thread_id', 'patient_id', 'target_claim_id', 'target_statement', 'consultation_type', 'specialty', 'blinded_to_primary_answer',
    'context_packet_hash', 'input_question', 'position', 'confidence', 'supporting_patient_facts', 'contradictory_patient_facts',
    'alternatives', 'discriminating_information', 'evidence_refs', 'agreement', 'challenge_outcome', 'evidence_state',
    'information_boundary', 'provider_input', 'model', 'prompt_version', 'created_at', 'disclosure',
    'parent_consultation_id', 'consultation_context_id', 'is_follow_up', 'proposed_revision', 'revision_disposition',
    'revision_decided_at', 'revision_decided_by_actor_id'
  ], 'physician AI consultation');
  nonEmpty(consultation.consultation_id, 'consultation.consultation_id');
  if (consultation.thread_id !== thread.thread_id || consultation.patient_id !== thread.patient_id || consultation.context_packet_hash !== thread.context.packet_hash) throw new Error('physician AI consultation lineage does not match the thread patient and packet.');
  const targetClaim = claimById.get(consultation.target_claim_id);
  if (!targetClaim) throw new Error('physician AI consultation target claim does not resolve.');
  nonEmpty(consultation.target_statement, 'consultation.target_statement');
  if (consultation.target_statement !== targetClaim.statement) throw new Error('physician AI consultation target statement does not match its linked claim.');
  if (consultation.proposed_revision !== null && (typeof consultation.proposed_revision !== 'string' || !consultation.proposed_revision)) throw new Error('physician AI consultation proposed revision is invalid.');
  if (!CONSULTATION_TYPES.has(consultation.consultation_type)) throw new Error('physician AI consultation type is incompatible.');
  if (consultation.specialty !== null && !SPECIALTIES.has(consultation.specialty)) throw new Error('physician AI consultation specialty is incompatible.');
  if (consultation.consultation_type === 'specialist' && !consultation.specialty) throw new Error('specialist AI consultation requires a specialty.');
  if (consultation.consultation_type === 'blind_second_opinion' && consultation.blinded_to_primary_answer !== true) throw new Error('blind physician AI consultation lost its information boundary.');
  validateConfidence(object(consultation.confidence, 'consultation.confidence'), 'consultation.confidence');
  array(consultation.supporting_patient_facts, 'consultation.supporting_patient_facts').forEach((fact, index) => validateSourceFact(fact, `consultation.supporting_patient_facts[${index}]`));
  for (const field of ['contradictory_patient_facts', 'alternatives', 'discriminating_information', 'evidence_refs']) validateStringArray(consultation[field], `consultation.${field}`);
  onlyKeys(consultation.information_boundary, ['included', 'excluded'], 'consultation.information_boundary');
  validateStringArray(consultation.information_boundary.included, 'consultation.information_boundary.included');
  validateStringArray(consultation.information_boundary.excluded, 'consultation.information_boundary.excluded');
  onlyKeys(consultation.provider_input, ['neutral_question', 'patient_context', 'target_claim', 'specialty', 'deidentified_query'], 'consultation.provider_input');
  if (consultation.provider_input.patient_context) validateProviderPatientContext(consultation.provider_input.patient_context, 'consultation.provider_input.patient_context');
  if (consultation.provider_input.target_claim?.statement !== undefined && consultation.provider_input.target_claim.statement !== consultation.target_statement) throw new Error('physician AI consultation target statement does not match its frozen provider input.');
  if (consultation.model !== PROVIDER.model || consultation.disclosure !== DISCLOSURE) throw new Error('physician AI consultation provider lineage is incompatible.');
  const hasDisposition = consultation.revision_disposition !== undefined;
  if (hasDisposition) {
    if (!['accepted', 'kept_current'].includes(consultation.revision_disposition)) throw new Error('physician AI consultation revision disposition is invalid.');
    nonEmpty(consultation.revision_decided_at, 'consultation.revision_decided_at');
    nonEmpty(consultation.revision_decided_by_actor_id, 'consultation.revision_decided_by_actor_id');
    if (consultation.revision_disposition === 'accepted' && !consultation.proposed_revision) throw new Error('accepted physician AI consultation lacks a proposed revision.');
  } else if (consultation.revision_decided_at !== undefined || consultation.revision_decided_by_actor_id !== undefined) {
    throw new Error('physician AI consultation revision decision lineage is incomplete.');
  }
  if (consultation.is_follow_up === true) {
    const parent = consultationById.get(consultation.parent_consultation_id);
    if (!parent) throw new Error('physician AI consultation follow-up parent does not resolve.');
    if (parent.target_statement !== consultation.target_statement) throw new Error('physician AI consultation follow-up changed its frozen target wording.');
    nonEmpty(consultation.consultation_context_id, 'consultation.consultation_context_id');
  } else if ('parent_consultation_id' in consultation || 'consultation_context_id' in consultation || 'is_follow_up' in consultation) {
    throw new Error('physician AI consultation follow-up lineage is incomplete.');
  }
}

function validateDraft(draft, thread, claimById, messageIds) {
  const carePlanFields = draft.draft_type === 'care_plan_bundle' ? ['source_claim_state', 'promotion_state', 'promotion_event_id', 'promoted_at', 'proposal_bundle'] : [];
  onlyKeys(draft, ['draft_id', 'draft_type', 'patient_reference', 'source_thread_id', 'source_message_id', 'adopted_claim_ids', 'patient_context_packet_hash', 'model', 'prompt_version', 'evidence_refs', 'physician_edit_state', 'execution_state', 'chart_write_performed', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit', 'created_at', 'content', 'disclosure', ...carePlanFields], 'physician AI draft');
  nonEmpty(draft.draft_id, 'draft.draft_id');
  if (!DRAFT_TYPES.has(draft.draft_type)) throw new Error('physician AI draft type is incompatible.');
  if (draft.patient_reference !== thread.patient_id || draft.source_thread_id !== thread.thread_id || draft.patient_context_packet_hash !== thread.context.packet_hash) throw new Error('physician AI draft lineage does not match the thread patient and packet.');
  if (draft.source_message_id !== null && !messageIds.has(draft.source_message_id)) throw new Error('physician AI draft source message does not resolve.');
  for (const id of array(draft.adopted_claim_ids, 'draft.adopted_claim_ids')) if (claimById.get(id)?.state !== 'adopted') throw new Error('physician AI draft references a claim that was not adopted.');
  if (draft.execution_state !== 'nonexecuting' || draft.chart_write_performed !== false || ['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'].some((key) => draft[key] !== false)) throw new Error('physician AI draft violated the nonexecution boundary.');
  if (draft.model !== PROVIDER.model || draft.disclosure !== DISCLOSURE) throw new Error('physician AI draft provider lineage is incompatible.');
  if (!['unedited', 'edited'].includes(draft.physician_edit_state)) throw new Error('physician AI draft edit state is incompatible.');
  if (draft.draft_type === 'care_plan_bundle') {
    if (draft.source_claim_state !== 'adopted' || !['ready_for_promotion', 'promoted'].includes(draft.promotion_state)) throw new Error('Care Plan proposal promotion state is incompatible.');
    const bundle = object(draft.proposal_bundle, 'draft.proposal_bundle');
    onlyKeys(bundle, ['schema_version', 'proposal_id', 'patient_reference', 'patient_context_packet_hash', 'source_thread_id', 'source_message_id', 'source_adopted_claim_id', 'source_claim_state', 'narrative', 'entries', 'order_note', 'lineage'], 'draft.proposal_bundle');
    onlyKeys(object(bundle.narrative, 'draft.proposal_bundle.narrative'), ['value'], 'draft.proposal_bundle.narrative');
    onlyKeys(object(bundle.lineage, 'draft.proposal_bundle.lineage'), ['model', 'prompt_version', 'evidence_refs', 'patient_source_refs'], 'draft.proposal_bundle.lineage');
    const adoptedClaimIds = array(draft.adopted_claim_ids, 'draft.adopted_claim_ids');
    if (bundle.schema_version !== 'care_plan_ai_proposal_bundle.v1' || bundle.patient_reference !== thread.patient_id || bundle.patient_context_packet_hash !== thread.context.packet_hash) throw new Error('Care Plan proposal bundle lineage is incompatible.');
    if (bundle.source_thread_id !== draft.source_thread_id || bundle.source_message_id !== draft.source_message_id || bundle.source_claim_state !== 'adopted' || adoptedClaimIds.length !== 1 || bundle.source_adopted_claim_id !== adoptedClaimIds[0]) throw new Error('Care Plan proposal source lineage is incompatible.');
    if (draft.promotion_state === 'ready_for_promotion' && (draft.promotion_event_id !== null || draft.promoted_at !== null)) throw new Error('Unpromoted Care Plan proposal carries promotion lineage.');
    if (draft.promotion_state === 'promoted' && (typeof draft.promotion_event_id !== 'string' || !draft.promotion_event_id || typeof draft.promoted_at !== 'string' || !draft.promoted_at)) throw new Error('Promoted Care Plan proposal lacks promotion lineage.');
    const entries = array(bundle.entries, 'draft.proposal_bundle.entries');
    if (!entries.length) throw new Error('Care Plan proposal bundle requires entries.');
    for (const [index, entryValue] of entries.entries()) {
      const entry = object(entryValue, `draft.proposal_bundle.entries[${index}]`);
      onlyKeys(entry, ['proposal_entry_id', 'problem', 'assessment', 'plan', 'order_intents'], `draft.proposal_bundle.entries[${index}]`);
      onlyKeys(object(entry.problem, 'proposal problem'), ['proposed_label', 'problem_kind', 'diagnostic_certainty', 'problem_list_disposition'], 'proposal problem');
      onlyKeys(object(entry.assessment, 'proposal assessment'), ['value'], 'proposal assessment');
      onlyKeys(object(entry.plan, 'proposal plan'), ['value'], 'proposal plan');
      for (const [orderIndex, orderValue] of array(entry.order_intents, 'proposal order intents').entries()) {
        const order = object(orderValue, `proposal order intents[${orderIndex}]`);
        onlyKeys(order, ['schema_version', 'order_intent_id', 'order_type', 'display_name', 'clinical_indication', 'catalog_test_key', 'specimen', 'priority', 'collection_method', 'timing', 'inclusion_state', 'validation_state', 'execution_state', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'], `proposal order intents[${orderIndex}]`);
        if (order.schema_version !== 'order_intent.v1' || order.order_type !== 'blood_laboratory' || order.execution_state !== 'nonexecuting' || !CAPABILITY_FIELDS.every((key) => order[key] === false)) throw new Error('Care Plan proposal order intent violated the no-authority boundary.');
      }
    }
  } else nonEmpty(draft.content, 'draft.content');
}

export function validateBackendThread(threadValue, expectedPatientId, expectedPacketHash = null) {
  const thread = object(threadValue, 'physician_ai_thread.v1');
  onlyKeys(thread, ['schema_version', 'artifact_version', 'thread_id', 'patient_id', 'title', 'provider', 'disclosure', 'context', 'messages', 'claims', 'consultations', 'drafts', 'created_at', 'updated_at'], 'physician_ai_thread.v1');
  if (thread.schema_version !== THREAD_SCHEMA) throw new Error(`Backend physician AI thread schema is incompatible: ${thread.schema_version ?? 'missing'}.`);
  if (!Number.isInteger(thread.artifact_version) || thread.artifact_version < 1) throw new Error('Backend physician AI artifact version is incompatible.');
  nonEmpty(thread.thread_id, 'thread.thread_id');
  if (thread.patient_id !== expectedPatientId) throw new Error('Backend physician AI thread patient boundary mismatch.');
  nonEmpty(thread.title, 'thread.title');
  exactProvider(object(thread.provider, 'thread.provider'));
  if (thread.disclosure !== DISCLOSURE) throw new Error('Backend physician AI disclosure is incompatible.');
  onlyKeys(thread.context, ['packet_id', 'packet_hash', 'snapshot_at', 'source_refs'], 'thread.context');
  for (const field of ['packet_id', 'packet_hash', 'snapshot_at']) nonEmpty(thread.context[field], `thread.context.${field}`);
  if (expectedPacketHash && thread.context.packet_hash !== expectedPacketHash) throw new Error('Backend physician AI thread packet lineage does not match the selected patient context.');
  validateStringArray(thread.context.source_refs, 'thread.context.source_refs');
  const sourceRefs = new Set(thread.context.source_refs);
  const claims = array(thread.claims, 'thread.claims');
  claims.forEach((item) => validateClaim(item, thread, sourceRefs));
  const claimById = new Map(claims.map((item) => [item.claim_id, item]));
  if (claimById.size !== claims.length) throw new Error('Backend physician AI thread contains duplicate claim IDs.');
  const messages = array(thread.messages, 'thread.messages');
  messages.forEach((item) => validateMessage(item, thread, new Set(claimById.keys())));
  const messageIds = new Set(messages.map((item) => item.message_id));
  if (messageIds.size !== messages.length) throw new Error('Backend physician AI thread contains duplicate message IDs.');
  const consultations = array(thread.consultations, 'thread.consultations');
  const consultationById = new Map(consultations.map((item) => [item.consultation_id, item]));
  if (consultationById.size !== consultations.length) throw new Error('Backend physician AI thread contains duplicate consultation IDs.');
  consultations.forEach((item) => validateConsultation(item, thread, claimById, consultationById));
  const drafts = array(thread.drafts, 'thread.drafts');
  drafts.forEach((item) => validateDraft(item, thread, claimById, messageIds));
  if (new Set(drafts.map((item) => item.draft_id)).size !== drafts.length) throw new Error('Backend physician AI thread contains duplicate draft IDs.');
  nonEmpty(thread.created_at, 'thread.created_at');
  nonEmpty(thread.updated_at, 'thread.updated_at');
  return true;
}

function contextStatus(caseBundle, thread) {
  const packet = caseBundle.patient_packet ?? {};
  const domains = [];
  if (Array.isArray(packet.symptoms) && packet.symptoms.length) domains.push('Symptoms');
  if (packet.measurements?.wearables && Object.keys(packet.measurements.wearables).length) domains.push('Wearables');
  if (packet.measurements && Object.keys(packet.measurements).some((key) => key !== 'wearables')) domains.push('Clinical measurements');
  if (caseBundle.clinical_plan) domains.push('Care plan');
  return { snapshot: thread.context.snapshot_at, domains, missingCount: Array.isArray(packet.missing_data) ? packet.missing_data.length : 0 };
}

function informationBoundaryText(boundary) {
  return `Included: ${boundary.included.join(', ') || 'none'}. Excluded: ${boundary.excluded.join(', ') || 'none'}.`;
}

function draftEditKey(patientId, threadId, draftId) {
  return `${patientId}\u0000${threadId}\u0000${draftId}`;
}

function adaptThread(thread, localDraftEdits) {
  const copy = clone(thread);
  return {
    threadId: copy.thread_id,
    patientId: copy.patient_id,
    title: copy.title,
    lastActivity: copy.updated_at,
    contextPacketHash: copy.context.packet_hash,
    backendArtifactVersion: copy.artifact_version,
    backendAggregate: copy,
    backendProvider: copy.provider,
    backendDisclosure: copy.disclosure,
    messages: copy.messages.map((message) => ({ ...message, responseMode: message.response_mode ?? null, sourceLine: message.disclosure ?? null })),
    claims: copy.claims,
    consultations: copy.consultations.map((consultation) => ({
      ...consultation,
      source_line: consultation.disclosure,
      information_boundary_contract: consultation.information_boundary,
      information_boundary: informationBoundaryText(consultation.information_boundary)
    })),
    drafts: copy.drafts.map((draft) => {
      if (draft.draft_type === 'care_plan_bundle') return draft;
      const local = localDraftEdits?.get(draftEditKey(copy.patient_id, copy.thread_id, draft.draft_id));
      return local ? { ...draft, backend_source_content: draft.content, content: local.content, physician_edit_state: 'local_uncommitted', locally_edited_at: local.editedAt } : { ...draft, backend_source_content: draft.content };
    })
  };
}

function attachActive(workspace) {
  workspace.activeThread = workspace.threads.find((thread) => thread.threadId === workspace.activeThreadId) ?? null;
  const claims = workspace.activeThread?.claims ?? [];
  if (!claims.some((claim) => claim.claim_id === workspace.selectedClaimId)) workspace.selectedClaimId = claims[0]?.claim_id ?? null;
  if (!claims.some((claim) => claim.claim_id === workspace.adoptionPendingClaimId && claim.state === 'working')) workspace.adoptionPendingClaimId = null;
  return workspace;
}

export function adaptBackendThreadWorkspace(caseBundle, backendThreads, activeThreadId = null, options = {}) {
  const selectedPatientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  const selectedPacketHash = caseBundle?.patient_packet?.packet_hash ?? caseBundle?.engine_run?.patient_packet_hash ?? caseBundle?.action_map_state?.patient_packet_hash;
  nonEmpty(selectedPatientId, 'selected patient ID');
  nonEmpty(selectedPacketHash, 'selected patient packet hash');
  const aggregates = clone(array(backendThreads, 'backend physician AI threads'));
  for (const thread of aggregates) {
    const claimById = new Map(array(thread?.claims, 'thread.claims').map((item) => [item?.claim_id, item]));
    for (const consultation of array(thread?.consultations, 'thread.consultations')) {
      if (Object.hasOwn(consultation, 'target_statement')) continue;
      const targetClaim = claimById.get(consultation?.target_claim_id);
      if (!targetClaim) throw new Error('physician AI consultation target claim does not resolve.');
      consultation.target_statement = nonEmpty(targetClaim.statement, 'claim.statement');
    }
  }
  aggregates.forEach((thread) => validateBackendThread(thread, selectedPatientId, selectedPacketHash));
  const selected = aggregates.find((thread) => thread.thread_id === activeThreadId) ?? aggregates[0] ?? null;
  const threads = aggregates.map((thread) => adaptThread(thread, options.localDraftEdits));
  const workspace = {
    schemaVersion: WORKSPACE_SCHEMA,
    patientId: selectedPatientId,
    patientDisplayName: caseBundle?.patient_packet?.display_name ?? selectedPatientId,
    packetHash: selectedPacketHash,
    packetVersion: caseBundle?.patient_packet?.packet_version ?? caseBundle?.patient_packet?.schema_version ?? 'physician_case.v1',
    fixtureMode: false,
    providerAvailable: true,
    providerMode: 'backend',
    contextStatus: selected ? contextStatus(caseBundle, selected) : { snapshot: 'Not emitted', domains: [], missingCount: 0 },
    contextSourceRefs: selected?.context.source_refs ?? [],
    activeThreadId: selected?.thread_id ?? null,
    selectedClaimId: options.selectedClaimId ?? null,
    adoptionPendingClaimId: options.adoptionPendingClaimId ?? null,
    providerPending: false,
    providerError: null,
    threads
  };
  return attachActive(workspace);
}

export function applyLocalDraftEdit(inputWorkspace, draftId, content, localDraftEdits, options = {}) {
  const nextContent = String(content ?? '').trim();
  if (!nextContent) throw new Error('Draft content is required.');
  const workspace = clone(inputWorkspace);
  const thread = workspace.threads.find((item) => item.threadId === workspace.activeThreadId);
  const draft = thread?.drafts.find((item) => item.draft_id === draftId);
  if (!draft) throw new Error('Draft does not belong to the active backend thread.');
  if (draft.draft_type === 'care_plan_bundle' || typeof draft.content !== 'string') throw new Error('Only a generic content-based draft can be edited locally.');
  if (draft.execution_state !== 'nonexecuting' || draft.chart_write_performed !== false) throw new Error('Only a nonexecuting, non-chart-writing draft can be edited locally.');
  const editedAt = options.now ?? new Date().toISOString();
  localDraftEdits.set(draftEditKey(workspace.patientId, thread.threadId, draftId), { content: nextContent, editedAt });
  draft.backend_source_content ??= draft.content;
  draft.content = nextContent;
  draft.physician_edit_state = 'local_uncommitted';
  draft.locally_edited_at = editedAt;
  return attachActive(workspace);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function createPhysicianAIBackendClient({ baseURL, fetchImpl = globalThis.fetch, requestIdFactory = () => globalThis.crypto?.randomUUID?.() ?? `physician-ai-${Date.now()}-${Math.random().toString(36).slice(2)}` }) {
  const root = new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  const pendingRequestIds = new Map();
  async function request(method, path, body = null) {
    const semanticKey = `${method}\u0000${path}\u0000${JSON.stringify(stableValue(body))}`;
    const requestId = pendingRequestIds.get(semanticKey) ?? requestIdFactory();
    pendingRequestIds.set(semanticKey, requestId);
    const response = await fetchImpl(new URL(path, root), {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'x-request-id': requestId },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload.detail ?? payload.error ?? payload.message ?? `HTTP ${response.status}`;
      const error = new Error(`Physician AI backend request failed for ${path}: ${response.status} ${reason}`);
      error.status = response.status;
      error.path = path;
      error.backend = payload;
      throw error;
    }
    pendingRequestIds.delete(semanticKey);
    return payload;
  }
  return {
    listThreads: (patientId) => request('GET', `physician/ai/threads?patient_id=${encodeURIComponent(patientId)}`),
    createThread: (patientId, title = 'New conversation') => request('POST', 'physician/ai/threads', { patient_id: patientId, title }),
    getThread: (patientId, threadId) => request('GET', `physician/ai/threads/${encodeURIComponent(threadId)}?patient_id=${encodeURIComponent(patientId)}`),
    sendMessage: (patientId, threadId, content, contextPacketHash) => request('POST', `physician/ai/threads/${encodeURIComponent(threadId)}/messages`, { patient_id: patientId, content, context_packet_hash: contextPacketHash }),
    createConsultation: (patientId, threadId, claimId, consultationType, options = {}) => {
      const body = { patient_id: patientId, thread_id: threadId, consultation_type: consultationType, ...(consultationType === 'specialist' ? { specialty: options.specialty } : {}), neutral_question: options.neutralQuestion };
      if (options.parentConsultationId) body.parent_consultation_id = options.parentConsultationId;
      return request('POST', `physician/ai/claims/${encodeURIComponent(claimId)}/consultations`, body);
    },
    adoptClaim: (patientId, threadId, claimId, confirmationStatement) => request('POST', `physician/ai/claims/${encodeURIComponent(claimId)}/adopt`, { patient_id: patientId, thread_id: threadId, action: 'adopt_for_drafting', confirmation_statement: confirmationStatement }),
    dismissClaim: (patientId, threadId, claimId, reason) => request('POST', `physician/ai/claims/${encodeURIComponent(claimId)}/dismiss`, { patient_id: patientId, thread_id: threadId, reason }),
    decideRevision: (patientId, threadId, claimId, consultationId, action, currentStatement, proposedRevision = null) => request('POST', `physician/ai/claims/${encodeURIComponent(claimId)}/revision`, {
      patient_id: patientId,
      thread_id: threadId,
      consultation_id: consultationId,
      action,
      current_statement_confirmation: currentStatement,
      ...(action === 'accept_revision' ? { proposed_revision_confirmation: proposedRevision } : {})
    }),
    createDraft: (patientId, threadId, claimId, draftType) => request('POST', 'physician/ai/drafts', { patient_id: patientId, thread_id: threadId, claim_id: claimId, draft_type: draftType })
  };
}
