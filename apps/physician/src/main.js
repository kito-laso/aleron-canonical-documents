/*
Design brief: This screen is for a physician determining whether canonical analysis is complete enough to begin case review and release. The one thing it must answer first is whether the case is review-ready and, if not, exactly which blocker prevents action. Shape carries one bounded status group, color carries only semantic status emphasis, weight carries status before detail, and position places the gate directly above Care Plan controls.
*/
import {
  createStructuredEdit,
  getActiveCase,
  getPhysicianBundle,
  getPhysicianAIBackendClient,
  persistStructuredEdit,
  requestFinalRelease,
  requestPhysicianAuthorization,
  requestReleasePreview,
  startPhysicianReview
} from './apiClient.js';
import { adaptBackendThreadWorkspace, applyLocalDraftEdit } from './aiColleagueBackend.js?v=physician-ai-backend-v1';
import { adaptPhysicianCase, artifactBindsCurrentLineage, buildReleasePreviewRequest, releaseIdentifier } from './dashboardAdapter.js?v=physician-ai-colleague-v1';
import { decisionReasonOptionsHTML, renderDashboard, renderEmptyStaging, renderFatalError } from './dashboardApp.js?v=physician-ai-colleague-v1';
import {
  adoptClaim,
  applyProviderConsultation,
  applyProviderDraft,
  applyProviderMessage,
  beginClaimAdoption,
  cancelClaimAdoption,
  createDraft,
  createWorkspaceRepository,
  dismissClaim,
  resumeAIWorkspace,
  runFixtureConsultationFollowUp,
  runFixtureConsultation,
  selectClaimForReview,
  selectThread,
  sendFixtureMessage,
  startNewThread,
  updateDraftContent
} from './aiColleague.js?v=physician-ai-colleague-v1';
import {
  buildConsultationFollowUpQuestion,
  buildCodexProviderRequest,
  codexModeFromLocation,
  createCodexSubscriptionProvider
} from './aiColleagueProvider.js?v=physician-ai-codex-provider-v1';

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
  aiError: null
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
  return releasePackage.patient_id === patientId && artifactBindsCurrentLineage(caseBundle, releasePackage);
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

const aiSessionRecords = new Map();
const aiSessionStorage = {
  getItem: (key) => aiSessionRecords.get(key) ?? null,
  setItem: (key, value) => aiSessionRecords.set(key, value),
  removeItem: (key) => aiSessionRecords.delete(key)
};

function aiRepository() {
  return createWorkspaceRepository(aiSessionStorage);
}

function createAIProviderSessionId() {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `session-${value.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

const aiProviderSessionId = createAIProviderSessionId();
let aiCodexProvider = null;
const aiLocalDraftEdits = new Map();

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

function adoptBackendAIThread(thread) {
  const prior = state.aiWorkspace;
  const threads = [thread, ...(prior?.threads ?? [])
    .filter((candidate) => candidate.threadId !== thread.thread_id)
    .map((candidate) => candidate.backendAggregate)
    .filter(Boolean)];
  state.aiWorkspace = adaptBackendThreadWorkspace(state.activeCase, threads, thread.thread_id, {
    localDraftEdits: aiLocalDraftEdits,
    selectedClaimId: prior?.selectedClaimId,
    adoptionPendingClaimId: prior?.adoptionPendingClaimId
  });
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
  if (aiFixtureMode()) {
    const result = runFixtureConsultation(state.aiWorkspace, claimId, consultationType, { specialty });
    persistAIWorkspace(result.workspace);
    return;
  }
  const targetClaim = activeAIClaim(claimId);
  if (!targetClaim) throw new Error('Consultation requires a current material claim.');
  if (aiBackendMode()) {
    setAIProviderPending();
    const result = await getPhysicianAIBackendClient().createConsultation(
      state.activePatientId,
      activeAIThread().threadId,
      claimId,
      consultationType,
      { specialty, neutralQuestion: neutralConsultationQuestion() }
    );
    if (!result.thread) throw new Error('Backend physician AI consultation returned no aggregate.');
    adoptBackendAIThread(result.thread);
    return;
  }
  setAIProviderPending();
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

async function adoptCase(caseBundle) {
  const aiWorkspace = await initializeAIWorkspace(caseBundle);
  const releasePackage = caseBundle?.release_preview ?? caseBundle?.release_package ?? null;
  state.activeCase = caseBundle;
  state.releasePackage = releasePackageIsCurrent(caseBundle, releasePackage) ? releasePackage : null;
  const patientId = caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id;
  if (patientId) state.activePatientId = patientId;
  state.aiWorkspace = aiWorkspace;
  state.aiError = null;
  inferReviewStarted();
}

async function loadCase(patientId) {
  state.workflowError = null;
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

  document.querySelector('[data-ai-new-thread]')?.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        persistAIWorkspace(startNewThread(state.aiWorkspace));
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().createThread(state.activePatientId, 'New conversation');
      if (!result.thread) throw new Error('Backend physician AI thread creation returned no aggregate.');
      adoptBackendAIThread(result.thread);
    } catch (error) {
      failAI(error);
    }
  });

  document.querySelectorAll('[data-ai-thread]').forEach((button) => button.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        persistAIWorkspace(selectThread(state.aiWorkspace, button.dataset.aiThread));
        return;
      }
      setAIProviderPending();
      const result = await getPhysicianAIBackendClient().getThread(state.activePatientId, button.dataset.aiThread);
      if (!result.thread) throw new Error('Backend physician AI thread load returned no aggregate.');
      adoptBackendAIThread(result.thread);
    } catch (error) {
      failAI(error);
    }
  }));

  [...document.querySelectorAll('[data-ai-review-claim]'), ...document.querySelectorAll('[data-ai-ledger-claim]')].forEach((button) => button.addEventListener('click', () => {
    persistAIWorkspace(selectClaimForReview(state.aiWorkspace, button.dataset.aiReviewClaim ?? button.dataset.aiLedgerClaim));
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
      const message = new FormData(event.target).get('message');
      await sendAIMessage(message);
    } catch (error) {
      failAI(error);
    }
  });

  document.querySelectorAll('[data-ai-consultation]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const specialty = document.querySelector('[data-ai-specialty]')?.value ?? 'Sleep Medicine';
      await runAIConsultation(button.dataset.aiClaim, button.dataset.aiConsultation, specialty);
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
  }));

  document.querySelector('[data-ai-cancel-adoption]')?.addEventListener('click', () => {
    persistAIWorkspace(cancelClaimAdoption(state.aiWorkspace));
  });

  document.querySelectorAll('[data-ai-adopt]').forEach((button) => button.addEventListener('click', async () => {
    try {
      if (!aiBackendMode()) {
        persistAIWorkspace(adoptClaim(state.aiWorkspace, button.dataset.aiAdopt, { confirmedStatement: button.dataset.aiConfirmedStatement }));
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

  document.querySelectorAll('[data-ai-draft]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await createAIDraft(button.dataset.aiClaim, button.dataset.aiDraft);
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
      state.releasePackage = preview ?? {
        schema_version: 'release_package.v1',
        release_id: `fixture-preview-${state.activePatientId}`,
        ...currentReleaseLinkage(state.activeCase),
        release_state: 'release_package_draft',
        patient_visible: false
      };
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
      const authorized = await requestPhysicianAuthorization(state.activePatientId, {
        release_id: releaseId,
        signature_or_authorization_id: authorizationId,
        reason: 'Physician reviewed the case and release preview and authorized backend release.',
        signing_mode: 'physician_attestation_authorization'
      });
      if (authorized && !releasePackageIsCurrent(state.activeCase, authorized)) {
        throw new Error('Backend authorization does not match the current case artifacts.');
      }
      state.releasePackage = authorized ?? { ...state.releasePackage, release_state: 'authorized_not_released', signature_or_authorization_id: authorizationId };
      if (authorized) await refreshFromBackend();
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
      setBusyStatus('Requesting final backend release…');
      const released = await requestFinalRelease(state.activePatientId, {
        release_id: releaseIdentifier(state.releasePackage),
        reason: 'Physician released the reviewed and authorized plan to the patient.'
      });
      const validReleasedPackage = released?.schema_version === 'release_package.v1'
        && released?.release_state === 'released_to_patient'
        && released?.patient_visible === true
        && Boolean(releaseIdentifier(released))
        && releasePackageIsCurrent(state.activeCase, released);
      if (released && !validReleasedPackage) throw new Error('Backend final release did not return a valid released package.');
      state.releasePackage = released ?? { ...state.releasePackage, release_state: 'released_to_patient', patient_visible: true };
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
      state.workflowStatus = released ? 'Backend released package to patient.' : 'Fixture release recorded for this test session.';
      render();
    } catch (error) {
      fail(error, 'Final release failed.');
    }
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
    inferReviewStarted();
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
