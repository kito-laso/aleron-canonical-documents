const STORAGE_PREFIX = 'aleron.physician-ai.v1:';
const FIXTURE_SOURCE_LINE = 'Illustrative fixture response, not model generated.';
const CONSULTATION_TYPES = new Set(['challenge', 'blind_second_opinion', 'specialist', 'evidence_review', 'data_audit', 'action_comparison']);
const MATERIAL_CLAIM_TYPES = new Set(['pattern', 'hypothesis', 'interpretation', 'proposed_focus']);
const DRAFT_TYPES = new Set(['note_section', 'recommendation', 'problem_proposal', 'order_intent']);

export function requiresCrossDomainMaterialThought(question) {
  const text = String(question ?? '').trim();
  return /cross[- ]domain/i.test(text)
    || (/integrat/i.test(text) && /risk domains?/i.test(text));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function assertClosed(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains an unknown field.`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function activeThread(workspace) {
  return workspace.threads.find((thread) => thread.threadId === workspace.activeThreadId) ?? workspace.threads[0] ?? null;
}

function attachActiveThread(workspace) {
  const copy = { ...workspace };
  copy.activeThread = activeThread(copy);
  const claims = array(copy.activeThread?.claims);
  if (!claims.some((claim) => claim.claim_id === copy.selectedClaimId)) {
    copy.selectedClaimId = claims[0]?.claim_id ?? null;
  }
  if (!claims.some((claim) => claim.claim_id === copy.adoptionPendingClaimId && claim.state === 'working')) {
    copy.adoptionPendingClaimId = null;
  }
  return copy;
}

function patientId(caseBundle) {
  return caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id ?? null;
}

function packetHash(caseBundle) {
  return caseBundle?.patient_packet?.packet_hash
    ?? caseBundle?.engine_run?.patient_packet_hash
    ?? caseBundle?.analytical_run?.patient_packet_hash
    ?? caseBundle?.action_map_state?.patient_packet_hash
    ?? 'Not emitted';
}

function measurement(caseBundle, key) {
  const groups = caseBundle?.patient_packet?.measurements ?? {};
  for (const group of Object.values(groups)) {
    if (group && typeof group === 'object' && !Array.isArray(group) && group[key]?.key === key) return group[key];
  }
  return null;
}

function sourceRefs(caseBundle) {
  const refs = new Set(['patient_packet.age', 'patient_packet.sex']);
  const packet = caseBundle?.patient_packet ?? {};
  array(packet.symptoms).forEach((_, index) => refs.add(`patient_packet.symptoms[${index}]`));
  array(packet.family_history).forEach((_, index) => refs.add(`patient_packet.family_history[${index}]`));
  const measurements = packet.measurements ?? {};
  for (const [groupKey, group] of Object.entries(measurements)) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    for (const [key, row] of Object.entries(group)) {
      if (row && typeof row === 'object' && !Array.isArray(row) && 'value' in row) refs.add(`patient_packet.measurements.${groupKey}.${key}`);
    }
  }
  array(packet.diagnostic_results).forEach((result, resultIndex) => {
    array(result?.observations).forEach((_, observationIndex) => {
      refs.add(`patient_packet.diagnostic_results[${resultIndex}].observations[${observationIndex}]`);
    });
  });
  array(caseBundle?.action_map_state?.risk_outputs).forEach((row, index) => {
    if (row && typeof row.target_id === 'string' && typeof row.endpoint === 'string'
      && Number.isFinite(row.horizon_years) && Number.isFinite(row.probability)
      && typeof row.model_id === 'string' && typeof row.model_version === 'string'
      && typeof row.output_id === 'string'
      && (typeof row.projection_state === 'string'
        || row.registry_execution_provenance?.canonical_registry_execution === true)) {
      refs.add(`action_map_state.risk_outputs[${index}]`);
    }
  });
  return [...refs];
}

function contextStatus(caseBundle) {
  const packet = caseBundle?.patient_packet ?? {};
  const measurements = packet.measurements ?? {};
  const domains = [];
  if (array(packet.symptoms).length) domains.push('Symptoms');
  if (measurements.wearables && Object.keys(measurements.wearables).length) domains.push('Wearables');
  if (Object.keys(measurements).some((key) => key !== 'wearables')) domains.push('Clinical measurements');
  if (array(caseBundle?.action_map_state?.risk_outputs).length || array(caseBundle?.risk_outputs).length) domains.push('Risk outputs');
  if (caseBundle?.clinical_plan) domains.push('Care plan');
  const wearableAsOf = measurements?.wearables?.summary?.as_of;
  return {
    snapshot: packet.snapshot_date ?? wearableAsOf ?? packet.updated_at ?? 'Not emitted',
    domains,
    missingCount: array(packet.missing_data).length
  };
}

function nextId(prefix, workspace) {
  workspace.sequence = Number(workspace.sequence ?? 0) + 1;
  return `${prefix}-${workspace.patientId}-${workspace.sequence}`;
}

function replaceThread(workspace, thread) {
  workspace.threads = workspace.threads.map((candidate) => candidate.threadId === thread.threadId ? thread : candidate);
  workspace.activeThreadId = thread.threadId;
  return attachActiveThread(workspace);
}

function confidenceBand(estimate) {
  if (estimate >= 90) return 'very_high';
  if (estimate >= 70) return 'high';
  if (estimate >= 40) return 'moderate';
  return 'low';
}

function fact(row, sourceRef) {
  return {
    label: row?.label ?? row?.key ?? 'Patient fact',
    value: row?.value ?? 'Not emitted',
    units: row?.units ?? null,
    source_ref: sourceRef,
    provenance: row?.provenance ?? 'Not emitted'
  };
}

function fixtureClaim(workspace, caseBundle, thread) {
  const symptoms = array(caseBundle?.patient_packet?.symptoms);
  const fatigueIndex = symptoms.findIndex((value) => /fatigue/i.test(String(value)));
  const oxygen = measurement(caseBundle, 'overnight_spo2_nadir');
  const sleepDuration = measurement(caseBundle, 'sleep_duration');
  const vo2 = measurement(caseBundle, 'vo2max') ?? measurement(caseBundle, 'vo2_max');
  const support = [];
  const refs = [];
  if (fatigueIndex >= 0) {
    const sourceRef = `patient_packet.symptoms[${fatigueIndex}]`;
    support.push({ label: 'Reported symptom', value: symptoms[fatigueIndex], units: null, source_ref: sourceRef, provenance: 'Patient packet' });
    refs.push(sourceRef);
  }
  if (oxygen) {
    const sourceRef = 'patient_packet.measurements.wearables.overnight_spo2_nadir';
    support.push(fact(oxygen, sourceRef));
    refs.push(sourceRef);
  }
  if (!support.length) return null;
  const alternatives = vo2
    ? [`Reduced fitness reserve remains a competing explanation; ${vo2.label ?? 'VO₂ max'} is ${vo2.value} ${vo2.units ?? ''}.`.trim()]
    : ['Reduced fitness reserve cannot be assessed from the emitted packet.'];
  const contradictions = sleepDuration
    ? [`Sleep duration is emitted as ${sleepDuration.value} ${sleepDuration.units ?? ''}; duration alone does not establish sleep-disordered breathing.`.trim()]
    : ['Sleep duration is Not emitted.'];
  const claim = {
    claim_id: nextId('claim', workspace),
    thread_id: thread.threadId,
    patient_id: workspace.patientId,
    claim_type: 'hypothesis',
    statement: 'Sleep-disordered breathing could contribute to the reported fatigue, but the available wearable signal is not diagnostic.',
    confidence: {
      estimate_pct: 65,
      calibration_status: 'uncalibrated',
      band: confidenceBand(65),
      basis: 'Reported fatigue and an emitted overnight oxygen nadir support a sleep hypothesis.',
      main_uncertainty: 'A diagnostic sleep study and complete symptom timing are not emitted.'
    },
    supporting_patient_facts: support,
    contradictory_patient_facts: contradictions,
    alternative_explanations: alternatives,
    missing_information: ['Diagnostic sleep study: Not emitted', 'Complete symptom timeline: Not emitted', 'Medication timeline: Not emitted'],
    confidence_raisers: ['A diagnostic study showing sleep-disordered breathing with temporal fit to fatigue.'],
    confidence_lowerers: ['A normal diagnostic study or a better-supported competing explanation for fatigue.'],
    patient_source_refs: refs,
    evidence_refs: [],
    state: 'working',
    created_by: {
      agent_role: 'physician_colleague',
      model: 'illustrative-fixture-no-model',
      prompt_version: 'physician-colleague.v1'
    }
  };
  validateMaterialClaim(claim, workspace.contextSourceRefs);
  return claim;
}

export function createInitialAIWorkspace(caseBundle, options = {}) {
  const id = patientId(caseBundle);
  if (!id) throw new Error('AI workspace requires a patient reference.');
  const threadId = `thread-${id}-1`;
  const workspace = {
    schemaVersion: 'aleron.physician-ai-workspace.v1',
    patientId: id,
    patientDisplayName: caseBundle?.patient_packet?.display_name ?? id,
    packetHash: packetHash(caseBundle),
    packetVersion: caseBundle?.patient_packet?.packet_version ?? caseBundle?.patient_packet?.schema_version ?? 'physician_case.v1',
    fixtureMode: options.fixtureMode === true,
    providerAvailable: options.providerAvailable === true,
    providerMode: options.providerMode ?? null,
    fixtureId: options.fixtureId ?? 'physician_synthetic_case',
    contextStatus: contextStatus(caseBundle),
    contextSourceRefs: sourceRefs(caseBundle),
    activeThreadId: threadId,
    selectedClaimId: null,
    adoptionPendingClaimId: null,
    sequence: 1,
    threads: [{
      threadId,
      patientId: id,
      title: 'New conversation',
      lastActivity: options.now ?? new Date().toISOString(),
      contextPacketHash: packetHash(caseBundle),
      messages: [],
      claims: [],
      consultations: [],
      drafts: []
    }]
  };
  return attachActiveThread(workspace);
}

export function createWorkspaceRepository(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('AI workspace repository requires a storage adapter.');
  }
  const key = (id, hash) => {
    if (!id || !hash) throw new Error('AI workspace storage requires patient and packet identity.');
    return `${STORAGE_PREFIX}${encodeURIComponent(id)}:${encodeURIComponent(hash)}`;
  };
  return {
    load(id, hash) {
      const raw = storage.getItem(key(id, hash));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.patientId !== id || parsed.packetHash !== hash) throw new Error('Stored AI workspace patient or packet boundary mismatch.');
      return attachActiveThread(parsed);
    },
    save(workspace) {
      if (!workspace?.patientId) throw new Error('Cannot persist an AI workspace without a patient reference.');
      const persisted = clone(workspace);
      delete persisted.activeThread;
      storage.setItem(key(workspace.patientId, workspace.packetHash), JSON.stringify(persisted));
      return workspace;
    },
    remove(id, hash) {
      storage.removeItem(key(id, hash));
    }
  };
}

export function resumeAIWorkspace(caseBundle, repository, options = {}) {
  const seed = createInitialAIWorkspace(caseBundle, options);
  const stored = repository?.load(seed.patientId, seed.packetHash);
  if (!stored) return seed;
  if (stored.packetHash !== seed.packetHash) return seed;
  return attachActiveThread({
    ...stored,
    patientDisplayName: seed.patientDisplayName,
    packetHash: seed.packetHash,
    packetVersion: seed.packetVersion,
    fixtureMode: seed.fixtureMode,
    providerAvailable: seed.providerAvailable,
    providerMode: seed.providerMode,
    fixtureId: seed.fixtureId,
    contextStatus: seed.contextStatus,
    contextSourceRefs: seed.contextSourceRefs,
    threads: stored.threads.map((thread) => ({ ...thread, contextPacketHash: seed.packetHash }))
  });
}

export function startNewThread(inputWorkspace, options = {}) {
  const workspace = clone(inputWorkspace);
  const threadId = nextId('thread', workspace);
  const now = options.now ?? new Date().toISOString();
  workspace.threads.unshift({
    threadId,
    patientId: workspace.patientId,
    title: 'New conversation',
    lastActivity: now,
    contextPacketHash: workspace.packetHash,
    messages: [],
    claims: [],
    consultations: [],
    drafts: []
  });
  workspace.activeThreadId = threadId;
  return attachActiveThread(workspace);
}

export function selectThread(inputWorkspace, threadId) {
  const workspace = clone(inputWorkspace);
  const thread = workspace.threads.find((candidate) => candidate.threadId === threadId);
  if (!thread || thread.patientId !== workspace.patientId) throw new Error('AI thread does not belong to the selected patient.');
  workspace.activeThreadId = threadId;
  return attachActiveThread(workspace);
}

export function selectClaimForReview(inputWorkspace, claimId) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  if (!thread?.claims.some((claim) => claim.claim_id === claimId)) throw new Error('Selected claim does not belong to the active patient thread.');
  workspace.selectedClaimId = claimId;
  workspace.adoptionPendingClaimId = null;
  return attachActiveThread(workspace);
}

export function beginClaimAdoption(inputWorkspace, claimId) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim || claim.state !== 'working') throw new Error('Only a working claim can enter adoption confirmation.');
  workspace.selectedClaimId = claimId;
  workspace.adoptionPendingClaimId = claimId;
  return attachActiveThread(workspace);
}

export function cancelClaimAdoption(inputWorkspace) {
  const workspace = clone(inputWorkspace);
  workspace.adoptionPendingClaimId = null;
  return attachActiveThread(workspace);
}

export function validateMaterialClaim(claim, permittedSourceRefs) {
  if (!claim || typeof claim !== 'object') throw new Error('Material claim is required.');
  const required = ['claim_id', 'thread_id', 'patient_id', 'claim_type', 'statement', 'state', 'created_by'];
  for (const field of required) if (!claim[field]) throw new Error(`Material claim requires ${field}.`);
  if (!MATERIAL_CLAIM_TYPES.has(claim.claim_type)) throw new Error('Material claim type must be pattern, hypothesis, interpretation, or proposed_focus.');
  const confidence = claim.confidence ?? {};
  for (const field of ['estimate_pct', 'calibration_status', 'band', 'basis', 'main_uncertainty']) {
    if (confidence[field] === undefined || confidence[field] === null || confidence[field] === '') throw new Error(`Material claim confidence requires ${field}.`);
  }
  if (!Number.isFinite(confidence.estimate_pct) || confidence.estimate_pct < 0 || confidence.estimate_pct > 100) throw new Error('Material claim confidence estimate must be between 0 and 100.');
  if (confidence.calibration_status !== 'uncalibrated') throw new Error('V1 confidence must remain explicitly uncalibrated.');
  const allowed = new Set(array(permittedSourceRefs));
  if (!array(claim.patient_source_refs).length) throw new Error('Material claim requires patient source references.');
  for (const ref of claim.patient_source_refs) if (!allowed.has(ref)) throw new Error(`Material claim source reference does not resolve: ${ref}`);
  if (claim.claim_type === 'hypothesis' && !array(claim.alternative_explanations).length) throw new Error('Hypotheses require an alternative explanation or explicit no-alternative statement.');
  return true;
}

export function sendFixtureMessage(inputWorkspace, caseBundle, text, options = {}) {
  const question = String(text ?? '').trim();
  if (!question) throw new Error('Message text is required.');
  const workspace = clone(inputWorkspace);
  if (!workspace.fixtureMode) throw new Error('No AI model provider is configured for this workspace.');
  const thread = activeThread(workspace);
  if (!thread || thread.patientId !== workspace.patientId) throw new Error('Active AI thread does not match the selected patient.');
  const now = options.now ?? new Date().toISOString();
  thread.messages.push({
    message_id: nextId('message', workspace),
    role: 'physician',
    content: question,
    context_packet_hash: workspace.packetHash,
    created_at: now
  });
  const claim = fixtureClaim(workspace, caseBundle, thread);
  const content = claim
    ? `${claim.statement} The strongest current limitation is that the packet does not contain a diagnostic sleep study or a complete symptom timeline.`
    : 'No material cross-cutting pattern identified from the currently emitted fixture data.';
  thread.messages.push({
    message_id: nextId('message', workspace),
    role: 'assistant',
    content,
    responseMode: 'illustrative_fixture',
    sourceLine: FIXTURE_SOURCE_LINE,
    model: 'illustrative-fixture-no-model',
    prompt_version: 'physician-colleague.v1',
    context_packet_hash: workspace.packetHash,
    claim_ids: claim ? [claim.claim_id] : [],
    created_at: now
  });
  if (claim) thread.claims.push(claim);
  thread.title = question.length > 54 ? `${question.slice(0, 51)}...` : question;
  thread.lastActivity = now;
  return replaceThread(workspace, thread);
}

function validateProviderResponse(response, operation, workspace) {
  if (!response || typeof response !== 'object') throw new Error('Codex provider response is required.');
  if (response.operation !== operation) throw new Error('Codex provider operation does not match the requested workspace mutation.');
  if (response.model !== 'gpt-5.6-sol' || response.provider !== 'codex_subscription') {
    throw new Error('Codex provider model lineage is invalid.');
  }
  if (response.synthetic_case !== true) throw new Error('Codex provider response is not marked as a synthetic case.');
  if (response.packet_hash !== workspace.packetHash) throw new Error('Codex provider packet hash does not match the active patient context.');
  if (response.fallback_generated !== false) throw new Error('Codex provider fallback state is invalid.');
  return true;
}

function validateProviderClaim(claim, workspace, thread) {
  if (claim.thread_id !== thread.threadId || claim.patient_id !== workspace.patientId) {
    throw new Error('Codex provider claim does not belong to the active patient thread.');
  }
  if (claim.packet_hash !== workspace.packetHash) throw new Error('Codex provider claim packet hash is invalid.');
  if (claim.model !== 'gpt-5.6-sol' || claim.provider !== 'codex_subscription') {
    throw new Error('Codex provider claim lineage is invalid.');
  }
  if (claim.state !== 'working' || claim.status !== 'working') {
    throw new Error('Codex provider claims must enter the ledger as working claims.');
  }
  validateMaterialClaim(claim, workspace.contextSourceRefs);
}

export function applyProviderMessage(inputWorkspace, text, response) {
  const question = String(text ?? '').trim();
  if (!question) throw new Error('Message text is required.');
  const workspace = clone(inputWorkspace);
  validateProviderResponse(response, 'message', workspace);
  const thread = activeThread(workspace);
  if (!thread || thread.patientId !== workspace.patientId) throw new Error('Active AI thread does not match the selected patient.');
  const claims = array(response.claims);
  const requiresCrossDomainThought = requiresCrossDomainMaterialThought(question);
  if (requiresCrossDomainThought && claims.length === 0) {
    throw new Error('Codex cross-domain response requires a nonempty material thought.');
  }
  for (const claim of claims) {
    validateProviderClaim(claim, workspace, thread);
    if (requiresCrossDomainThought && new Set(array(claim.patient_source_refs)).size < 2) {
      throw new Error('Codex cross-domain thought requires at least two patient-bound source references.');
    }
    if (thread.claims.some((candidate) => candidate.claim_id === claim.claim_id)) {
      throw new Error('Codex provider returned a duplicate claim ID.');
    }
  }
  thread.messages.push({
    message_id: nextId('message', workspace),
    role: 'physician',
    content: question,
    context_packet_hash: workspace.packetHash,
    created_at: response.created_at
  });
  thread.messages.push({
    message_id: nextId('message', workspace),
    role: 'assistant',
    content: response.answer,
    responseMode: 'codex_subscription',
    sourceLine: response.source_line,
    model: response.model,
    provider: response.provider,
    prompt_version: response.prompt_version,
    context_packet_hash: workspace.packetHash,
    claim_ids: claims.map((claim) => claim.claim_id),
    created_at: response.created_at
  });
  thread.claims.push(...claims);
  thread.title = question.length > 54 ? `${question.slice(0, 51)}...` : question;
  thread.lastActivity = response.created_at;
  return replaceThread(workspace, thread);
}

export function applyProviderConsultation(inputWorkspace, claimId, response, options = {}) {
  const workspace = clone(inputWorkspace);
  validateProviderResponse(response, 'consultation', workspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim) throw new Error('Codex consultation requires a current material claim.');
  if (array(response.claims).length || !response.consultation) {
    throw new Error('Codex consultation response shape is invalid.');
  }
  const consultation = response.consultation;
  if (consultation.thread_id !== thread.threadId || consultation.context_packet_hash !== workspace.packetHash) {
    throw new Error('Codex consultation does not belong to the active patient context.');
  }
  if (consultation.model !== 'gpt-5.6-sol' || consultation.provider !== 'codex_subscription') {
    throw new Error('Codex consultation lineage is invalid.');
  }
  if (consultation.consultation_type === 'blind_second_opinion' && consultation.blinded_to_primary_answer !== true) {
    throw new Error('Blind second opinion did not preserve its information boundary.');
  }
  if (options.parentConsultationId) {
    const parent = thread.consultations.find((candidate) => candidate.consultation_id === options.parentConsultationId);
    if (!parent) throw new Error('Consultation follow-up requires its original consultation context.');
    if (parent.consultation_type !== consultation.consultation_type || parent.specialty !== consultation.specialty) {
      throw new Error('Consultation follow-up changed its attributed consultation context.');
    }
    if (parent.blinded_to_primary_answer === true && consultation.blinded_to_primary_answer !== true) {
      throw new Error('Blind consultation follow-up did not preserve its information boundary.');
    }
    consultation.parent_consultation_id = parent.consultation_id;
    consultation.consultation_context_id = parent.consultation_context_id ?? parent.consultation_id;
    consultation.is_follow_up = true;
    consultation.target_statement = parent.target_statement;
  } else {
    consultation.target_statement = claim.statement;
  }
  consultation.target_claim_id = claimId;
  thread.consultations.push(consultation);
  thread.lastActivity = consultation.created_at;
  return replaceThread(workspace, thread);
}

export function applyProviderDraft(inputWorkspace, response) {
  const workspace = clone(inputWorkspace);
  validateProviderResponse(response, 'draft', workspace);
  const thread = activeThread(workspace);
  const draft = response.draft ? clone(response.draft) : null;
  if (!draft || array(response.claims).length) throw new Error('Codex draft response shape is invalid.');
  assertClosed(draft, ['draft_id', 'draft_type', 'patient_reference', 'source_thread_id', 'source_message_id', 'adopted_claim_ids', 'source_claim_state', 'patient_context_packet_hash', 'model', 'provider', 'prompt_version', 'evidence_refs', 'physician_edit_state', 'execution_state', 'chart_write_performed', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit', 'promotion_state', 'promotion_event_id', 'promoted_at', 'created_at', 'disclosure', 'proposal_bundle', 'content', 'preserved_uncertainties'], 'Codex draft');
  if (draft.patient_reference !== workspace.patientId || draft.source_thread_id !== thread?.threadId) {
    throw new Error('Codex draft does not belong to the active patient thread.');
  }
  if (draft.patient_context_packet_hash !== workspace.packetHash) throw new Error('Codex draft packet hash is invalid.');
  if (draft.model !== 'gpt-5.6-sol' || draft.provider !== 'codex_subscription') throw new Error('Codex draft lineage is invalid.');
  if (draft.execution_state !== 'nonexecuting' || draft.chart_write_performed !== false || !['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'].every((key) => draft[key] === false)) {
    throw new Error('Codex draft violated the nonexecution boundary.');
  }
  if (draft.draft_type === 'care_plan_bundle') {
    const bundle = draft.proposal_bundle;
    assertClosed(bundle, ['schema_version', 'proposal_id', 'patient_reference', 'patient_context_packet_hash', 'source_thread_id', 'source_message_id', 'source_adopted_claim_id', 'source_claim_state', 'narrative', 'entries', 'order_note', 'lineage'], 'Care Plan proposal bundle');
    assertClosed(bundle.narrative, ['value'], 'Care Plan proposal narrative');
    assertClosed(bundle.lineage, ['model', 'prompt_version', 'evidence_refs', 'patient_source_refs'], 'Care Plan proposal lineage');
    if (!Array.isArray(bundle.entries) || !bundle.entries.length) throw new Error('Care Plan proposal entries are required.');
    for (const entry of bundle.entries) {
      assertClosed(entry, ['proposal_entry_id', 'problem', 'assessment', 'plan', 'order_intents'], 'Care Plan proposal entry');
      assertClosed(entry.problem, ['proposed_label', 'problem_kind', 'diagnostic_certainty', 'problem_list_disposition'], 'Care Plan proposal problem');
      assertClosed(entry.problem.proposed_label, ['value'], 'Care Plan proposal label');
      assertClosed(entry.assessment, ['value'], 'Care Plan proposal assessment');
      assertClosed(entry.plan, ['value'], 'Care Plan proposal plan');
      if (!Array.isArray(entry.order_intents)) throw new Error('Care Plan proposal order intents must be an array.');
      for (const order of entry.order_intents) {
        assertClosed(order, ['schema_version', 'order_intent_id', 'order_type', 'display_name', 'clinical_indication', 'catalog_test_key', 'specimen', 'priority', 'collection_method', 'timing', 'inclusion_state', 'validation_state', 'execution_state', 'can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'], 'Care Plan proposal order intent');
        if (order.execution_state !== 'nonexecuting' || !['can_execute', 'can_sign', 'can_send', 'can_transmit', 'can_commit'].every((key) => order[key] === false)) throw new Error('Care Plan proposal order intent violated the nonexecution boundary.');
      }
    }
  }
  const adoptedIds = new Set(thread.claims.filter((claim) => claim.state === 'adopted').map((claim) => claim.claim_id));
  if (!array(draft.adopted_claim_ids).length || draft.adopted_claim_ids.some((id) => !adoptedIds.has(id))) {
    throw new Error('Codex draft requires explicitly adopted claims.');
  }
  draft.source_message_id ??= [...thread.messages].reverse()
    .find((message) => array(message.claim_ids).some((id) => draft.adopted_claim_ids.includes(id)))
    ?.message_id ?? null;
  if (!draft.source_message_id) throw new Error('Codex draft source message could not be resolved.');
  if (draft.draft_type === 'care_plan_bundle') draft.proposal_bundle.source_message_id ??= draft.source_message_id;
  thread.drafts.push(draft);
  thread.lastActivity = draft.created_at;
  return replaceThread(workspace, thread);
}

function consultationFor(workspace, claim, type, options) {
  const base = {
    consultation_id: nextId('consultation', workspace),
    thread_id: claim.thread_id,
    target_claim_id: claim.claim_id,
    target_statement: claim.statement,
    consultation_type: type,
    specialty: options.specialty ?? null,
    context_packet_hash: workspace.packetHash,
    input_question: 'What clinically material explanations should be considered for the reported fatigue?',
    model: 'illustrative-fixture-no-model',
    prompt_version: `${type.replaceAll('_', '-')}.v1`,
    created_at: options.now ?? new Date().toISOString(),
    source_line: FIXTURE_SOURCE_LINE,
    evidence_refs: [],
    proposed_revision: null
  };
  if (type === 'challenge') return {
    ...base,
    blinded_to_primary_answer: false,
    information_boundary: 'Target claim and its supporting patient facts were visible.',
    position: 'Weakened: one wearable oxygen nadir and nonspecific fatigue do not establish sleep-disordered breathing.',
    confidence: { estimate_pct: 45, calibration_status: 'uncalibrated', band: 'moderate', basis: 'The signal is suggestive but not diagnostic.', main_uncertainty: 'Diagnostic sleep data are not emitted.' },
    agreement: 'weakened',
    proposed_revision: 'Sleep-disordered breathing is plausible but not established and requires additional symptom history before testing is proposed.',
    supporting_patient_facts: claim.supporting_patient_facts,
    contradictory_patient_facts: claim.contradictory_patient_facts,
    alternatives: claim.alternative_explanations,
    discriminating_information: ['Diagnostic sleep study', 'Complete symptom timeline']
  };
  if (type === 'blind_second_opinion') return {
    ...base,
    blinded_to_primary_answer: true,
    information_boundary: 'Neutral question and patient context only; the primary answer, rationale, and confidence were excluded.',
    position: 'Fatigue is plausibly multifactorial. Reduced fitness reserve and sleep-disordered breathing both deserve consideration; the current packet does not distinguish them.',
    confidence: { estimate_pct: 55, calibration_status: 'uncalibrated', band: 'moderate', basis: 'Multiple emitted signals support competing explanations.', main_uncertainty: 'Symptom and medication timing are incomplete.' },
    agreement: 'materially_qualified',
    supporting_patient_facts: [],
    contradictory_patient_facts: [],
    alternatives: claim.alternative_explanations,
    discriminating_information: ['Diagnostic sleep study', 'Exercise tolerance history', 'Medication timeline']
  };
  if (type === 'specialist') return {
    ...base,
    blinded_to_primary_answer: false,
    information_boundary: 'Full permitted patient context and target claim were visible.',
    position: `${options.specialty ?? 'Specialist'} AI lens: the sleep signal warrants diagnostic clarification, but wearable desaturation is not diagnostic.`,
    confidence: { estimate_pct: 70, calibration_status: 'uncalibrated', band: 'high', basis: 'Fatigue and overnight desaturation are concordant.', main_uncertainty: 'Formal sleep testing is not emitted.' },
    agreement: 'qualified_support',
    supporting_patient_facts: claim.supporting_patient_facts,
    contradictory_patient_facts: claim.contradictory_patient_facts,
    alternatives: claim.alternative_explanations,
    discriminating_information: ['Formal sleep testing']
  };
  if (type === 'evidence_review') return {
    ...base,
    blinded_to_primary_answer: false,
    information_boundary: 'Target claim was visible. No public evidence search was executed in fixture mode.',
    position: 'No external search was performed in illustrative fixture mode. Governed supporting evidence is Not emitted.',
    confidence: { estimate_pct: 0, calibration_status: 'uncalibrated', band: 'low', basis: 'No evidence source was admitted.', main_uncertainty: 'Evidence review requires an approved governed source or de-identified search adapter.' },
    agreement: 'unresolved',
    supporting_patient_facts: [],
    contradictory_patient_facts: [],
    alternatives: [],
    discriminating_information: ['Governed evidence review'],
    evidence_state: 'candidate_unverified'
  };
  if (type === 'action_comparison') return {
    ...base,
    blinded_to_primary_answer: false,
    information_boundary: 'Only governed Action Library candidates, emitted effects, confidence, and dispositions may be compared; no unsupported action was created or ranked.',
    position: 'No governed Action Library candidates are attached to this AI workspace, so no action comparison was performed.',
    confidence: { estimate_pct: 0, calibration_status: 'uncalibrated', band: 'low', basis: 'The consultation has no admitted governed action candidates.', main_uncertainty: 'Action Library candidates and dispositions are not emitted in this workspace.' },
    agreement: 'unresolved',
    supporting_patient_facts: [],
    contradictory_patient_facts: [],
    alternatives: [],
    discriminating_information: ['Governed Action Library candidates with effects, confidence, and dispositions']
  };
  return {
    ...base,
    blinded_to_primary_answer: false,
    information_boundary: 'Patient dates, values, units, and missingness were checked; no external evidence was used.',
    position: 'The fatigue symptom and wearable measurements are present. Medication timing and diagnostic sleep testing are Not emitted, so the claimed sequence cannot be verified.',
    confidence: { estimate_pct: 80, calibration_status: 'uncalibrated', band: 'high', basis: 'The audit reports only packet presence and absence.', main_uncertainty: 'The missing timelines prevent temporal attribution.' },
    agreement: 'unresolved',
    supporting_patient_facts: claim.supporting_patient_facts,
    contradictory_patient_facts: claim.contradictory_patient_facts,
    alternatives: [],
    discriminating_information: ['Medication start, stop, and dose changes', 'Symptom onset', 'Diagnostic sleep study']
  };
}

export function runFixtureConsultation(inputWorkspace, claimId, type, options = {}) {
  if (!CONSULTATION_TYPES.has(type)) throw new Error(`Unsupported consultation type: ${type}`);
  const workspace = clone(inputWorkspace);
  if (!workspace.fixtureMode) throw new Error('No AI model provider is configured for consultations.');
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim) throw new Error('Consultation requires a current material claim.');
  const consultation = consultationFor(workspace, claim, type, options);
  thread.consultations.push(consultation);
  thread.lastActivity = consultation.created_at;
  return { workspace: replaceThread(workspace, thread), consultation };
}

export function acceptConsultationRevision(inputWorkspace, claimId, consultationId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  const consultation = thread?.consultations.find((candidate) => candidate.consultation_id === consultationId);
  if (!claim || !consultation || consultation.target_claim_id !== claimId) throw new Error('Revision acceptance requires a consultation on the selected clinical thought.');
  if (consultation.revision_disposition) throw new Error('Consultation revision decision is already recorded.');
  const revision = String(consultation.proposed_revision ?? '').trim();
  if (!revision) throw new Error('Consultation did not propose a revision.');
  if (claim.state !== 'working') throw new Error('Only an open clinical thought can be revised.');
  if (claim.statement !== consultation.target_statement) throw new Error('Consultation revision is stale for the current clinical thought wording.');
  const now = options.now ?? new Date().toISOString();
  const actorId = options.actorId ?? 'fixture-physician';
  claim.revision_history = [...array(claim.revision_history), {
    prior_statement: claim.statement,
    revised_statement: revision,
    source_consultation_id: consultationId,
    accepted_at: now,
    accepted_by_actor_id: actorId
  }];
  claim.statement = revision;
  consultation.revision_disposition = 'accepted';
  consultation.revision_decided_at = now;
  consultation.revision_decided_by_actor_id = actorId;
  workspace.adoptionPendingClaimId = null;
  thread.lastActivity = now;
  return replaceThread(workspace, thread);
}

export function keepCurrentClaimWording(inputWorkspace, claimId, consultationId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  const consultation = thread?.consultations.find((candidate) => candidate.consultation_id === consultationId);
  if (!claim || consultation?.target_claim_id !== claimId) {
    throw new Error('Revision disposition requires a consultation on the selected clinical thought.');
  }
  if (consultation.revision_disposition) throw new Error('Consultation revision decision is already recorded.');
  if (claim.state !== 'working' || claim.statement !== consultation.target_statement) throw new Error('Consultation revision is stale for the current clinical thought wording.');
  consultation.revision_disposition = 'kept_current';
  consultation.revision_decided_at = options.now ?? new Date().toISOString();
  consultation.revision_decided_by_actor_id = options.actorId ?? 'fixture-physician';
  thread.lastActivity = consultation.revision_decided_at;
  return replaceThread(workspace, thread);
}

export function runFixtureConsultationFollowUp(inputWorkspace, consultationId, question, options = {}) {
  const followUpQuestion = String(question ?? '').trim();
  if (!followUpQuestion) throw new Error('Consultation follow-up question is required.');
  const workspace = clone(inputWorkspace);
  if (!workspace.fixtureMode) throw new Error('No AI model provider is configured for consultation follow-ups.');
  const thread = activeThread(workspace);
  const parent = thread?.consultations.find((candidate) => candidate.consultation_id === consultationId);
  if (!parent) throw new Error('Consultation follow-up requires its original consultation context.');
  const claim = thread.claims.find((candidate) => candidate.claim_id === parent.target_claim_id);
  if (!claim) throw new Error('Consultation follow-up requires the original material claim.');
  const consultation = consultationFor(workspace, claim, parent.consultation_type, { specialty: parent.specialty, now: options.now });
  consultation.target_statement = parent.target_statement;
  consultation.parent_consultation_id = parent.consultation_id;
  consultation.consultation_context_id = parent.consultation_context_id ?? parent.consultation_id;
  consultation.is_follow_up = true;
  consultation.input_question = followUpQuestion;
  consultation.position = parent.consultation_type === 'specialist'
    ? `${parent.specialty ?? 'Specialist'} AI lens follow-up: formal sleep testing remains the single most discriminating missing datum; the wearable signal alone is not diagnostic.`
    : `Follow-up from the same ${parent.consultation_type.replaceAll('_', ' ')} context: ${parent.position}`;
  thread.consultations.push(consultation);
  thread.lastActivity = consultation.created_at;
  return { workspace: replaceThread(workspace, thread), consultation };
}

export function adoptClaim(inputWorkspace, claimId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim) throw new Error('Adoption requires a current material claim.');
  if (claim.state === 'dismissed') throw new Error('A dismissed claim cannot be adopted.');
  if (workspace.adoptionPendingClaimId !== claimId || options.confirmedStatement !== claim.statement) {
    throw new Error('Adoption requires confirmation of the exact claim statement.');
  }
  claim.state = 'adopted';
  claim.adopted_at = options.now ?? new Date().toISOString();
  thread.lastActivity = claim.adopted_at;
  workspace.adoptionPendingClaimId = null;
  return replaceThread(workspace, thread);
}

export function dismissClaim(inputWorkspace, claimId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim) throw new Error('Dismissal requires a current material claim.');
  claim.state = 'dismissed';
  claim.dismissed_at = options.now ?? new Date().toISOString();
  thread.lastActivity = claim.dismissed_at;
  return replaceThread(workspace, thread);
}

export function createDraft(inputWorkspace, claimId, draftType, options = {}) {
  if (!DRAFT_TYPES.has(draftType)) throw new Error(`Unsupported draft type: ${draftType}`);
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim || claim.state !== 'adopted') throw new Error('Drafting requires an explicitly adopted conclusion.');
  const createdAt = options.now ?? new Date().toISOString();
  const draft = {
    draft_id: nextId('draft', workspace),
    draft_type: draftType,
    patient_reference: workspace.patientId,
    source_thread_id: thread.threadId,
    source_message_id: thread.messages.findLast?.((message) => array(message.claim_ids).includes(claimId))?.message_id ?? null,
    adopted_claim_ids: [claimId],
    patient_context_packet_hash: workspace.packetHash,
    model: 'illustrative-fixture-no-model',
    prompt_version: 'draft-writer.v1',
    evidence_refs: claim.evidence_refs,
    physician_edit_state: 'unedited',
    execution_state: 'nonexecuting',
    chart_write_performed: false,
    can_execute: false,
    can_sign: false,
    can_send: false,
    can_transmit: false,
    can_commit: false,
    disclosure: 'Illustrative fixture response, not model generated',
    created_at: createdAt,
    content: draftType === 'note_section'
      ? `Fatigue may be partly related to sleep-disordered breathing. Available wearable data are suggestive but not diagnostic; formal sleep testing and a complete symptom timeline are not emitted.`
      : `Evaluate the adopted sleep-related fatigue hypothesis with physician review. This draft cannot execute, transmit, sign, send, or commit.`
  };
  thread.drafts.push(draft);
  thread.lastActivity = createdAt;
  return { workspace: replaceThread(workspace, thread), draft };
}

export function createCarePlanProposalDraft(inputWorkspace, claimId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const claim = thread?.claims.find((candidate) => candidate.claim_id === claimId);
  if (!claim || claim.state !== 'adopted') throw new Error('Care Plan proposal drafting requires an explicitly adopted conclusion.');
  const existing = thread.drafts.find((draft) => draft.draft_type === 'care_plan_bundle' && array(draft.adopted_claim_ids).includes(claimId));
  if (existing) return { workspace, draft: clone(existing) };
  const createdAt = options.now ?? new Date().toISOString();
  const draftId = nextId('draft', workspace);
  const sourceMessageId = [...thread.messages].reverse()
    .find((message) => array(message.claim_ids).includes(claimId))?.message_id ?? null;
  if (!sourceMessageId) throw new Error('Care Plan proposal source message could not be resolved.');
  const draft = {
    draft_id: draftId,
    draft_type: 'care_plan_bundle',
    patient_reference: workspace.patientId,
    source_thread_id: thread.threadId,
    source_message_id: sourceMessageId,
    adopted_claim_ids: [claimId],
    source_claim_state: 'adopted',
    patient_context_packet_hash: workspace.packetHash,
    model: claim.model ?? (workspace.fixtureMode ? 'illustrative-fixture-no-model' : 'gpt-5.6-sol'),
    prompt_version: claim.prompt_version ?? 'care-plan-proposal.v1',
    evidence_refs: array(claim.evidence_refs),
    physician_edit_state: 'unedited',
    execution_state: 'nonexecuting',
    chart_write_performed: false,
    can_execute: false,
    can_sign: false,
    can_send: false,
    can_transmit: false,
    can_commit: false,
    promotion_state: 'ready_for_promotion',
    promotion_event_id: null,
    promoted_at: null,
    created_at: createdAt,
    disclosure: workspace.fixtureMode ? 'Illustrative fixture response, not model generated' : 'AI-generated draft for physician review',
    proposal_bundle: {
      schema_version: 'care_plan_ai_proposal_bundle.v1',
      proposal_id: `proposal-${draftId}`,
      patient_reference: workspace.patientId,
      patient_context_packet_hash: workspace.packetHash,
      source_thread_id: thread.threadId,
      source_message_id: sourceMessageId,
      source_adopted_claim_id: claimId,
      source_claim_state: 'adopted',
      narrative: { value: claim.statement },
      entries: [{
        proposal_entry_id: `proposal-entry-${draftId}`,
        problem: {
          proposed_label: { value: 'Adopted conclusion under evaluation' },
          problem_kind: 'issue_under_evaluation',
          diagnostic_certainty: 'provisional',
          problem_list_disposition: 'note_only'
        },
        assessment: { value: claim.statement },
        plan: { value: 'Illustrative preproduction follow-up is proposed for physician review and editing. Nothing is ordered, transmitted, signed, or written natively.' },
        order_intents: [{
          schema_version: 'order_intent.v1',
          order_intent_id: `order-intent-${draftId}-cbc`,
          order_type: 'blood_laboratory',
          display_name: 'Complete blood count',
          clinical_indication: 'Illustrative preproduction follow-up for the adopted cross-domain claim; physician review required.',
          catalog_test_key: 'QUEST:CBC-6399',
          specimen: 'blood',
          priority: 'routine',
          collection_method: 'Patient service center',
          timing: 'Within 14 days if adopted by the physician',
          inclusion_state: 'included',
          validation_state: 'valid',
          execution_state: 'nonexecuting',
          can_execute: false,
          can_sign: false,
          can_send: false,
          can_transmit: false,
          can_commit: false
        }]
      }],
      order_note: 'Illustrative preproduction order intent for workflow review only. No order is placed, transmitted, signed, sent, or committed.',
      lineage: {
        model: claim.model ?? (workspace.fixtureMode ? 'illustrative-fixture-no-model' : 'gpt-5.6-sol'),
        prompt_version: claim.prompt_version ?? 'care-plan-proposal.v1',
        evidence_refs: array(claim.evidence_refs),
        patient_source_refs: array(claim.patient_source_refs)
      }
    }
  };
  thread.drafts.push(draft);
  thread.lastActivity = createdAt;
  return { workspace: replaceThread(workspace, thread), draft: clone(draft) };
}

export function markCarePlanProposalPromoted(inputWorkspace, draftId, promotionEventId, options = {}) {
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const draft = thread?.drafts.find((candidate) => candidate.draft_id === draftId);
  if (!draft || draft.draft_type !== 'care_plan_bundle') throw new Error('Care Plan proposal draft was not found.');
  if (draft.promotion_state === 'promoted') {
    if (draft.promotion_event_id !== promotionEventId) throw new Error('Care Plan proposal was already promoted by another event.');
    return workspace;
  }
  draft.promotion_state = 'promoted';
  draft.promotion_event_id = promotionEventId;
  draft.promoted_at = options.now ?? new Date().toISOString();
  thread.lastActivity = draft.promoted_at;
  return replaceThread(workspace, thread);
}

export function updateDraftContent(inputWorkspace, draftId, content, options = {}) {
  const nextContent = String(content ?? '').trim();
  if (!nextContent) throw new Error('Draft content is required.');
  const workspace = clone(inputWorkspace);
  const thread = activeThread(workspace);
  const draft = thread?.drafts.find((candidate) => candidate.draft_id === draftId);
  if (!draft) throw new Error('Draft does not belong to the active patient thread.');
  if (draft.execution_state !== 'nonexecuting' || draft.chart_write_performed !== false) {
    throw new Error('Only a nonexecuting, non-chart-writing draft can be edited.');
  }
  draft.content = nextContent;
  draft.physician_edit_state = 'edited';
  draft.edited_at = options.now ?? new Date().toISOString();
  thread.lastActivity = draft.edited_at;
  return replaceThread(workspace, thread);
}

export function buildCandidateEvidenceQuery({ concepts, patientIdentifiers = [] }) {
  const identifiers = array(patientIdentifiers).map((value) => String(value).trim()).filter(Boolean);
  const safeConcepts = array(concepts).map((value) => String(value).trim()).filter(Boolean).filter((concept) => (
    !identifiers.some((identifier) => concept.toLowerCase().includes(identifier.toLowerCase()))
  ));
  return safeConcepts.join(' AND ');
}

export { FIXTURE_SOURCE_LINE };
