function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sentence(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatActivity(value) {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
  }).format(date);
}

function confidenceLine(confidence) {
  if (!confidence) return '';
  return `${sentence(confidence.band)} confidence, estimated ${esc(confidence.estimate_pct)}% and ${esc(confidence.calibration_status)}.`;
}

function claimTypeLabel(claim) {
  const type = String(claim?.claim_type ?? '').toLowerCase().replaceAll('-', '_');
  if (type === 'pattern') return 'Pattern';
  if (type === 'hypothesis') return 'Hypothesis';
  if (type === 'interpretation') return 'Interpretation';
  if (type === 'proposed_focus' || type === 'focus') return 'Proposed focus';
  return sentence(type || 'clinical thought');
}

function claimStateLabel(claim) {
  if (claim.state === 'adopted') return 'Adopted';
  if (claim.state === 'dismissed') return 'Dismissed';
  return 'Open';
}

function factsList(title, values, itemClass = '', showEmpty = false) {
  const rows = array(values);
  if (!rows.length) return showEmpty ? `<section class="ai-thought-section"><h4>${esc(title)}</h4><p>None recorded.</p></section>` : '';
  return `<section class="ai-thought-section"><h4>${esc(title)}</h4><ul>${rows.map((value) => {
    if (typeof value === 'string') return `<li${itemClass ? ` class="${esc(itemClass)}"` : ''}>${esc(value)}</li>`;
    const unit = value.units ? ` ${esc(value.units)}` : '';
    const source = value.source_ref ? `<small>${esc(value.source_ref)}</small>` : '';
    return `<li><strong>${esc(value.label)}</strong> ${esc(value.value)}${unit}${source}</li>`;
  }).join('')}</ul></section>`;
}

function consultationTypeLabel(consultation) {
  if (consultation.consultation_type === 'blind_second_opinion') return 'Blind second opinion';
  if (consultation.consultation_type === 'data_audit') return 'Patient data check';
  if (consultation.consultation_type === 'evidence_review') return 'Clinical evidence check';
  if (consultation.consultation_type === 'action_comparison') return 'Relevant action comparison';
  if (consultation.consultation_type === 'specialist') return `${consultation.specialty ?? 'Specialist'} AI lens`;
  return 'Challenge';
}

function consultationStance(consultation) {
  const outcome = consultation.challenge_outcome ?? consultation.agreement;
  if (outcome === 'upheld') return 'supports';
  if (['qualified_support', 'materially_qualified', 'weakened'].includes(outcome)) return 'partially supports';
  if (['materially_weakened', 'overturned'].includes(outcome)) return 'challenges';
  return 'indeterminate';
}

function consultationView(consultation, claim) {
  const blind = consultation.blinded_to_primary_answer ? 'Blind to primary answer' : 'Informed by target claim';
  const sources = [...new Set([
    ...array(consultation.evidence_refs),
    ...array(consultation.supporting_patient_facts).map((fact) => fact?.source_ref).filter(Boolean)
  ])];
  const followUp = `<form class="ai-consultation-follow-up" data-ai-consultation-follow-up="${esc(consultation.consultation_id)}">
    <label for="ai-follow-up-${esc(consultation.consultation_id)}">Follow up within this ${esc(consultationTypeLabel(consultation))} boundary</label>
    <div><textarea id="ai-follow-up-${esc(consultation.consultation_id)}" name="question" rows="2" placeholder="Ask a follow-up without changing the consultation boundary"></textarea><button type="submit">Ask follow-up</button></div>
  </form>`;
  const revision = consultation.proposed_revision
    ? `<section class="ai-consultation-revision"><h4>Proposed revision</h4><blockquote>“${esc(consultation.proposed_revision)}”</blockquote>${consultation.revision_disposition
      ? `<p>Physician decision: ${esc(consultation.revision_disposition === 'accepted' ? 'Revision accepted' : 'Current wording kept')}.</p>`
      : `<div><button type="button" data-ai-accept-revision="${esc(consultation.consultation_id)}" data-ai-claim="${esc(claim.claim_id)}">Accept revision</button><button type="button" data-ai-keep-wording="${esc(consultation.consultation_id)}" data-ai-claim="${esc(claim.claim_id)}">Keep current wording</button></div>`}</section>`
    : '<section class="ai-consultation-revision"><h4>Proposed revision</h4><p>No revision proposed.</p></section>';
  return `<article class="ai-consultation ai-conversation-consultation" id="ai-consultation-${esc(consultation.consultation_id)}" tabindex="-1" data-ai-consultation-result="${esc(consultation.consultation_id)}">
    <header>
      <div><span>${consultation.is_follow_up ? 'Consultation follow-up' : 'Clinical consultation'}</span><strong>${esc(consultationTypeLabel(consultation))}</strong></div>
      <span>Completed</span>
    </header>
    <p class="ai-consultation-target"><strong>Linked clinical thought:</strong> ${esc(consultation.target_statement ?? claim.statement)}</p>
    <dl class="ai-consultation-core">
      <div><dt>Information boundary</dt><dd><strong>${blind}.</strong> ${esc(consultation.information_boundary)}</dd></div>
      <div><dt>Position</dt><dd>${esc(consultationStance(consultation))}</dd></div>
      <div><dt>Load-bearing reason</dt><dd>${esc(consultation.confidence?.basis ?? 'Not emitted')}</dd></div>
      <div><dt>Contradictory or missing information</dt><dd>${esc(consultation.confidence?.main_uncertainty ?? 'None emitted')}</dd></div>
      <div><dt>Highest-value next information</dt><dd>${esc(array(consultation.discriminating_information).join('; ') || 'Not emitted')}</dd></div>
    </dl>
    <p class="ai-consultation-position">${esc(consultation.position)}</p>
    ${revision}
    ${factsList('Source references', sources, 'ai-source-ref', true)}
    <small>${esc(consultation.source_line)}</small>
    ${followUp}
  </article>`;
}

function draftView(draft) {
  if (draft.draft_type === 'care_plan_bundle') {
    const bundle = draft.proposal_bundle ?? {};
    const entries = array(bundle.entries);
    const entry = entries[0] ?? {};
    const promoted = draft.promotion_state === 'promoted';
    return `<article class="ai-draft ai-care-plan-proposal">
      <header><div><span>${promoted ? 'Added to Care Plan' : 'Care Plan proposal ready'}</span><strong>Problem · Assessment · Plan · Orders</strong></div><span>Nonexecuting</span></header>
      <dl><div><dt>Problem</dt><dd>${esc(entry.problem?.proposed_label?.value ?? 'Not emitted')}</dd></div><div><dt>Assessment</dt><dd>${esc(entry.assessment?.value ?? 'Not emitted')}</dd></div><div><dt>Plan</dt><dd>${esc(entry.plan?.value ?? 'Not emitted')}</dd></div><div><dt>Orders</dt><dd>${entry.order_intents?.length ? esc(entry.order_intents.map((order) => order.display_name).join(', ')) : esc(bundle.order_note ?? 'No typed order intent was generated.')}</dd></div></dl>
      ${promoted
        ? `<button type="button" data-ai-open-care-plan>Open Care Plan</button>`
        : `<button type="button" class="primary" data-ai-promote-care-plan="${esc(draft.draft_id)}">Add to Care Plan</button>`}
      <small>Adds one editable problem-centered item to the Care Plan. It does not lock the note, authorize an order, release to the patient, write to the chart, or call an EMR adapter.</small>
      <details><summary>Source-traced proposal lineage</summary><dl><div><dt>Context packet</dt><dd>${esc(draft.patient_context_packet_hash)}</dd></div><div><dt>Adopted claim</dt><dd>${esc(array(draft.adopted_claim_ids).join(', '))}</dd></div><div><dt>Model</dt><dd>${esc(draft.model)}</dd></div></dl></details>
    </article>`;
  }
  const backendEditBoundary = draft.backend_source_content !== undefined
    ? ' Local edits are uncommitted physician-only overlays; the immutable backend source draft remains unchanged and no chart write occurs.'
    : '';
  return `<article class="ai-draft">
    <header><div><span>${esc(sentence(draft.draft_type))} · Physician-editable output</span><strong>Nonexecuting draft</strong></div><span>No chart write performed</span></header>
    <label for="ai-draft-${esc(draft.draft_id)}">Draft prose</label>
    <textarea id="ai-draft-${esc(draft.draft_id)}" data-ai-draft-editor="${esc(draft.draft_id)}" rows="6">${esc(draft.content)}</textarea>
    <p class="ai-draft-state">Physician edit state: <strong data-ai-draft-edit-state>${esc(sentence(draft.physician_edit_state ?? 'unedited'))}</strong>. Editing changes workspace draft prose only.${backendEditBoundary}</p>
    <details><summary>Source-traced draft lineage</summary><dl><div><dt>Context packet</dt><dd>${esc(draft.patient_context_packet_hash)}</dd></div><div><dt>Adopted claim</dt><dd>${esc(array(draft.adopted_claim_ids).join(', '))}</dd></div><div><dt>Model</dt><dd>${esc(draft.model)}</dd></div></dl></details>
  </article>`;
}

const CONSULTATION_OPTIONS = [
  ['data_audit', 'Patient data check'],
  ['challenge', 'Challenger'],
  ['blind_second_opinion', 'Blind second opinion'],
  ['specialist', 'Specialist lens'],
  ['evidence_review', 'Clinical evidence check'],
  ['action_comparison', 'Relevant action comparison']
];

function consultationSummary(consultation) {
  if (consultation.consultation_type === 'data_audit') return 'important information missing';
  const outcome = consultation.challenge_outcome ?? consultation.agreement;
  if (outcome === 'upheld') return 'claim upheld';
  if (outcome === 'weakened') return 'claim partially upheld';
  if (outcome === 'qualified_support') return 'claim supported with qualification';
  if (outcome === 'materially_qualified') return 'claim materially qualified';
  if (outcome === 'materially_weakened') return 'claim materially weakened';
  if (outcome === 'overturned') return 'claim overturned';
  return 'indeterminate';
}

function consultationStatus(workspace, thread, claim) {
  const completed = array(thread.consultations).filter((item) =>
    item.target_claim_id === claim.claim_id && item.is_follow_up !== true
  );
  const runs = array(workspace.consultationRuns).filter((item) =>
    item.claim_id === claim.claim_id
  );
  const rows = CONSULTATION_OPTIONS.map(([type, label]) => {
    const result = [...completed].reverse().find((item) => item.consultation_type === type);
    const run = [...runs].reverse().find((item) => item.consultation_type === type);
    if (run?.status === 'running') return `<li class="running"><span>…</span><strong>${label}</strong><span>Running</span></li>`;
    if (run?.status === 'failed') return `<li class="failed"><span>!</span><strong>${label}</strong><span>Failed · ${esc(run.error)}</span></li>`;
    if (result) return `<li class="completed"><button type="button" data-ai-open-consultation="${esc(result.consultation_id)}"><span>✓</span><strong>${label}</strong><span>Completed · ${esc(consultationSummary(result))}</span></button></li>`;
    return `<li><span>○</span><strong>${label}</strong><span>Not run</span></li>`;
  }).join('');
  return `<section class="ai-thought-consultations"><h4>Consultations</h4><ul>${rows}</ul></section>`;
}

function clinicalThoughtCard(workspace, thread, claim) {
  const selected = workspace.selectedClaimId === claim.claim_id || workspace.adoptionPendingClaimId === claim.claim_id;
  const consultations = array(thread.consultations).filter((item) => item.target_claim_id === claim.claim_id);
  const confirming = workspace.adoptionPendingClaimId === claim.claim_id;
  const proposal = array(thread.drafts).find((draft) =>
    draft.draft_type === 'care_plan_bundle' && array(draft.adopted_claim_ids).includes(claim.claim_id)
  );
  const detail = selected ? `<div class="ai-thought-detail">
    <p class="ai-confidence"><strong>${confidenceLine(claim.confidence)}</strong><span>Main limitation: ${esc(claim.confidence.main_uncertainty)}</span></p>
    <section class="ai-thought-basis"><h4>Clinical basis</h4><p>${esc(claim.confidence.basis)}</p></section>
    <div class="ai-thought-evidence-grid">
      ${factsList('Support', claim.supporting_patient_facts, '', true)}
      ${factsList('Contradictory evidence', claim.contradictory_patient_facts, '', true)}
      ${factsList('Missing information', claim.missing_information, '', true)}
      ${factsList('Alternatives considered', claim.alternative_explanations, '', true)}
    </div>
    <details><summary>Confidence conditions and provenance</summary>
      ${factsList('What would raise confidence', claim.confidence_raisers)}
      ${factsList('What would lower confidence', claim.confidence_lowerers)}
      ${factsList('Patient-data provenance', claim.patient_source_refs, 'ai-source-ref')}
    </details>
    ${consultationStatus(workspace, thread, claim)}
    ${claim.state !== 'dismissed' && !confirming ? consultationControls(claim) : ''}
    ${adoptionControls(workspace, claim, consultations)}
    ${proposal ? draftView(proposal) : ''}
  </div>` : '';
  return `<article class="ai-thought-card${selected ? ' selected' : ''}" id="ai-thought-${esc(claim.claim_id)}" tabindex="-1" data-ai-clinical-thought="${esc(claim.claim_id)}" data-claim-type="${esc(claim.claim_type)}">
    <button type="button" class="ai-thought-card-head" data-ai-review-claim="${esc(claim.claim_id)}" aria-expanded="${selected}">
      <span><span class="ai-thought-type">${esc(claimTypeLabel(claim))}</span><span class="ai-thought-state">${esc(claimStateLabel(claim))}</span></span>
      <strong>${esc(claim.statement)}</strong>
      ${selected ? '<span class="ai-thought-toggle">Selected · details below</span>' : '<span class="ai-thought-toggle">Review clinical thought</span>'}
    </button>
    ${detail}
  </article>`;
}

function messageView(message, thread, workspace) {
  const claims = array(message.claim_ids).map((id) => thread.claims.find((claim) => claim.claim_id === id)).filter(Boolean);
  return `<article class="ai-message ${message.role}">
    <header><strong>${message.role === 'physician' ? 'Physician' : 'Aleron AI'}</strong></header>
    <p>${esc(message.content)}</p>
    ${message.role === 'assistant' ? `<small>${esc(message.sourceLine ?? message.model ?? 'Source metadata Not emitted')}</small>` : ''}
    ${claims.map((claim) => clinicalThoughtCard(workspace, thread, claim)).join('')}
  </article>`;
}

function clinicalThreadTitle(thread) {
  const raw = String(thread?.title ?? '').trim();
  const firstQuestion = array(thread?.messages).find((message) => message.role === 'physician')?.content ?? '';
  const source = !raw || /^(new conversation|untitled thread)$/i.test(raw) ? firstQuestion : raw;
  if (!source) return 'New case conference';
  const rules = [
    [/initial case review/i, 'Initial preventive review'],
    [/cross-cutting patterns?|patterns? deserve attention/i, 'Cross-domain risk review'],
    [/fatigue|reported symptoms?/i, 'Fatigue and symptom review'],
    [/overlooking|most likely to miss/i, 'Potential missed drivers'],
    [/medication.*symptom|longitudinal data/i, 'Medication and symptom review'],
    [/cardiometabolic/i, 'Cardiometabolic risk strategy'],
    [/renal|kidney/i, 'Renal trajectory review'],
    [/cancer.*screen/i, 'Cancer screening priorities']
  ];
  const matched = rules.find(([pattern]) => pattern.test(source));
  if (matched) return matched[1];
  const clean = source.replace(/[?.!]+$/g, '').replace(/^review\s+/i, '').trim();
  return clean;
}

function conversationTabs(workspace) {
  const threads = [...array(workspace.threads)].sort((a, b) => new Date(b.lastActivity ?? 0) - new Date(a.lastActivity ?? 0));
  const active = threads.find((thread) => thread.threadId === workspace.activeThreadId);
  const recent = threads.slice(0, 4);
  if (active && !recent.some((thread) => thread.threadId === active.threadId)) {
    recent.splice(Math.max(0, recent.length - 1), 1, active);
  }
  const tab = (thread, role = 'tab') => {
    const selected = thread.threadId === workspace.activeThreadId;
    const title = clinicalThreadTitle(thread);
    return `<button type="button" role="${role}" data-ai-thread="${esc(thread.threadId)}" class="${selected ? 'on' : ''}" ${role === 'tab' ? `id="ai-conference-tab-${esc(thread.threadId)}" aria-selected="${selected}" aria-controls="ai-conversation-panel" tabindex="${selected ? '0' : '-1'}"` : `aria-current="${selected ? 'page' : 'false'}"`} title="${esc(title)} · Last activity ${esc(formatActivity(thread.lastActivity))}"><strong>${esc(title)}</strong></button>`;
  };
  return `<nav class="ai-conference-tabs" aria-label="Patient AI case conferences">
    <div class="ai-conference-recent" role="tablist" aria-label="Recent case conferences">${recent.map((thread) => tab(thread)).join('')}</div>
    <div class="ai-conference-actions">
      <button type="button" class="ai-new-thread" data-ai-new-thread>+ New</button>
      <details class="ai-conversation-overflow"><summary>All conversations</summary><div role="menu" aria-label="All patient AI conversations">${threads.map((thread) => `<div role="none">${tab(thread, 'menuitem')}<span>${esc(formatActivity(thread.lastActivity))}</span></div>`).join('')}</div></details>
    </div>
  </nav>`;
}

function emptyThread() {
  const starters = [
    ['initial-review', 'Run initial case review'],
    ['patterns', 'What cross-cutting patterns deserve attention?'],
    ['symptoms', "What might explain this patient's reported symptoms?"],
    ['overlooking', 'What am I most likely to be overlooking?'],
    ['longitudinal', 'Review medication, symptom, and longitudinal data together.']
  ];
  return `<section class="ai-empty">
    <h2>Start a case conference</h2>
    <p>Ask a focused question. No claim enters the Care Plan until you adopt it.</p>
    <div>${starters.map(([id, label]) => `<button type="button" data-ai-starter="${id}" data-ai-question="${esc(label)}">${esc(label)}</button>`).join('')}</div>
  </section>`;
}

function contextStatus(workspace) {
  const context = workspace.contextStatus ?? {};
  const domains = array(context.domains);
  return `<section class="ai-context-status" aria-label="Context status">
    <div><strong>Context loaded</strong><span>Snapshot ${esc(context.snapshot ?? 'Not emitted')}</span></div>
    <div><span>${domains.length} source domains</span><span>${esc(context.missingCount ?? 'Not emitted')} missing or stale</span></div>
    <details><summary>Provenance</summary><dl><div><dt>Packet hash</dt><dd>${esc(workspace.packetHash)}</dd></div><div><dt>Packet version</dt><dd>${esc(workspace.packetVersion)}</dd></div></dl></details>
  </section>`;
}

function consultationControls(claim) {
  return `<section class="ai-thought-controls" aria-label="Clinical thought actions">
    <button type="button" data-ai-discuss-claim="${esc(claim.claim_id)}">Discuss</button>
    <details class="ai-consult-menu"><summary>Consult ▾</summary><div role="menu" aria-label="Consultation types">
      <button type="button" role="menuitem" data-ai-consultation="challenge" data-ai-claim="${esc(claim.claim_id)}">Challenge this</button>
      <button type="button" role="menuitem" data-ai-consultation="blind_second_opinion" data-ai-claim="${esc(claim.claim_id)}">Blind second opinion</button>
      <div class="ai-specialist-menu" role="none"><label>Specialist lens<select data-ai-specialty><option>General Internal Medicine</option><option>Cardiology</option><option>Endocrinology</option><option selected>Sleep Medicine</option><option>Clinical Pharmacology</option><option>Neurology</option><option>Psychiatry</option></select></label><button type="button" role="menuitem" data-ai-consultation="specialist" data-ai-claim="${esc(claim.claim_id)}">Run specialist lens</button></div>
      <button type="button" role="menuitem" data-ai-consultation="data_audit" data-ai-claim="${esc(claim.claim_id)}">Check patient data</button>
      <button type="button" role="menuitem" data-ai-consultation="evidence_review" data-ai-claim="${esc(claim.claim_id)}">Check clinical evidence</button>
      <button type="button" role="menuitem" data-ai-consultation="action_comparison" data-ai-claim="${esc(claim.claim_id)}">Compare relevant actions</button>
    </div></details>
  </section>`;
}

function adoptionControls(workspace, claim, consultations) {
  if (claim.state === 'adopted') {
    const proposal = array(workspace.activeThread?.drafts).find((draft) => draft.draft_type === 'care_plan_bundle' && array(draft.adopted_claim_ids).includes(claim.claim_id));
    return proposal
      ? `<section class="ai-draft-actions"><h3 tabindex="-1">${proposal.promotion_state === 'promoted' ? 'Added to Care Plan' : 'Complete Care Plan proposal ready'}</h3><small>Review the structured bundle in the conversation before adding it to the Care Plan.</small></section>`
      : `<section class="ai-draft-actions"><h3 tabindex="-1">Care Plan proposal not created</h3><small>The conclusion remains adopted. Retry structured proposal generation without adopting it again.</small><button type="button" class="secondary" data-ai-retry-care-plan-proposal="${esc(claim.claim_id)}">Retry proposal</button></section>`;
  }
  if (claim.state === 'dismissed') return '<p class="ai-thought-boundary">Dismissed claims cannot be adopted or used for drafting.</p>';
  if (workspace.adoptionPendingClaimId === claim.claim_id) {
    const contradictions = array(claim.contradictory_patient_facts);
    const considered = array(consultations).filter((consultation) => consultation.target_claim_id === claim.claim_id);
    return `<section class="ai-adoption-confirmation">
    <h3 tabindex="-1">Confirm this exact claim</h3>
    <blockquote>${esc(claim.statement)}</blockquote>
    <div class="ai-adoption-review">
      <p><strong>Current confidence</strong><span>${confidenceLine(claim.confidence)}</span></p>
      <section><h4>Unresolved contradictions (${contradictions.length})</h4>${contradictions.length ? `<ul>${contradictions.map((value) => `<li>${esc(typeof value === 'string' ? value : value.statement ?? value.label ?? 'Contradiction recorded')}</li>`).join('')}</ul>` : '<p>None recorded.</p>'}</section>
      <section><h4>Consultations considered (${considered.length})</h4>${considered.length ? `<ul>${considered.map((consultation) => `<li>${esc(consultationTypeLabel(consultation))}: ${esc(consultation.agreement ? sentence(consultation.agreement) : 'Position recorded')}</li>`).join('')}</ul>` : '<p>None.</p>'}</section>
    </div>
    <p>This confirmation promotes only the quoted claim into an adopted conclusion. It does not write to the chart.</p>
    <div><button type="button" data-ai-cancel-adoption>Cancel</button><button type="button" class="primary" data-ai-adopt="${esc(claim.claim_id)}" data-ai-confirmed-statement="${esc(claim.statement)}">Adopt for drafting</button></div>
  </section>`;
  }
  return `<section class="ai-disposition"><button type="button" data-ai-begin-adoption="${esc(claim.claim_id)}">Adopt</button><button type="button" data-ai-dismiss="${esc(claim.claim_id)}">Dismiss</button></section>`;
}

function clinicalThinkingOverview(thread, selectedClaimId) {
  const ideas = array(thread?.claims).filter((claim) => claim.state !== 'dismissed');
  const open = ideas.filter((claim) => claim.state !== 'adopted').length;
  const adopted = ideas.filter((claim) => claim.state === 'adopted').length;
  const navigation = ideas.length
    ? `<details><summary>Navigate ideas</summary><nav aria-label="Clinical thinking ideas">${ideas.map((claim) => `<button type="button" data-ai-thought-nav="${esc(claim.claim_id)}" class="${claim.claim_id === selectedClaimId ? 'on' : ''}"><span>${esc(claimTypeLabel(claim))} · ${esc(claimStateLabel(claim))}</span><strong>${esc(claim.statement)}</strong></button>`).join('')}</nav></details>`
    : '<small>No material clinical thoughts yet.</small>';
  return `<section class="ai-thinking-overview" aria-label="Clinical thinking overview">
    <header><strong>Clinical thinking</strong><span>${open} open · ${adopted} adopted</span></header>
    ${navigation}
  </section>`;
}

export function aiColleagueView(workspace) {
  if (!workspace) return `<header class="screen-head"><div><h1>Aleron AI</h1></div></header><section class="ai-unavailable"><h2>AI workspace unavailable</h2><p>Patient context was not loaded.</p></section>`;
  const thread = workspace.activeThread ?? workspace.threads.find((item) => item.threadId === workspace.activeThreadId);
  const messages = thread?.messages?.map((message) => messageView(message, thread, workspace)).join('') ?? '';
  const consultationResults = array(thread?.consultations).map((consultation) => {
    const claim = array(thread?.claims).find((candidate) => candidate.claim_id === consultation.target_claim_id);
    return claim ? consultationView(consultation, claim) : '';
  }).join('');
  const drafts = array(thread?.drafts).filter((draft) => draft.draft_type !== 'care_plan_bundle').map(draftView).join('');
  const unavailable = !workspace.fixtureMode && !workspace.providerAvailable
    ? `<section class="ai-unavailable"><h2>Model provider unavailable</h2><p>No configured provider is available for this patient workspace. No fallback answer was generated.</p></section>`
    : '';
  const providerError = workspace.providerError
    ? `<section class="ai-unavailable" role="alert"><h2>Model unavailable</h2><p>${esc(workspace.providerError)}</p></section>`
    : '';
  const providerPending = workspace.providerPending === true;
  const discussingClaim = array(thread?.claims).find((claim) =>
    claim.claim_id === workspace.discussingClaimId
  );
  const discussionAnchor = discussingClaim
    ? `<div class="ai-discussion-anchor"><span>Discussing: ${esc(discussingClaim.statement)}</span><button type="button" data-ai-clear-discussion aria-label="Stop discussing this clinical thought">×</button></div>`
    : '';
  const providerLabel = workspace.providerMode === 'codex_subscription'
    ? '<div class="ai-fixture-banner">GPT-5.6 Sol · Codex subscription · synthetic case</div>'
    : workspace.providerMode === 'backend'
      ? '<div class="ai-fixture-banner">Backend-owned physician AI thread · synthetic fixture provider</div>'
      : '';
  return `<header class="screen-head ai-screen-head"><div><h1>Aleron AI</h1><p>Patient-specific clinical thought partner.</p></div></header>
    ${workspace.fixtureMode ? `<div class="ai-fixture-banner">Illustrative fixture · not model generated</div>` : ''}
    ${providerLabel}
    <section class="ai-workspace">
      ${conversationTabs(workspace)}
      <main class="ai-conversation" id="ai-conversation-panel" role="tabpanel" aria-labelledby="ai-conference-tab-${esc(thread?.threadId ?? workspace.activeThreadId)}">
        ${contextStatus(workspace)}
        ${clinicalThinkingOverview(thread, workspace.selectedClaimId)}
        ${providerError}
        ${unavailable || (!messages ? emptyThread() : `<div class="ai-message-list">${messages}${consultationResults}${drafts}</div>`)}
        ${!unavailable ? `<form data-ai-composer class="ai-composer">${discussionAnchor}<label for="ai-prompt">${discussingClaim ? 'Continue this clinical-thought discussion' : 'Ask about this patient'}</label><div><textarea id="ai-prompt" name="message" rows="2" placeholder="${discussingClaim ? 'Ask about the selected clinical thought' : 'Ask a clinical question'}" ${providerPending ? 'disabled' : ''}></textarea><button type="submit" class="primary" ${providerPending ? 'disabled' : ''}>${providerPending ? (workspace.providerMode === 'codex_subscription' ? 'Waiting for Codex…' : 'Saving to backend…') : 'Send'}</button></div></form>` : ''}
      </main>
    </section>`;
}
