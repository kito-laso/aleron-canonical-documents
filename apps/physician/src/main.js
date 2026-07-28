/*
Design brief: This screen is for a physician determining whether canonical analysis is complete enough to begin case review and release. The one thing it must answer first is whether the case is review-ready and, if not, exactly which blocker prevents action. Shape carries one bounded status group, color carries only semantic status emphasis, weight carries status before detail, and position places the gate directly above Care Plan controls.
*/
import {
  createStructuredEdit,
  getActiveCase,
  getCarePlanBackendClient,
  getPhysicianBundle,
  getPhysicianAIBackendClient,
  persistStructuredEdit,
  requestFinalRelease,
  requestPhysicianAuthorization,
  requestReleasePreview,
  startPhysicianReview
} from './apiClient.js?v=physician-ai-care-plan-v7';
import { adaptBackendThreadWorkspace, applyLocalDraftEdit } from './aiColleagueBackend.js?v=physician-ai-care-plan-v7';
import {
  adaptPhysicianCase,
  artifactBindsCurrentLineage,
  buildFixtureReleasePreview,
  buildReleasePreviewRequest,
  createPatientReleaseReceipt,
  exactReleaseAuthorizationEvidence,
  patientReleaseReceiptIsValid,
  releaseIdentifier,
  releasePackageMatchesAuthorizationEvidence,
  releasePreviewAliasesAreConsistent
} from './dashboardAdapter.js?v=physician-ai-care-plan-v7';
import { decisionReasonOptionsHTML, renderDashboard, renderEmptyStaging, renderFatalError } from './dashboardApp.js?v=physician-ai-care-plan-v7';
import {
  acceptConsultationRevision,
  adoptClaim,
  applyProviderConsultation,
  applyProviderDraft,
  applyProviderMessage,
  beginClaimAdoption,
  cancelClaimAdoption,
  createCarePlanProposalDraft,
  createDraft,
  createWorkspaceRepository,
  dismissClaim,
  keepCurrentClaimWording,
  markCarePlanProposalPromoted,
  resumeAIWorkspace,
  runFixtureConsultationFollowUp,
  runFixtureConsultation,
  selectClaimForReview,
  selectThread,
  sendFixtureMessage,
  startNewThread,
  updateDraftContent
} from './aiColleague.js?v=physician-ai-care-plan-v7';
import {
  buildConsultationFollowUpQuestion,
  buildCodexProviderRequest,
  codexModeFromLocation,
  createCodexSubscriptionProvider
} from './aiColleagueProvider.js?v=physician-ai-care-plan-v7';
import { createSyntheticCarePlanStore } from './carePlanWorkflow.js?v=physician-ai-care-plan-v7';
import { adaptCarePlanBackendState, isPublicStagingLocation, payloadFromCarePlanState, usesLocalCarePlanStore } from './carePlanBackend.js?v=physician-ai-care-plan-v7';
import { createReviewReleaseSessionRepository } from './reviewReleaseSession.js?v=physician-ai-care-plan-v7';

const app = document.querySelector('#app');
const state = {
  activePatientId: null,
  activeCase: null,
  activeTab: 'patient-data',
  screeningMode: 'list',
  screeningYear: null,
  selectedRiskId: null,
  selectedRiskDomain: null,
  selectedRiskAction: null,
  selectedModelPane: 'models',
  actionSpaceFilter: 'all',
  selectedActionSpaceItemId: null,
  selectedVitalityInstrumentId: null,
  selectedPlanItemId: null,
  queue: [],
  source: 'backend',
  reviewStarted: false,
  releasePackage: null,
  workflowStatus: null,
  workflowError: null,
  aiWorkspace: null,
  aiError: null,
  carePlanState: null,
  carePlanError: null,
  carePlanLockConfirmationPending: false,
  carePlanPendingEditMode: false,
  carePlanHighlightedEntryId: null
};

function selectedTask() {
  return state.queue.find((task) => task.patient_id === state.activePatientId) ?? null;
}

function analysisReady() {
  return state.activeCase?.analysis_status?.status === 'completed'
    && state.activeCase?.readiness?.ready_for_review === true;
}

function requireAnalysisReady() {
  if (!analysisReady()) throw new Error('Canonical analysis must be review-ready before physician review or release actions.');
}

function requireReviewStarted() {
  if (!state.reviewStarted) throw new Error('Start the current physician review before release actions.');
}

function currentReleaseLinkage(caseBundle) {
  return {
    patient_id: caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id,
    source_plan_id: caseBundle?.clinical_plan?.plan_id,
    source_engine_run_id: caseBundle?.engine_run?.run_id,
    source_action_map_state_id: caseBundle?.action_map_state?.action_map_state_id
  };
}

function releasePackageIsCurrent(caseBundle, releasePackage) {
  if (!releasePackage || typeof releasePackage !== 'object') return false;
  const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  return releasePackage.patient_id === patientId
    && artifactBindsCurrentLineage(caseBundle, releasePackage)
    && releasePreviewAliasesAreConsistent(caseBundle, releasePackage);
}

function inferReviewStarted() {
  const packetId = state.activeCase?.patient_packet?.packet_id;
  const runId = state.activeCase?.engine_run?.run_id;
  const task = selectedTask();
  const currentTask = Boolean(packetId && runId && task?.packet_id === packetId && task?.source_engine_run_id === runId);
  const lifecycleActive = ['physician_review_started', 'physician_reviewing', 'plan_editing', 'plan_authorized', 'released_to_patient'].includes(task?.lifecycle_state);
  const persistedReview = state.activeCase?.review_history?.some((review) => (
    review.packet_id === packetId
    && review.source_engine_run_id === runId
    && ['started', 'released'].includes(review.status)
  ));
  state.reviewStarted = Boolean(analysisReady() && (persistedReview || (currentTask && lifecycleActive)));
}

function aiCodexMode() {
  if (typeof window === 'undefined') return false;
  return codexModeFromLocation(window.location);
}

function aiFixtureMode() {
  if (typeof window === 'undefined') return false;
  const params = new URL(window.location.href).searchParams;
  return params.get('fixture') === '1' && !aiCodexMode();
}

function aiBackendMode() {
  return !aiFixtureMode() && !aiCodexMode();
}

function aiRepository() {
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('Aleron AI F1 persistence requires browser localStorage.');
  return createWorkspaceRepository(window.localStorage);
}

function reviewReleaseSessionRepository() {
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('F1 review/release persistence requires browser localStorage.');
  return createReviewReleaseSessionRepository(window.localStorage);
}

function usesReviewReleaseSessionPersistence() {
  return aiFixtureMode() || aiCodexMode();
}

function persistCurrentReviewReleaseSession() {
  if (!usesReviewReleaseSessionPersistence() || !state.activeCase) return;
  reviewReleaseSessionRepository().save(state.activeCase, {
    reviewStarted: state.reviewStarted,
    releasePackage: state.releasePackage
  });
}

function createAIProviderSessionId() {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `session-${value.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

const aiProviderSessionId = createAIProviderSessionId();
let aiCodexProvider = null;
const aiLocalDraftEdits = new Map();
let carePlanStore = null;
let carePlanClient = null;
let carePlanAutosaveTimer = null;
let carePlanSaveInFlight = null;
const carePlanPendingChanges = new Map();
let carePlanSessionEpoch = 0;
let carePlanPromotionPending = false;
const carePlanPhysician = { actor_type: 'physician', actor_id: 'physician-synthetic-1', authorized: true };

function carePlanBackendMode() {
  if (typeof window === 'undefined') return false;
  return !usesLocalCarePlanStore(window.location, aiFixtureMode(), aiCodexMode());
}

function codexProvider() {
  aiCodexProvider ??= createCodexSubscriptionProvider({ sessionId: aiProviderSessionId });
  return aiCodexProvider;
}

async function initializeAIWorkspace(caseBundle) {
  if (aiBackendMode()) {
    const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
    if (!patientId) throw new Error('Backend physician AI workspace requires the selected patient ID.');
    const client = getPhysicianAIBackendClient();
    const listed = await client.listThreads(patientId);
    if (listed.patient_id !== patientId || !Array.isArray(listed.threads)) throw new Error('Backend physician AI thread list does not match the selected patient.');
    let threads = listed.threads;
    let selectedId = threads[0]?.thread_id ?? null;
    if (!selectedId) {
      const created = await client.createThread(patientId, 'New conversation');
      if (!created.thread) throw new Error('Backend physician AI thread creation returned no aggregate.');
      selectedId = created.thread.thread_id;
      threads = [created.thread];
    }
    const loaded = await client.getThread(patientId, selectedId);
    if (!loaded.thread) throw new Error('Backend physician AI thread load returned no aggregate.');
    threads = [loaded.thread, ...threads.filter((thread) => thread.thread_id !== selectedId)];
    return adaptBackendThreadWorkspace(caseBundle, threads, selectedId, { localDraftEdits: aiLocalDraftEdits });
  }
  const codexMode = aiCodexMode();
  const workspace = resumeAIWorkspace(caseBundle, aiRepository(), {
    fixtureMode: aiFixtureMode(),
    providerAvailable: codexMode,
    providerMode: codexMode ? 'codex_subscription' : null
  });
  aiRepository().save(workspace);
  return workspace;
}

function persistAIWorkspace(workspace) {
  state.aiWorkspace = {
    ...workspace,
    providerPending: false,
    providerError: null
  };
  state.aiError = null;
  if (!aiBackendMode()) aiRepository().save(state.aiWorkspace);
  render();
}

function focusAI(selector) {
  queueMicrotask(() => {
    const target = document.querySelector(selector);
    if (typeof target?.focus === 'function') target.focus();
  });
}

function focusAIThread(threadId) {
  queueMicrotask(() => {
    const target = [...document.querySelectorAll('.ai-conference-recent [data-ai-thread]')]
      .find((candidate) => candidate.dataset.aiThread === threadId);
    if (typeof target?.focus === 'function') target.focus();
  });
}

function focusAIClaim(claimId) {
  queueMicrotask(() => {
    const target = [...document.querySelectorAll('[data-ai-clinical-thought]')]
      .find((candidate) => candidate.dataset.aiClinicalThought === claimId);
    if (typeof target?.focus === 'function') target.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
}

function focusAIConsultation(consultationId) {
  queueMicrotask(() => {
    const target = [...document.querySelectorAll('[data-ai-consultation-result]')]
      .find((candidate) => candidate.dataset.aiConsultationResult === consultationId);
    if (typeof target?.focus === 'function') target.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  });
}

function adoptBackendAIThread(thread) {
  const prior = state.aiWorkspace;
  const threads = [thread, ...(prior?.threads ?? [])
    .filter((candidate) => candidate.threadId !== thread.thread_id)
    .map((candidate) => candidate.backendAggregate)
    .filter(Boolean)];
  state.aiWorkspace = {
    ...adaptBackendThreadWorkspace(state.activeCase, threads, thread.thread_id, {
      localDraftEdits: aiLocalDraftEdits,
      selectedClaimId: prior?.selectedClaimId,
      adoptionPendingClaimId: prior?.adoptionPendingClaimId
    }),
    discussingClaimId: prior?.discussingClaimId ?? null,
    consultationRuns: prior?.consultationRuns ?? []
  };
  state.aiError = null;
  render();
}

function setAIProviderPending() {
  if (state.aiWorkspace?.providerPending) throw new Error('One Codex request is already in flight for this local session.');
  state.aiWorkspace = {
    ...state.aiWorkspace,
    providerPending: true,
    providerError: null
  };
  render();
}

function setAIConsultationRun(claimId, consultationType, status, error = null) {
  const prior = state.aiWorkspace?.consultationRuns ?? [];
  const retained = prior.filter((run) =>
    run.claim_id !== claimId || run.consultation_type !== consultationType
  );
  state.aiWorkspace = {
    ...state.aiWorkspace,
    consultationRuns: status === 'completed' ? retained : [...retained, {
      claim_id: claimId,
      consultation_type: consultationType,
      status,
      error
    }]
  };
  render();
}

function failAI(error) {
  const message = error?.message ?? 'AI operation failed. No fallback answer was generated.';
  state.aiError = message;
  state.aiWorkspace = {
    ...state.aiWorkspace,
    providerPending: false,
    providerError: message
  };
  render();
}

function activeAIThread() {
  return state.aiWorkspace?.threads?.find((thread) => thread.threadId === state.aiWorkspace.activeThreadId) ?? null;
}

function activeAIClaim(claimId) {
  return activeAIThread()?.claims?.find((claim) => claim.claim_id === claimId) ?? null;
}

function activeAIConsultation(consultationId) {
  return activeAIThread()?.consultations?.find((consultation) => consultation.consultation_id === consultationId) ?? null;
}

function neutralConsultationQuestion() {
  const messages = activeAIThread()?.messages ?? [];
  return [...messages].reverse().find((message) => message.role === 'physician')?.content
    ?? 'What clinically material explanations should be considered from the emitted patient context?';
}

async function sendAIMessage(message) {
  if (aiFixtureMode()) {
    persistAIWorkspace(sendFixtureMessage(state.aiWorkspace, state.activeCase, message));
    return;
  }
  if (aiBackendMode()) {
    const thread = activeAIThread();
    if (!thread) throw new Error('Backend physician AI message requires an active patient thread.');
    setAIProviderPending();
    const result = await getPhysicianAIBackendClient().sendMessage(state.activePatientId, thread.threadId, message, state.aiWorkspace.packetHash);
    if (!result.thread) throw new Error('Backend physician AI message returned no aggregate.');
    adoptBackendAIThread(result.thread);
    return;
  }
  setAIProviderPending();
  const response = await codexProvider().send(buildCodexProviderRequest({
    workspace: state.aiWorkspace,
    operation: 'message',
    question: message,
    sessionId: aiProviderSessionId
  }));
  persistAIWorkspace(applyProviderMessage(state.aiWorkspace, message, response));
}

async function runAIConsultation(claimId, consultationType, specialty) {
  setAIConsultationRun(claimId, consultationType, 'running');
  if (aiFixtureMode()) {
    const result = runFixtureConsultation(state.aiWorkspace, claimId, consultationType, { specialty });
    persistAIWorkspace(result.workspace);
    setAIConsultationRun(claimId, consultationType, 'completed');
    return;
  }
  const targetClaim = activeAIClaim(claimId);
  if (!targetClaim) throw new Error('Consultation requires a current material claim.');
  if (aiBackendMode()) {
    const result = await getPhysicianAIBackendClient().createConsultation(
      state.activePatientId,
      activeAIThread().threadId,
      claimId,
      consultationType,
      { specialty, neutralQuestion: neutralConsultationQuestion() }
    );
    if (!result.thread) throw new Error('Backend physician AI consultation returned no aggregate.');
    adoptBackendAIThread(result.thread);
    setAIConsultationRun(claimId, consultationType, 'completed');
    return;
  }
  const response = await codexProvider().send(buildCodexProviderRequest({
    workspace: state.aiWorkspace,
    operation: 'consultation',
    consultationType,
    specialty,
    targetClaim,
    question: neutralConsultationQuestion(),
    sessionId: aiProviderSessionId
  }));
  persistAIWorkspace(applyProviderConsultation(state.aiWorkspace, claimId, response));
  setAIConsultationRun(claimId, consultationType, 'completed');
}

async function decideAIConsultationRevision(claimId, consultationId, action) {
  if (!aiBackendMode()) {
    const next = action === 'accept_revision'
      ? acceptConsultationRevision(state.aiWorkspace, claimId, consultationId)
      : keepCurrentClaimWording(state.aiWorkspace, claimId, consultationId);
    persistAIWorkspace(next);
    return;
  }
  const claim = activeAIClaim(claimId);
  const consultation = activeAIThread()?.consultations?.find((item) => item.consultation_id === consultationId);
  if (!claim || !consultation || consultation.target_claim_id !== claimId) throw new Error('Revision decision requires the selected consultation and clinical thought.');
  setAIProviderPending();
  const result = await getPhysicianAIBackendClient().decideRevision(
    state.activePatientId,
    activeAIThread().threadId,
    claimId,
    consultationId,
    action,
    claim.statement,
    consultation.proposed_revision ?? null
  );
  if (!result.thread) throw new Error('Backend physician AI revision decision returned no aggregate.');
  adoptBackendAIThread(result.thread);
}

async function runAIConsultationFollowUp(consultationId, question) {
  const parent = activeAIConsultation(consultationId);
  if (!parent) throw new Error('Consultation follow-up requires its original consultation context.');
  if (aiFixtureMode()) {
    persistAIWorkspace(runFixtureConsultationFollowUp(state.aiWorkspace, consultationId, question).workspace);
    return;
  }
  const targetClaim = activeAIClaim(parent.target_claim_id);
  if (!targetClaim) throw new Error('Consultation follow-up requires the original material claim.');
  if (aiBackendMode()) {
    setAIProviderPending();
    const result = await getPhysicianAIBackendClient().createConsultation(
      state.activePatientId,
      activeAIThread().threadId,
      parent.target_claim_id,
      parent.consultation_type,
      {
        specialty: parent.specialty,
        neutralQuestion: question,
        parentConsultationId: consultationId
      }
    );
    if (!result.thread) throw new Error('Backend physician AI consultation follow-up returned no aggregate.');
    adoptBackendAIThread(result.thread);
    return;
  }
  setAIProviderPending();
  const response = await codexProvider().send(buildCodexProviderRequest({
    workspace: state.aiWorkspace,
    operation: 'consultation',
    consultationType: parent.consultation_type,
    specialty: parent.specialty,
    targetClaim,
    question: buildConsultationFollowUpQuestion(parent, question),
    sessionId: aiProviderSessionId
  }));
  persistAIWorkspace(applyProviderConsultation(state.aiWorkspace, parent.target_claim_id, response, { parentConsultationId: consultationId }));
}

async function createAIDraft(claimId, draftType) {
  if (aiFixtureMode()) {
    persistAIWorkspace(createDraft(state.aiWorkspace, claimId, draftType).workspace);
    return;
  }
  const targetClaim = activeAIClaim(claimId);
  if (!targetClaim || targetClaim.state !== 'adopted') throw new Error('Drafting requires an explicitly adopted conclusion.');
  if (aiBackendMode()) {
    setAIProviderPending();
    const result = await getPhysicianAIBackendClient().createDraft(state.activePatientId, activeAIThread().threadId, claimId, draftType);
    if (!result.thread) throw new Error('Backend physician AI draft returned no aggregate.');
    adoptBackendAIThread(result.thread);
    return;
  }
  setAIProviderPending();
  const response = await codexProvider().send(buildCodexProviderRequest({
    workspace: state.aiWorkspace,
    operation: 'draft',
    draftType,
    adoptedClaims: [targetClaim],
    sessionId: aiProviderSessionId
  }));
  persistAIWorkspace(applyProviderDraft(state.aiWorkspace, response));
}

async function createAutomaticCarePlanProposal(claimId) {
  if (aiFixtureMode()) {
    persistAIWorkspace(createCarePlanProposalDraft(state.aiWorkspace, claimId).workspace);
    return;
  }
  if (aiBackendMode()) {
    setAIProviderPending();
    const drafted = await getPhysicianAIBackendClient().createDraft(
      state.activePatientId,
      activeAIThread().threadId,
      claimId,
      'care_plan_bundle'
    );
    if (!drafted.thread) throw new Error('Backend Care Plan proposal drafting returned no aggregate.');
    adoptBackendAIThread(drafted.thread);
    return;
  }
  const adoptedClaim = activeAIClaim(claimId);
  if (!adoptedClaim || adoptedClaim.state !== 'adopted') throw new Error('Care Plan proposal drafting requires an explicitly adopted conclusion.');
  const existing = activeAIThread()?.drafts.find((draft) => draft.draft_type === 'care_plan_bundle' && draft.adopted_claim_ids?.includes(claimId));
  if (existing) return;
  setAIProviderPending();
  const response = await codexProvider().send(buildCodexProviderRequest({
    workspace: state.aiWorkspace,
    operation: 'draft',
    draftType: 'care_plan_bundle',
    adoptedClaims: [adoptedClaim],
    sessionId: aiProviderSessionId
  }));
  persistAIWorkspace(applyProviderDraft(state.aiWorkspace, response));
}

function resetCarePlanSession() {
  clearTimeout(carePlanAutosaveTimer);
  carePlanAutosaveTimer = null;
  carePlanPendingChanges.clear();
  carePlanSessionEpoch += 1;
  carePlanPromotionPending = false;
}

async function adoptCase(caseBundle) {
  const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  const switchingPatient = Boolean(state.activePatientId && patientId && state.activePatientId !== patientId);
  const aiWorkspace = await initializeAIWorkspace(caseBundle);
  const switchingPacket = Boolean(state.aiWorkspace?.packetHash && state.aiWorkspace.packetHash !== aiWorkspace.packetHash);
  const switchingContext = switchingPatient || switchingPacket;
  if (switchingContext && (carePlanPendingChanges.size || carePlanSaveInFlight)) {
    const saved = await flushCarePlanChanges();
    if (!saved) throw new Error('Save the current Care Plan before loading a different patient-state packet.');
  }
  const persistedReviewRelease = usesReviewReleaseSessionPersistence()
    ? reviewReleaseSessionRepository().load(caseBundle)
    : null;
  const releasePackage = persistedReviewRelease
    ? persistedReviewRelease.releasePackage
    : caseBundle?.release_preview ?? caseBundle?.release_package ?? null;
  let nextCarePlanStore = carePlanStore;
  let nextCarePlanClient = carePlanClient;
  let nextCarePlanState;
  if (aiFixtureMode() || aiCodexMode()) {
    const storedCarePlan = nextCarePlanStore?.getState?.();
    if (switchingPatient || !nextCarePlanStore || storedCarePlan?.patient_reference !== aiWorkspace.patientId || storedCarePlan?.packet_hash !== aiWorkspace.packetHash) {
      const clinicalPlan = caseBundle?.clinical_plan ?? {};
      const carePlanEmitted = ['required_items', 'recommended_next_steps', 'non_required_next_steps']
        .some((key) => Array.isArray(clinicalPlan[key]) && clinicalPlan[key].length > 0);
      nextCarePlanStore = createSyntheticCarePlanStore({
        storage: window.localStorage,
        patientId: aiWorkspace.patientId,
        packetHash: aiWorkspace.packetHash,
        empty: !carePlanEmitted,
        forceNextConflict: new URL(window.location.href).searchParams.get('care_plan_conflict') === '1'
      });
    }
    nextCarePlanClient = null;
    nextCarePlanState = nextCarePlanStore.getState();
  } else if (isPublicStagingLocation(window.location)) {
    nextCarePlanStore = createSyntheticCarePlanStore({
      storage: window.localStorage,
      patientId: aiWorkspace.patientId,
      packetHash: aiWorkspace.packetHash,
      empty: true,
      hydrate: true
    });
    nextCarePlanClient = null;
    nextCarePlanState = nextCarePlanStore.getState();
  } else {
    nextCarePlanClient = getCarePlanBackendClient();
    const current = await nextCarePlanClient.current(null, patientId);
    nextCarePlanState = adaptCarePlanBackendState(current, switchingContext ? null : state.carePlanState, patientId, aiWorkspace.packetHash);
    nextCarePlanStore = null;
  }
  if (switchingContext) resetCarePlanSession();
  state.activeCase = caseBundle;
  state.releasePackage = releasePackageIsCurrent(caseBundle, releasePackage) ? releasePackage : null;
  if (patientId) state.activePatientId = patientId;
  state.aiWorkspace = aiWorkspace;
  state.aiError = null;
  carePlanStore = nextCarePlanStore;
  carePlanClient = nextCarePlanClient;
  state.carePlanState = nextCarePlanState;
  state.carePlanError = null;
  if (persistedReviewRelease) {
    state.reviewStarted = persistedReviewRelease.reviewStarted;
  } else {
    inferReviewStarted();
  }
}

async function loadCase(patientId) {
  state.workflowError = null;
  if (state.activePatientId && patientId !== state.activePatientId && (carePlanPendingChanges.size || carePlanSaveInFlight)) {
    const saved = await flushCarePlanChanges();
    if (!saved) throw new Error('Save the current patient Care Plan before switching patients.');
  }
  const caseBundle = await getActiveCase(patientId);
  await adoptCase(caseBundle);
}

async function refreshFromBackend() {
  const bundle = await getPhysicianBundle(state.activePatientId);
  state.queue = bundle.queue ?? state.queue;
  state.source = bundle.source ?? state.source;
  if (bundle.case) await adoptCase(bundle.case);
}

function setBusyStatus(message) {
  state.workflowStatus = message;
  state.workflowError = null;
  render();
}

function fail(error, fallback) {
  state.workflowError = error?.message ?? fallback;
  state.workflowStatus = null;
  render();
}

async function saveDecision(form, actionOverride = null) {
  requireAnalysisReady();
  if (!state.reviewStarted) throw new Error('Start review before recording a physician decision.');
  const data = new FormData(form);
  const action = actionOverride ?? data.get('action') ?? 'approve';
  const value = data.get('value') || null;
  const reasonCode = data.get('reason_code') || data.get(`reason_code_${action}`);
  const itemId = form.dataset.editItem || null;
  const isAdd = action === 'add_problem' || action === 'add_order';
  const edit = createStructuredEdit({
    itemId,
    field: isAdd ? 'title' : action === 'modify' ? 'action_phrase' : null,
    value,
    action,
    reasonCode,
    reason: data.get('reason')
  });
  setBusyStatus('Saving structured physician decision…');
  const persisted = await persistStructuredEdit(state.activeCase.clinical_plan.plan_id, edit);
  if (state.source === 'backend') {
    await refreshFromBackend();
  } else {
    state.activeCase.structured_overrides = [...(state.activeCase.structured_overrides ?? []), { ...edit, override_id: persisted?.override_id ?? `fixture-${Date.now()}` }];
  }
  state.workflowStatus = persisted ? 'Structured physician decision saved and case refreshed.' : 'Fixture decision recorded for this test session.';
  render();
}

function applyCarePlanResult(result, fallback = 'Care Plan operation failed.') {
  if (!result?.ok && state.carePlanState?.source !== 'backend') {
    const code = result?.error ?? fallback;
    const failedState = result?.state ?? state.carePlanState;
    state.carePlanError = code;
    state.carePlanState = {
      ...failedState,
      persistence_state: result?.status === 409 ? 'conflict' : 'save_failed',
      conflict: result?.status === 409 ? { code, last_safe_persisted_revision: failedState?.server_revision ?? null } : null,
      ui_error: result?.status === 409
        ? `Conflict: ${code}. Reload the current revision before continuing.`
        : `${code}. The note remains unlocked at the last acknowledged revision.`
    };
    render();
    return false;
  }
  state.carePlanState = result?.state ?? result;
  state.carePlanError = null;
  render();
  return true;
}

function failCarePlan(error, fallback = 'Care Plan operation failed.') {
  const code = error?.code ?? error?.backend?.error ?? error?.message ?? fallback;
  state.carePlanError = code;
  if (state.carePlanState) {
    state.carePlanState = {
      ...state.carePlanState,
      persistence_state: error?.status === 409 ? 'conflict' : 'save_failed',
      conflict: error?.status === 409 ? { code, last_safe_persisted_revision: error.lastSafePersistedRevision } : null,
      ui_error: error?.status === 409
        ? `Conflict: ${code}. Reload the server revision before continuing.`
        : `${code}. The note remains unlocked at the last acknowledged server revision.`
    };
  }
  render();
  return false;
}

function carePlanEntryIndex(entryId) {
  return state.carePlanState?.entries?.findIndex((entry) => entry.entry_id === entryId) ?? -1;
}

function setCarePlanPath(target, path, value) {
  const parts = path.split('.');
  let current = target;
  for (const key of parts.slice(0, -1)) current = current[Number.isInteger(Number(key)) ? Number(key) : key];
  current[parts.at(-1)] = value;
}

function queueCarePlanChange(path, value) {
  if (state.carePlanState?.persistence_state === 'conflict') return;
  carePlanPendingChanges.set(path, value);
  clearTimeout(carePlanAutosaveTimer);
  state.carePlanState = { ...state.carePlanState, persistence_state: 'dirty' };
  carePlanAutosaveTimer = setTimeout(() => { void flushCarePlanChanges(); }, 1000);
}

async function flushCarePlanChanges() {
  clearTimeout(carePlanAutosaveTimer);
  if (carePlanSaveInFlight) {
    const priorSaved = await carePlanSaveInFlight;
    if (!priorSaved) return false;
    return carePlanPendingChanges.size ? flushCarePlanChanges() : true;
  }
  if (!carePlanPendingChanges.size) return true;
  const operation = performCarePlanFlush();
  carePlanSaveInFlight = operation;
  try {
    return await operation;
  } finally {
    if (carePlanSaveInFlight === operation) carePlanSaveInFlight = null;
  }
}

async function performCarePlanFlush() {
  clearTimeout(carePlanAutosaveTimer);
  if (!carePlanPendingChanges.size) return true;
  const sessionEpoch = carePlanSessionEpoch;
  const patientReference = state.activePatientId;
  const changes = [...carePlanPendingChanges].map(([path, value]) => ({ path, value }));
  carePlanPendingChanges.clear();
  if (!carePlanBackendMode()) {
    const current = carePlanStore.getState();
    if (current.patient_reference !== patientReference || sessionEpoch !== carePlanSessionEpoch) return false;
    return applyCarePlanResult(carePlanStore.saveDraft({
      base_server_revision: current.server_revision,
      client_revision: current.client_revision + 1,
      idempotency_key: `care-plan-save-${current.server_revision}-${Date.now()}`,
      actor: carePlanPhysician,
      changes
    }), 'Draft save failed.');
  }
  const prior = structuredClone(state.carePlanState);
  try {
    for (const change of changes) setCarePlanPath(prior, change.path, structuredClone(change.value));
    prior.persistence_state = 'saving';
    state.carePlanState = prior;
    render();
    const nextPayload = payloadFromCarePlanState(prior);
    const saved = await carePlanClient.save(prior.backend_record, nextPayload, prior);
    if (sessionEpoch !== carePlanSessionEpoch || state.activePatientId !== patientReference) return false;
    state.carePlanState = saved.state;
    state.carePlanError = null;
    render();
    return true;
  } catch (error) {
    if (sessionEpoch === carePlanSessionEpoch && state.activePatientId === patientReference) for (const change of changes) carePlanPendingChanges.set(change.path, change.value);
    return failCarePlan(error, 'Draft save failed.');
  }
}

function carePlanCommandBase() {
  const current = carePlanStore.getState();
  return { base_server_revision: current.server_revision, actor: carePlanPhysician };
}

function attachListeners() {
  document.querySelectorAll('[data-decision-action]').forEach((select) => select.addEventListener('change', () => {
    const reasonSelect = select.closest('form')?.querySelector('[data-decision-reason]');
    if (!reasonSelect) return;
    reasonSelect.innerHTML = decisionReasonOptionsHTML(select.value);
  }));

  document.querySelectorAll('[data-sc-mode]').forEach((button) => button.addEventListener('click', () => {
    state.screeningMode = button.dataset.scMode;
    render();
  }));

  document.querySelectorAll('[data-sc-year]').forEach((button) => button.addEventListener('click', () => {
    const current = state.screeningYear ?? new Date().getFullYear();
    state.screeningYear = current + Number(button.dataset.scYear);
    render();
  }));

  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    render();
  }));


  document.querySelector('[data-care-plan-reload-conflict]')?.addEventListener('click', async () => {
    try {
      clearTimeout(carePlanAutosaveTimer);
      const reloadedState = carePlanClient
        ? adaptCarePlanBackendState(await carePlanClient.current(null, state.activePatientId), null, state.activePatientId)
        : carePlanStore?.getState?.();
      if (!reloadedState) throw new Error('Current Care Plan draft is unavailable.');
      carePlanPendingChanges.clear();
      state.carePlanState = reloadedState;
      state.carePlanError = null;
      render();
    } catch (error) {
      failCarePlan(error, 'Care Plan reload failed.');
    }
  });

  document.querySelector('[data-ai-new-thread]')?.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        const nextWorkspace = startNewThread(state.aiWorkspace);
        persistAIWorkspace(nextWorkspace);
        focusAIThread(nextWorkspace.activeThreadId);
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().createThread(state.activePatientId, 'New conversation');
      if (!result.thread) throw new Error('Backend physician AI thread creation returned no aggregate.');
      adoptBackendAIThread(result.thread);
      focusAIThread(result.thread.thread_id);
    } catch (error) {
      failAI(error);
    }
  });

  document.querySelectorAll('[data-ai-thread]').forEach((button) => button.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        persistAIWorkspace(selectThread(state.aiWorkspace, button.dataset.aiThread));
        focusAIThread(button.dataset.aiThread);
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().getThread(state.activePatientId, button.dataset.aiThread);
      if (!result.thread) throw new Error('Backend physician AI thread load returned no aggregate.');
      adoptBackendAIThread(result.thread);
      focusAIThread(result.thread.thread_id);
    } catch (error) {
      failAI(error);
    }
  }));

  const conferenceTabs = [...document.querySelectorAll('.ai-conference-recent [role="tab"]')];
  conferenceTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? conferenceTabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + conferenceTabs.length) % conferenceTabs.length;
    conferenceTabs[nextIndex]?.click();
  }));

  [...document.querySelectorAll('[data-ai-review-claim]'), ...document.querySelectorAll('[data-ai-thought-nav]')].forEach((button) => button.addEventListener('click', () => {
    const claimId = button.dataset.aiReviewClaim ?? button.dataset.aiThoughtNav;
    persistAIWorkspace(selectClaimForReview(state.aiWorkspace, claimId));
    focusAIClaim(claimId);
  }));

  document.querySelectorAll('[data-ai-starter]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await sendAIMessage(button.dataset.aiQuestion);
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelector('form[data-ai-composer]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const rawMessage = String(new FormData(event.target).get('message') ?? '').trim();
      if (!rawMessage) throw new Error('Message text is required.');
      const discussing = activeAIClaim(state.aiWorkspace?.discussingClaimId);
      const message = discussing
        ? `Regarding this clinical thought — “${discussing.statement}”\n\n${rawMessage}`
        : rawMessage;
      await sendAIMessage(message);
    } catch (error) {
      failAI(error);
    }
  });

  document.querySelectorAll('[data-ai-consultation]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const specialty = button.closest('.ai-consult-menu')?.querySelector('[data-ai-specialty]')?.value ?? 'Sleep Medicine';
      await runAIConsultation(button.dataset.aiClaim, button.dataset.aiConsultation, specialty);
    } catch (error) {
      setAIConsultationRun(button.dataset.aiClaim, button.dataset.aiConsultation, 'failed', error?.message ?? 'Consultation failed.');
    }
  }));

  document.querySelectorAll('[data-ai-discuss-claim]').forEach((button) => button.addEventListener('click', () => {
    persistAIWorkspace({ ...state.aiWorkspace, discussingClaimId: button.dataset.aiDiscussClaim });
    focusAI('#ai-prompt');
  }));

  document.querySelector('[data-ai-clear-discussion]')?.addEventListener('click', () => {
    persistAIWorkspace({ ...state.aiWorkspace, discussingClaimId: null });
    focusAI('#ai-prompt');
  });

  document.querySelectorAll('[data-ai-open-consultation]').forEach((button) => button.addEventListener('click', () => {
    focusAIConsultation(button.dataset.aiOpenConsultation);
  }));

  document.querySelectorAll('[data-ai-accept-revision]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await decideAIConsultationRevision(button.dataset.aiClaim, button.dataset.aiAcceptRevision, 'accept_revision');
      focusAIClaim(button.dataset.aiClaim);
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-keep-wording]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await decideAIConsultationRevision(button.dataset.aiClaim, button.dataset.aiKeepWording, 'keep_current');
      focusAIConsultation(button.dataset.aiKeepWording);
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('form[data-ai-consultation-follow-up]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await runAIConsultationFollowUp(form.dataset.aiConsultationFollowUp, new FormData(form).get('question'));
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-begin-adoption]').forEach((button) => button.addEventListener('click', () => {
    persistAIWorkspace(beginClaimAdoption(state.aiWorkspace, button.dataset.aiBeginAdoption));
    focusAI('[data-ai-adopt]');
  }));

  document.querySelector('[data-ai-cancel-adoption]')?.addEventListener('click', () => {
    persistAIWorkspace(cancelClaimAdoption(state.aiWorkspace));
  });

  document.querySelectorAll('[data-ai-adopt]').forEach((button) => button.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        const adopted = adoptClaim(state.aiWorkspace, button.dataset.aiAdopt, { confirmedStatement: button.dataset.aiConfirmedStatement });
        persistAIWorkspace(adopted);
        await createAutomaticCarePlanProposal(button.dataset.aiAdopt);
        focusAI('[data-ai-promote-care-plan]');
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().adoptClaim(
        state.activePatientId,
        activeAIThread().threadId,
        button.dataset.aiAdopt,
        button.dataset.aiConfirmedStatement
      );
      if (!result.thread) throw new Error('Backend physician AI adoption returned no aggregate.');
      adoptBackendAIThread(result.thread);
      await createAutomaticCarePlanProposal(button.dataset.aiAdopt);
      focusAI('[data-ai-promote-care-plan]');
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-retry-care-plan-proposal]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await createAutomaticCarePlanProposal(button.dataset.aiRetryCarePlanProposal);
      focusAI('[data-ai-promote-care-plan]');
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-dismiss]').forEach((button) => button.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        persistAIWorkspace(dismissClaim(state.aiWorkspace, button.dataset.aiDismiss));
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().dismissClaim(
        state.activePatientId,
        activeAIThread().threadId,
        button.dataset.aiDismiss,
        'Physician dismissed this hypothesis from the Aleron AI workspace.'
      );
      if (!result.thread) throw new Error('Backend physician AI dismissal returned no aggregate.');
      adoptBackendAIThread(result.thread);
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-promote-care-plan]').forEach((button) => button.addEventListener('click', async () => {
    if (carePlanPromotionPending) return;
    carePlanPromotionPending = true;
    button.disabled = true;
    button.setAttribute?.('aria-busy', 'true');
    try {
      const draftId = button.dataset.aiPromoteCarePlan;
      const draft = activeAIThread()?.drafts.find((candidate) => candidate.draft_id === draftId);
      if (!draft) throw new Error('Care Plan proposal draft was not found.');
      if (!carePlanBackendMode()) {
        const current = carePlanStore.getState();
        const promotionEventId = `promotion-${draftId}-${current.server_revision + 1}`;
        const promoted = carePlanStore.promoteDraftProposal({ actor: carePlanPhysician, base_server_revision: current.server_revision, client_revision: current.client_revision + 1, proposal: draft, promotion_event_id: promotionEventId });
        if (!promoted.ok) throw new Error(promoted.error ?? 'Care Plan proposal promotion failed.');
        state.carePlanState = promoted.state;
        persistAIWorkspace(markCarePlanProposalPromoted(state.aiWorkspace, draftId, promotionEventId));
      } else {
        if (state.activeCase?.readiness?.ready_for_review !== true) throw new Error('Care Plan promotion requires current review-ready analysis.');
        const result = await carePlanClient.promote(state.carePlanState, { sourceThreadId: activeAIThread().threadId, sourceDraftId: draftId });
        state.carePlanState = result.state;
        if (result.thread) adoptBackendAIThread(result.thread);
        else state.aiWorkspace = markCarePlanProposalPromoted(state.aiWorkspace, draftId, result.promotion_event_id);
      }
      state.activeTab = 'care-plan';
      state.carePlanHighlightedEntryId = `entry-${draftId}-1`;
      render();
      queueMicrotask(() => {
        const target = document.querySelector(`[data-care-plan-entry="entry-${draftId}-1"]`);
        if (!target) return;
        target.setAttribute?.('tabindex', '-1');
        target.focus?.({ preventScroll: true });
        target.scrollIntoView?.({ block: 'start' });
      });
    } catch (error) {
      failAI(error);
    } finally {
      carePlanPromotionPending = false;
    }
  }));

  document.querySelectorAll('[data-ai-open-care-plan]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = 'care-plan';
    render();
  }));

  document.querySelectorAll('[data-ai-draft]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await createAIDraft(button.dataset.aiClaim, button.dataset.aiDraft);
      focusAI('.ai-draft textarea');
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelectorAll('[data-ai-draft-editor]').forEach((editor) => editor.addEventListener('input', () => {
    try {
      if (aiBackendMode()) {
        state.aiWorkspace = applyLocalDraftEdit(state.aiWorkspace, editor.dataset.aiDraftEditor, editor.value, aiLocalDraftEdits);
      } else {
        state.aiWorkspace = updateDraftContent(state.aiWorkspace, editor.dataset.aiDraftEditor, editor.value);
        aiRepository().save(state.aiWorkspace);
      }
      const editState = editor.closest('.ai-draft')?.querySelector('[data-ai-draft-edit-state]');
      if (editState) editState.textContent = aiBackendMode() ? 'Local uncommitted edit' : 'Edited';
    } catch (error) {
      failAI(error);
    }
  }));

  document.querySelector('[data-risk-continue-ai]')?.addEventListener('click', async (event) => {
    const question = event.currentTarget?.dataset.riskContinueAi;
    state.activeTab = 'aleron-ai';
    render();
    try {
      await sendAIMessage(question);
      focusAI('#ai-prompt');
    } catch (error) {
      failAI(error);
    }
  });

  document.querySelectorAll('[data-model-pane]').forEach((button) => button.addEventListener('click', () => {
    state.selectedModelPane = button.dataset.modelPane;
    state.selectedActionSpaceItemId = null;
    render();
  }));

  const riskDomainButtons = [...document.querySelectorAll('[data-rs-domain]')];
  const selectRiskDomain = (button, restoreFocus = false) => {
    state.selectedRiskDomain = button.dataset.rsDomain;
    state.selectedRiskId = button.dataset.riskDomain;
    state.selectedRiskAction = null;
    render();
    if (restoreFocus) document.querySelector(`[data-rs-domain="${state.selectedRiskDomain}"]`)?.focus();
  };
  riskDomainButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectRiskDomain(button));
    button.addEventListener('keydown', (event) => {
      const last = riskDomainButtons.length - 1;
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? last
          : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % riskDomainButtons.length
            : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index - 1 + riskDomainButtons.length) % riskDomainButtons.length
              : null;
      if (nextIndex == null) return;
      event.preventDefault();
      selectRiskDomain(riskDomainButtons[nextIndex], true);
    });
  });

  document.querySelectorAll('[data-rs-action]').forEach((mark) => {
    const select = () => {
      state.selectedRiskAction = mark.dataset.rsAction;
      render();
      document.querySelector(`[data-rs-action="${state.selectedRiskAction}"]`)?.focus();
    };
    const hoverOn = () => {
      document.querySelectorAll('.rs-hovercard.on').forEach((card) => card.classList.remove('on'));
      document.querySelector(`[data-rs-hover="${mark.dataset.rsAction}"]`)?.classList.add('on');
    };
    const hoverOff = () => {
      document.querySelector(`[data-rs-hover="${mark.dataset.rsAction}"]`)?.classList.remove('on');
    };
    mark.addEventListener('click', select);
    mark.addEventListener('mouseenter', hoverOn);
    mark.addEventListener('mouseleave', hoverOff);
    mark.addEventListener('focus', hoverOn);
    mark.addEventListener('blur', hoverOff);
    mark.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  });

  document.querySelector('[data-open-action-space]')?.addEventListener('click', (event) => {
    state.activeTab = 'risk';
    state.selectedModelPane = 'action-space';
    state.actionSpaceFilter = 'all';
    state.selectedActionSpaceItemId = (event.currentTarget ?? event.target)?.dataset.openActionSpace || null;
    render();
  });

  document.querySelectorAll('[data-action-space-filter]').forEach((button) => button.addEventListener('click', () => {
    state.actionSpaceFilter = button.dataset.actionSpaceFilter;
    state.selectedActionSpaceItemId = null;
    render();
  }));

  const selectActionSpaceItem = (element) => {
    const isMark = element.hasAttribute('data-action-space-mark');
    const id = element.dataset.actionSpaceItem ?? element.dataset.actionSpaceMark;
    state.selectedActionSpaceItemId = state.selectedActionSpaceItemId === id ? null : id;
    render();
    const replacement = [...document.querySelectorAll(isMark ? '[data-action-space-mark]' : '[data-action-space-item]')]
      .find((candidate) => (candidate.dataset.actionSpaceItem ?? candidate.dataset.actionSpaceMark) === id);
    replacement?.focus();
  };
  document.querySelectorAll('[data-action-space-item],[data-action-space-mark]').forEach((element) => {
    element.addEventListener('click', () => selectActionSpaceItem(element));
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectActionSpaceItem(element);
      }
    });
  });


  const vitalityInstrumentButtons = [...document.querySelectorAll('[data-vitality-instrument]')];
  const selectVitalityInstrument = (button) => {
    state.selectedVitalityInstrumentId = button.dataset.vitalityInstrument;
    render();
    document.querySelector(`[data-vitality-instrument="${state.selectedVitalityInstrumentId}"]`)?.focus();
  };
  vitalityInstrumentButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectVitalityInstrument(button));
    button.addEventListener('keydown', (event) => {
      const last = vitalityInstrumentButtons.length - 1;
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? last
          : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % vitalityInstrumentButtons.length
            : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index - 1 + vitalityInstrumentButtons.length) % vitalityInstrumentButtons.length
              : null;
      if (nextIndex == null) return;
      event.preventDefault();
      selectVitalityInstrument(vitalityInstrumentButtons[nextIndex]);
    });
  });

  document.querySelectorAll('[data-plan-item]').forEach((button) => button.addEventListener('click', () => {
    state.selectedPlanItemId = button.dataset.planItem;
    render();
  }));

  document.querySelector('[data-case-selector]')?.addEventListener('change', async (event) => {
    const patientId = event.target.value;
    state.workflowStatus = 'Loading case artifacts…';
    render();
    try {
      await loadCase(patientId);
      state.workflowStatus = 'Chart opened. Backend workflow state was not changed.';
      state.activeTab = 'patient-data';
      state.selectedRiskId = null;
      state.selectedRiskDomain = null;
      state.selectedRiskAction = null;
      state.selectedModelPane = 'models';
      state.actionSpaceFilter = 'all';
      state.selectedActionSpaceItemId = null;
      state.selectedVitalityInstrumentId = null;
      state.selectedPlanItemId = null;
      render();
    } catch (error) {
      fail(error, 'Unable to load the selected case.');
    }
  });

  document.querySelector('[data-review-action="start"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      setBusyStatus('Starting physician review…');
      const result = await startPhysicianReview(state.activePatientId, { source: 'physician_dashboard_explicit_start' });
      state.reviewStarted = true;
      if (result) {
        await refreshFromBackend();
        state.reviewStarted = true;
      }
      persistCurrentReviewReleaseSession();
      state.workflowStatus = result ? 'Backend review started.' : 'Fixture review started for this test session.';
      render();
    } catch (error) {
      fail(error, 'Review start failed.');
    }
  });

  document.querySelectorAll('form[data-edit-item]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveDecision(form);
    } catch (error) {
      fail(error, 'Structured decision failed.');
    }
  }));

  document.querySelector('form[data-add-action]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveDecision(event.target, new FormData(event.target).get('action'));
    } catch (error) {
      fail(error, 'Physician action add failed.');
    }
  });

  document.querySelector('[data-release-action="request-preview"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      setBusyStatus('Generating backend release preview…');
      const preview = await requestReleasePreview(state.activePatientId, buildReleasePreviewRequest(state.activeCase));
      if (preview && !releasePackageIsCurrent(state.activeCase, preview)) {
        throw new Error('Backend release preview does not match the current case artifacts.');
      }
      state.releasePackage = preview ?? buildFixtureReleasePreview(state.activeCase, state.activePatientId);
      persistCurrentReviewReleaseSession();
      state.workflowStatus = preview ? 'Backend release preview generated.' : 'Fixture release preview generated for this test session.';
      render();
    } catch (error) {
      fail(error, 'Release preview failed.');
    }
  });

  document.querySelector('[data-release-action="authorize"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      const attestation = document.querySelector('[data-physician-attestation]');
      if (!attestation?.checked) throw new Error('Physician attestation is required before authorization.');
      const releaseId = releaseIdentifier(state.releasePackage);
      if (!releaseId) throw new Error('A backend release preview is required before authorization.');
      setBusyStatus('Recording physician attestation and authorization…');
      const authorizationId = `physician-attestation:${releaseId}:${Date.now()}`;
      const authorizationEvidence = exactReleaseAuthorizationEvidence(state.releasePackage, authorizationId);
      if (!authorizationEvidence) throw new Error('The current release preview cannot be bound to exact authorization evidence.');
      const authorized = await requestPhysicianAuthorization(state.activePatientId, {
        release_id: releaseId,
        signature_or_authorization_id: authorizationId,
        reason: 'Physician reviewed the case and release preview and authorized backend release.',
        signing_mode: 'physician_attestation_authorization'
      });
      if (authorized && (authorized.schema_version !== 'release_package.v1'
        || authorized.release_state !== 'authorized_not_released'
        || authorized.patient_visible !== false
        || authorized.signature_or_authorization_id !== authorizationId)) {
        throw new Error('Backend authorization returned a contradictory lifecycle tuple.');
      }
      const authorizedPackage = {
        ...(authorized ?? state.releasePackage),
        release_state: 'authorized_not_released',
        patient_visible: false,
        signature_or_authorization_id: authorizationId,
        authorization_evidence: authorizationEvidence
      };
      if (authorized && (!releasePackageIsCurrent(state.activeCase, authorizedPackage)
        || !releasePackageMatchesAuthorizationEvidence(authorizedPackage, authorizationEvidence))) {
        throw new Error('Backend authorization does not match the exact physician-reviewed preview.');
      }
      state.releasePackage = authorizedPackage;
      if (authorized) {
        await refreshFromBackend();
        const refreshedBackendPackage = state.activeCase?.release_preview ?? state.activeCase?.release_package;
        if (!refreshedBackendPackage
          || refreshedBackendPackage.schema_version !== 'release_package.v1'
          || refreshedBackendPackage.release_state !== 'authorized_not_released'
          || refreshedBackendPackage.patient_visible !== false
          || refreshedBackendPackage.signature_or_authorization_id !== authorizationId) {
          throw new Error('Refreshed backend state returned a contradictory lifecycle tuple.');
        }
        const normalizedRefreshedPackage = {
          ...refreshedBackendPackage,
          release_state: 'authorized_not_released',
          patient_visible: false,
          signature_or_authorization_id: authorizationId,
          authorization_evidence: authorizationEvidence
        };
        if (!releasePackageIsCurrent(state.activeCase, normalizedRefreshedPackage)
          || !releasePackageMatchesAuthorizationEvidence(normalizedRefreshedPackage, authorizationEvidence)) {
          throw new Error('Refreshed backend state no longer matches the exact physician-reviewed preview.');
        }
        state.releasePackage = normalizedRefreshedPackage;
      }
      persistCurrentReviewReleaseSession();
      state.workflowStatus = authorized ? 'Staging physician attestation and authorization recorded by backend.' : 'Fixture attestation recorded for this test session.';
      render();
    } catch (error) {
      fail(error, 'Authorization failed.');
    }
  });

  document.querySelector('[data-release-action="release-backend"]')?.addEventListener('click', async () => {
    try {
      requireAnalysisReady();
      requireReviewStarted();
      if (state.releasePackage?.release_state !== 'authorized_not_released') throw new Error('Backend authorization is required before release.');
      const authorizationEvidence = state.releasePackage.authorization_evidence;
      if (!releasePackageMatchesAuthorizationEvidence(state.releasePackage, authorizationEvidence)) {
        throw new Error('The authorized package no longer matches its exact preview authorization evidence.');
      }
      setBusyStatus('Requesting final backend release…');
      const authorizedPackage = state.releasePackage;
      const released = await requestFinalRelease(state.activePatientId, {
        release_id: releaseIdentifier(authorizedPackage),
        reason: 'Physician released the reviewed and authorized plan to the patient.'
      });
      const releasedAt = released ? released.released_at : new Date().toISOString();
      if (released && (released.schema_version !== 'release_package.v1'
        || released.release_state !== 'released_to_patient'
        || released.patient_visible !== true
        || released.signature_or_authorization_id !== authorizationEvidence.authorization_id
        || released.preview_hash !== authorizedPackage.preview_hash
        || released.release_id !== authorizedPackage.release_id)) {
        throw new Error('Backend final release returned a contradictory lifecycle tuple.');
      }
      const releaseReceipt = createPatientReleaseReceipt(authorizedPackage, releasedAt);
      if (!releaseReceipt) throw new Error('Final release did not produce a valid release-transition timestamp and receipt.');
      const releasedPackage = {
        ...(released ?? authorizedPackage),
        release_state: 'released_to_patient',
        patient_visible: true,
        released_at: releasedAt,
        signature_or_authorization_id: authorizationEvidence.authorization_id,
        authorization_evidence: authorizationEvidence,
        release_receipt: releaseReceipt
      };
      if (released?.release_receipt && !patientReleaseReceiptIsValid({
        ...releasedPackage,
        release_receipt: released.release_receipt
      })) {
        throw new Error('Backend final release returned a contradictory release receipt.');
      }
      const validReleasedPackage = releasePackageIsCurrent(state.activeCase, releasedPackage)
        && releasePackageMatchesAuthorizationEvidence(releasedPackage, authorizationEvidence)
        && patientReleaseReceiptIsValid(releasedPackage);
      if (!validReleasedPackage) throw new Error('Backend final release did not return the exact authorized package.');
      state.releasePackage = releasedPackage;
      if (released) {
        state.activeCase.workflow_projection = {
          ...(state.activeCase.workflow_projection ?? {}),
          schema_version: state.activeCase.workflow_projection?.schema_version ?? 'physician_workflow.v1',
          lifecycle_state: 'closed',
          release_state: 'released_to_patient',
          patient_visibility: 'visible',
          next_action: { label: 'No further action', target: 'journal' },
          release: { ...(state.activeCase.workflow_projection?.release ?? {}), patient_visible: true, released_at: released.released_at ?? null }
        };
        try {
          await refreshFromBackend();
        } catch (refreshError) {
          if (refreshError?.status !== 404) throw refreshError;
        }
      }
      persistCurrentReviewReleaseSession();
      state.workflowStatus = released ? 'Backend released package to patient.' : 'Fixture release recorded for this test session.';
      render();
    } catch (error) {
      fail(error, 'Final release failed.');
    }
  });

  document.querySelectorAll('[data-care-plan-field]').forEach((field) => field.addEventListener('input', () => {
    queueCarePlanChange(`${field.dataset.carePlanField}.value`, field.value);
  }));
  document.querySelectorAll('[data-care-plan-problem-label]').forEach((field) => field.addEventListener('input', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanProblemLabel);
    if (index >= 0) queueCarePlanChange(`entries.${index}.problem.proposed_label.value`, field.value);
  }));
  document.querySelectorAll('[data-care-plan-assessment]').forEach((field) => field.addEventListener('input', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanAssessment);
    if (index >= 0) queueCarePlanChange(`entries.${index}.assessment.value`, field.value);
  }));
  document.querySelectorAll('[data-care-plan-plan]').forEach((field) => field.addEventListener('input', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanPlan);
    if (index >= 0) queueCarePlanChange(`entries.${index}.plan.value`, field.value);
  }));
  document.querySelectorAll('[data-care-plan-certainty]').forEach((field) => field.addEventListener('change', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanCertainty);
    if (index >= 0) { queueCarePlanChange(`entries.${index}.problem.diagnostic_certainty`, field.value); flushCarePlanChanges(); }
  }));
  document.querySelectorAll('[data-care-plan-disposition]').forEach((field) => field.addEventListener('change', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanDisposition);
    if (index >= 0) { queueCarePlanChange(`entries.${index}.problem.problem_list_disposition`, field.value); flushCarePlanChanges(); }
  }));
  document.querySelectorAll('[data-care-plan-entry-inclusion]').forEach((field) => field.addEventListener('change', () => {
    const index = carePlanEntryIndex(field.dataset.carePlanEntryInclusion);
    if (index < 0) return;
    const entry = state.carePlanState.entries[index];
    if (field.value === 'removed' && entry.order_intents.some((order) => order.inclusion_state === 'included')) {
      state.carePlanError = 'Resolve every nested order before removing this problem.';
      render();
      return;
    }
    queueCarePlanChange(`entries.${index}.problem.entry_inclusion`, field.value);
    flushCarePlanChanges();
  }));
  document.querySelectorAll('[data-care-plan-order-field]').forEach((field) => field.addEventListener('input', () => {
    const [orderId, property] = field.dataset.carePlanOrderField.split(':');
    state.carePlanState.entries.forEach((entry, entryIndex) => {
      const orderIndex = entry.order_intents.findIndex((order) => order.order_intent_id === orderId);
      if (orderIndex >= 0) queueCarePlanChange(`entries.${entryIndex}.order_intents.${orderIndex}.${property}`, field.value);
    });
  }));
  document.querySelectorAll('[data-care-plan-catalog]').forEach((button) => button.addEventListener('click', () => {
    flushCarePlanChanges();
    applyCarePlanResult(carePlanStore.matchCatalog({ ...carePlanCommandBase(), order_intent_id: button.dataset.carePlanCatalog, catalog_test_key: 'QUEST:A1C-496', idempotency_key: `catalog-${Date.now()}` }));
  }));
  document.querySelectorAll('[data-care-plan-order-toggle]').forEach((button) => button.addEventListener('click', () => {
    flushCarePlanChanges();
    const order = carePlanStore.getState().entries.flatMap((entry) => entry.order_intents).find((candidate) => candidate.order_intent_id === button.dataset.carePlanOrderToggle);
    applyCarePlanResult(carePlanStore.setOrderInclusion({ ...carePlanCommandBase(), order_intent_id: order.order_intent_id, inclusion_state: order.inclusion_state === 'included' ? 'excluded' : 'included', idempotency_key: `order-toggle-${Date.now()}` }));
  }));
  document.querySelectorAll('[data-care-plan-add-order]').forEach((button) => button.addEventListener('click', () => {
    flushCarePlanChanges();
    applyCarePlanResult(carePlanStore.addOrder({ ...carePlanCommandBase(), entry_id: button.dataset.carePlanAddOrder, idempotency_key: `add-order-${Date.now()}`, order: { display_name: 'Ferritin', clinical_indication: 'Evaluate persistent fatigue.', catalog_test_key: 'QUEST:FERRITIN-457', specimen: 'serum', priority: 'routine', collection_method: 'Quest patient service center', timing: 'Within 14 days', ordering_physician_id: carePlanPhysician.actor_id, duplicate_check: 'clear' } }));
  }));
  document.querySelector('[data-care-plan-authorize-orders]')?.addEventListener('click', async () => {
    if (!(await flushCarePlanChanges())) return;
    const attested = document.querySelector('[data-care-plan-order-attestation]')?.checked === true;
    try {
      if (carePlanBackendMode()) {
        state.carePlanState = await carePlanClient.authorize(state.carePlanState, { attested });
        state.carePlanError = null;
        render();
        return;
      }
      const current = carePlanStore.getState();
      const pending = current.pending_order_set;
      if (!pending) throw new Error('The locked-note pending order set is required for authorization.');
      applyCarePlanResult(carePlanStore.authorizeOrders({ actor: carePlanPhysician, pending_snapshot_id: pending.snapshot_id, pending_snapshot_revision: pending.snapshot_revision, payload_hash: pending.payload_hash, idempotency_key: `authorize-${pending.snapshot_id}-${pending.snapshot_revision}`, attested, interaction_nonce: `orders-${Date.now()}` }));
    } catch (error) { failCarePlan(error, 'Order authorization failed.'); }
  });
  document.querySelector('[data-care-plan-begin-lock]')?.addEventListener('click', async () => {
    if (!(await flushCarePlanChanges())) return;
    const attested = document.querySelector('[data-care-plan-lock-attestation]')?.checked === true;
    const pendingAck = document.querySelector('[data-care-plan-pending-ack]');
    const pending_orders_acknowledged = pendingAck ? pendingAck.checked === true : true;
    if (!attested || !pending_orders_acknowledged) {
      failCarePlan(new Error('Review the required note-lock attestation before continuing.'));
      return;
    }
    state.carePlanLockConfirmationPending = true;
    render();
  });
  document.querySelector('[data-care-plan-cancel-lock]')?.addEventListener('click', () => {
    state.carePlanLockConfirmationPending = false;
    render();
  });
  document.querySelector('[data-care-plan-lock-note]')?.addEventListener('click', async () => {
    try {
      if (carePlanBackendMode()) {
        state.carePlanState = await carePlanClient.lock(state.carePlanState, { attested: true, pendingOrdersAcknowledged: true, secondConfirmation: true });
        state.carePlanError = null;
        state.carePlanLockConfirmationPending = false;
        render();
        return;
      }
      const current = carePlanStore.getState();
      state.carePlanLockConfirmationPending = false;
      applyCarePlanResult(carePlanStore.lockNote({ actor: carePlanPhysician, draft_revision: current.server_revision, payload_hash: current.note_hash, problem_mutation_set_hash: current.problem_mutation_set_hash, idempotency_key: `lock-${current.server_revision}`, attested: true, interaction_nonce: `lock-${Date.now()}`, pending_orders_acknowledged: true, second_confirmation: true }));
    } catch (error) { failCarePlan(error, 'Note lock failed.'); }
  });
  document.querySelector('[data-care-plan-pending-begin-revise]')?.addEventListener('click', () => {
    state.carePlanPendingEditMode = true;
    render();
    queueMicrotask(() => document.querySelector('[data-care-plan-pending-timing]')?.focus());
  });
  document.querySelector('[data-care-plan-pending-cancel-edit]')?.addEventListener('click', () => {
    state.carePlanPendingEditMode = false;
    render();
  });
  document.querySelector('[data-care-plan-pending-revise]')?.addEventListener('click', async () => {
    const pending = state.carePlanState.pending_order_set;
    const orderIntentId = document.querySelector('[data-care-plan-pending-order]')?.value;
    const timing = document.querySelector('[data-care-plan-pending-timing]')?.value;
    try {
      state.carePlanPendingEditMode = false;
      if (carePlanBackendMode()) state.carePlanState = await carePlanClient.revisePending(state.carePlanState, { orderIntentId, changes: { timing }, reason: 'Physician revised collection timing after note lock.' });
      else applyCarePlanResult(carePlanStore.revisePendingOrderSet({ actor: carePlanPhysician, snapshot_id: pending.snapshot_id, expected_revision: pending.snapshot_revision, expected_payload_hash: pending.payload_hash, order_intent_id: orderIntentId, changes: { timing }, reason: 'Physician revised collection timing after note lock.' }));
      if (carePlanBackendMode()) { state.carePlanError = null; render(); }
    } catch (error) { failCarePlan(error, 'Pending order revision failed.'); }
  });
  document.querySelector('[data-care-plan-pending-cancel]')?.addEventListener('click', async () => {
    const pending = state.carePlanState.pending_order_set;
    const orderIntentId = document.querySelector('[data-care-plan-pending-order]')?.value;
    try {
      state.carePlanPendingEditMode = false;
      if (carePlanBackendMode()) state.carePlanState = await carePlanClient.cancelPending(state.carePlanState, { orderIntentId, reason: 'Physician cancelled this pending intent after note lock.' });
      else applyCarePlanResult(carePlanStore.cancelPendingIntent({ actor: carePlanPhysician, snapshot_id: pending.snapshot_id, expected_revision: pending.snapshot_revision, expected_payload_hash: pending.payload_hash, order_intent_id: orderIntentId, reason: 'Physician cancelled this pending intent after note lock.' }));
      if (carePlanBackendMode()) { state.carePlanError = null; render(); }
    } catch (error) { failCarePlan(error, 'Pending order cancellation failed.'); }
  });
  document.querySelector('[data-care-plan-pending-leave]')?.addEventListener('click', async () => {
    const pending = state.carePlanState.pending_order_set;
    try {
      state.carePlanPendingEditMode = false;
      if (carePlanBackendMode()) state.carePlanState = await carePlanClient.leavePending(state.carePlanState, { reason: 'Physician intentionally left this exact set pending.' });
      else applyCarePlanResult(carePlanStore.leavePending({ actor: carePlanPhysician, snapshot_id: pending.snapshot_id }));
      if (carePlanBackendMode()) { state.carePlanError = null; render(); }
    } catch (error) { failCarePlan(error, 'Leave-pending action failed.'); }
  });
  document.querySelector('[data-care-plan-reset]')?.addEventListener('click', () => {
    carePlanPendingChanges.clear();
    carePlanStore.reset();
    if (usesReviewReleaseSessionPersistence()) reviewReleaseSessionRepository().clear(state.activeCase);
    state.reviewStarted = false;
    state.releasePackage = null;
    state.carePlanState = carePlanStore.getState();
    state.carePlanError = null;
    render();
  });

  document.querySelector('[data-sign-out]')?.addEventListener('click', () => {
    window.location?.reload?.();
  });
}

function render() {
  if (!state.activeCase) {
    renderEmptyStaging(app);
    document.querySelector('[data-refresh-empty]')?.addEventListener('click', () => window.location?.reload?.());
    return;
  }
  try {
    const model = adaptPhysicianCase(state.activeCase);
    state.selectedTask = selectedTask();
    renderDashboard(app, state, model);
    attachListeners();
  } catch (error) {
    renderFatalError(app, 'Case unavailable.', error.message);
  }
}

function requestedPatientId() {
  if (typeof window === 'undefined') return null;
  const value = new URL(window.location.href).searchParams.get('patient_id')?.trim();
  return value || null;
}

async function boot() {
  try {
    const deepLinkPatientId = requestedPatientId();
    const bundle = await getPhysicianBundle(deepLinkPatientId);
    state.queue = bundle.queue ?? [];
    state.source = bundle.source ?? 'backend';
    state.apiBaseUrl = (await import('./runtimeConfig.js')).PHYSICIAN_RUNTIME_CONFIG.apiBaseUrl;
    await adoptCase(bundle.case);
    state.activePatientId = deepLinkPatientId
      ?? bundle.case?.patient_packet?.patient_id
      ?? bundle.case?.patient_id
      ?? state.queue[0]?.patient_id
      ?? null;
    if (deepLinkPatientId && state.activePatientId !== deepLinkPatientId) {
      await loadCase(deepLinkPatientId);
    }
    render();
  } catch (error) {
    const accessFailure = state.source !== 'fixture' && /401|403|authorization|session/i.test(error.message);
    renderFatalError(
      app,
      accessFailure ? 'Direct staging access unavailable.' : 'Dashboard unavailable.',
      error.message,
    );
  }
}

boot();
