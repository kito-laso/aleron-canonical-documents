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

function stateLabel(claim) {
  if (claim.state === 'adopted') return 'Adopted conclusion';
  if (claim.state === 'dismissed') return 'Dismissed hypothesis';
  return 'Working hypothesis';
}

function factsList(title, values, itemClass = '') {
  const rows = array(values);
  if (!rows.length) return '';
  return `<section class="ai-ledger-section"><h4>${esc(title)}</h4><ul>${rows.map((value) => {
    if (typeof value === 'string') return `<li${itemClass ? ` class="${esc(itemClass)}"` : ''}>${esc(value)}</li>`;
    const unit = value.units ? ` ${esc(value.units)}` : '';
    const source = value.source_ref ? `<small>${esc(value.source_ref)}</small>` : '';
    return `<li><strong>${esc(value.label)}</strong> ${esc(value.value)}${unit}${source}</li>`;
  }).join('')}</ul></section>`;
}

function consultationTypeLabel(consultation) {
  if (consultation.consultation_type === 'blind_second_opinion') return 'Blind second opinion';
  if (consultation.consultation_type === 'data_audit') return 'Data audit';
  if (consultation.consultation_type === 'evidence_review') return 'Evidence review';
  if (consultation.consultation_type === 'specialist') return `${consultation.specialty ?? 'Specialist'} AI lens`;
  return 'Challenge';
}

function consultationView(consultation, claim) {
  const blind = consultation.blinded_to_primary_answer ? 'Blind to primary answer' : 'Informed by target claim';
  const agreement = consultation.agreement ? sentence(consultation.agreement) : 'Position recorded';
  const followUp = consultation.consultation_type === 'specialist' ? `<form class="ai-consultation-follow-up" data-ai-consultation-follow-up="${esc(consultation.consultation_id)}">
    <label for="ai-follow-up-${esc(consultation.consultation_id)}">Follow up with ${esc(consultationTypeLabel(consultation))}</label>
    <div><textarea id="ai-follow-up-${esc(consultation.consultation_id)}" name="question" rows="2" placeholder="Ask this same specialist AI lens"></textarea><button type="submit">Ask follow-up</button></div>
  </form>` : '';
  return `<article class="ai-consultation" data-ai-consultation-result="${esc(consultation.consultation_id)}">
    <header>
      <div><span>${consultation.is_follow_up ? 'Consultation follow-up' : 'Aleron AI consultation'}</span><strong>${esc(consultationTypeLabel(consultation))}</strong></div>
      <span>${esc(agreement)}</span>
    </header>
    <p class="ai-consultation-target"><strong>Consultation on:</strong> ${esc(claim.statement)}</p>
    <p>${esc(consultation.position)}</p>
    ${consultation.confidence ? `<p class="ai-confidence"><strong>${confidenceLine(consultation.confidence)}</strong><span>Main limitation: ${esc(consultation.confidence.main_uncertainty)}</span></p>` : ''}
    <details><summary>Independence and discriminating information</summary><p><strong>${blind}.</strong> ${esc(consultation.information_boundary)}</p>${factsList('Most useful next information', consultation.discriminating_information)}</details>
    <small>${esc(consultation.source_line)}</small>
    ${followUp}
  </article>`;
}

function draftView(draft) {
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

function inlineClaimView(claim) {
  return `<article class="ai-inline-claim" data-ai-inline-claim="${esc(claim.claim_id)}">
    <span>${esc(stateLabel(claim))}</span>
    <p>${esc(claim.statement)}</p>
    <div><small>${confidenceLine(claim.confidence)} Main limitation: ${esc(claim.confidence.main_uncertainty)}</small><button type="button" data-ai-review-claim="${esc(claim.claim_id)}">Review claim</button></div>
  </article>`;
}

function messageView(message, thread) {
  const claims = array(message.claim_ids).map((id) => thread.claims.find((claim) => claim.claim_id === id)).filter(Boolean);
  const consultations = claims.flatMap((claim) => thread.consultations
    .filter((item) => item.target_claim_id === claim.claim_id)
    .map((item) => consultationView(item, claim)));
  return `<article class="ai-message ${message.role}">
    <header><strong>${message.role === 'physician' ? 'Physician' : 'Aleron AI'}</strong></header>
    <p>${esc(message.content)}</p>
    ${message.role === 'assistant' ? `<small>${esc(message.sourceLine ?? message.model ?? 'Source metadata Not emitted')}</small>` : ''}
    ${claims.map(inlineClaimView).join('')}
    ${consultations.join('')}
  </article>`;
}

function threadRail(workspace) {
  return `<aside class="ai-thread-rail" aria-label="Patient AI conversations">
    <button type="button" class="ai-new-thread" data-ai-new-thread>New conversation</button>
    <nav>${workspace.threads.map((thread) => `<button type="button" data-ai-thread="${esc(thread.threadId)}" class="${thread.threadId === workspace.activeThreadId ? 'on' : ''}" aria-current="${thread.threadId === workspace.activeThreadId ? 'true' : 'false'}"><strong>${esc(thread.title)}</strong><span>${esc(formatActivity(thread.lastActivity))}</span></button>`).join('')}</nav>
  </aside>`;
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
    <p>Ask a focused question or run a physician-invoked initial review. Opening this tab does not create an assessment.</p>
    <div>${starters.map(([id, label]) => `<button type="button" data-ai-starter="${id}" data-ai-question="${esc(label)}">${esc(label)}</button>`).join('')}</div>
  </section>`;
}

function contextStatus(workspace) {
  const context = workspace.contextStatus ?? {};
  return `<section class="ai-context-status" aria-label="Context status">
    <div><strong>Context status</strong><span>${esc(workspace.patientDisplayName)}</span></div>
    <div><span>Snapshot ${esc(context.snapshot ?? 'Not emitted')}</span><span>${esc(array(context.domains).join(', ') || 'No domains emitted')}</span><span>${esc(context.missingCount ?? 'Not emitted')} missing or stale</span></div>
    <details><summary>Provenance</summary><dl><div><dt>Packet hash</dt><dd>${esc(workspace.packetHash)}</dd></div><div><dt>Packet version</dt><dd>${esc(workspace.packetVersion)}</dd></div></dl></details>
  </section>`;
}

function consultationControls(claim) {
  return `<section class="ai-ledger-controls" aria-label="Independent consultation controls">
    <h3>Consult independently</h3>
    <button type="button" data-ai-consultation="challenge" data-ai-claim="${esc(claim.claim_id)}">Challenge this</button>
    <button type="button" data-ai-consultation="blind_second_opinion" data-ai-claim="${esc(claim.claim_id)}">Get blind second opinion</button>
    <label>Specialist AI lens<select data-ai-specialty><option>General Internal Medicine</option><option>Cardiology</option><option>Endocrinology</option><option selected>Sleep Medicine</option><option>Clinical Pharmacology</option><option>Neurology</option><option>Psychiatry</option></select></label>
    <button type="button" data-ai-consultation="specialist" data-ai-claim="${esc(claim.claim_id)}">Ask specialist</button>
    <button type="button" data-ai-consultation="evidence_review" data-ai-claim="${esc(claim.claim_id)}">Check evidence</button>
    <button type="button" data-ai-consultation="data_audit" data-ai-claim="${esc(claim.claim_id)}">Check the data</button>
  </section>`;
}

function adoptionControls(workspace, claim, consultations) {
  if (claim.state === 'adopted') return `<section class="ai-draft-actions"><h3>Draft from adopted conclusion</h3>
    <button type="button" data-ai-draft="note_section" data-ai-claim="${esc(claim.claim_id)}">Draft note section</button>
    <button type="button" data-ai-draft="recommendation" data-ai-claim="${esc(claim.claim_id)}">Draft recommendation</button>
    <button type="button" data-ai-draft="problem_proposal" data-ai-claim="${esc(claim.claim_id)}">Draft problem proposal</button>
    <button type="button" data-ai-draft="order_intent" data-ai-claim="${esc(claim.claim_id)}">Draft order intent</button>
    <small>Drafts remain editable and cannot execute, transmit, sign, send, commit, or enter the chart.</small>
  </section>`;
  if (claim.state === 'dismissed') return '<p class="ai-ledger-boundary">Dismissed claims cannot be adopted or used for drafting.</p>';
  if (workspace.adoptionPendingClaimId === claim.claim_id) {
    const contradictions = array(claim.contradictory_patient_facts);
    const considered = array(consultations).filter((consultation) => consultation.target_claim_id === claim.claim_id);
    return `<section class="ai-adoption-confirmation">
    <h3>Confirm this exact claim</h3>
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
  return `<section class="ai-disposition"><button type="button" data-ai-begin-adoption="${esc(claim.claim_id)}">Prepare adoption</button><button type="button" data-ai-dismiss="${esc(claim.claim_id)}">Dismiss hypothesis</button></section>`;
}

function claimLedger(workspace, thread) {
  const claims = array(thread?.claims);
  const selected = claims.find((claim) => claim.claim_id === workspace.selectedClaimId) ?? claims[0] ?? null;
  const claimList = claims.map((claim) => `<button type="button" data-ai-ledger-claim="${esc(claim.claim_id)}" class="${claim.claim_id === selected?.claim_id ? 'on' : ''}" aria-pressed="${claim.claim_id === selected?.claim_id}"><span>${esc(stateLabel(claim))}</span><strong>${esc(claim.statement)}</strong></button>`).join('');
  const detail = selected ? `<div class="ai-ledger-detail">
      <header><span>${esc(stateLabel(selected))}</span><strong>${esc(selected.statement)}</strong></header>
      <p class="ai-confidence"><strong>${confidenceLine(selected.confidence)}</strong><span>Main limitation: ${esc(selected.confidence.main_uncertainty)}</span></p>
      <details><summary>Basis, alternatives, and provenance</summary>
        <p>${esc(selected.confidence.basis)}</p>
        ${factsList('Supporting patient facts', selected.supporting_patient_facts)}
        ${factsList('Contradictory patient facts', selected.contradictory_patient_facts)}
        ${factsList('Alternatives considered', selected.alternative_explanations)}
        ${factsList('Missing information', selected.missing_information)}
        ${factsList('What would raise confidence', selected.confidence_raisers)}
        ${factsList('What would lower confidence', selected.confidence_lowerers)}
        ${factsList('Patient-data provenance', selected.patient_source_refs, 'ai-source-ref')}
      </details>
      ${selected.state !== 'dismissed' ? consultationControls(selected) : ''}
      ${adoptionControls(workspace, selected, thread.consultations)}
    </div>` : '<p class="ai-ledger-empty">No material claims yet. Conversation remains exploratory until the AI emits a validated claim.</p>';
  return `<aside class="ai-claim-ledger" data-ai-claim-ledger aria-label="Working claim ledger">
    <header><div><h2>Working claims</h2><span>${claims.length} in this thread</span></div><p>Review, challenge, and adopt here. Transcript prose does not become chart truth.</p></header>
    ${claims.length > 1 ? `<nav>${claimList}</nav>` : ''}
    ${detail}
  </aside>`;
}

export function aiColleagueView(workspace) {
  if (!workspace) return `<header class="screen-head"><div><h1>Aleron AI</h1></div></header><section class="ai-unavailable"><h2>AI workspace unavailable</h2><p>Patient context was not loaded.</p></section>`;
  const thread = workspace.activeThread ?? workspace.threads.find((item) => item.threadId === workspace.activeThreadId);
  const messages = thread?.messages?.map((message) => messageView(message, thread)).join('') ?? '';
  const drafts = thread?.drafts?.map(draftView).join('') ?? '';
  const unavailable = !workspace.fixtureMode && !workspace.providerAvailable
    ? `<section class="ai-unavailable"><h2>Model provider unavailable</h2><p>No configured provider is available for this patient workspace. No fallback answer was generated.</p></section>`
    : '';
  const providerError = workspace.providerError
    ? `<section class="ai-unavailable" role="alert"><h2>Model unavailable</h2><p>${esc(workspace.providerError)}</p></section>`
    : '';
  const providerPending = workspace.providerPending === true;
  const providerLabel = workspace.providerMode === 'codex_subscription'
    ? '<div class="ai-fixture-banner">GPT-5.6 Sol · Codex subscription · synthetic case</div>'
    : workspace.providerMode === 'backend'
      ? '<div class="ai-fixture-banner">Backend-owned physician AI thread · synthetic fixture provider</div>'
      : '';
  return `<header class="screen-head ai-screen-head"><div><h1>Aleron AI</h1><p>Patient-specific clinical thought partner.</p></div></header>
    ${workspace.fixtureMode ? `<div class="ai-fixture-banner">Illustrative fixture responses, not model generated</div>` : ''}
    ${providerLabel}
    <section class="ai-workspace">
      ${threadRail(workspace)}
      <main class="ai-conversation">
        ${contextStatus(workspace)}
        ${providerError}
        ${unavailable || (!messages ? emptyThread() : `<div class="ai-message-list">${messages}${drafts}</div>`)}
        ${!unavailable ? `<form data-ai-composer class="ai-composer"><label for="ai-prompt">Ask about this patient</label><div><textarea id="ai-prompt" name="message" rows="2" placeholder="Ask a clinical question" ${providerPending ? 'disabled' : ''}></textarea><button type="submit" class="primary" ${providerPending ? 'disabled' : ''}>${providerPending ? (workspace.providerMode === 'codex_subscription' ? 'Waiting for Codex…' : 'Saving to backend…') : 'Send'}</button></div></form>` : ''}
      </main>
      ${claimLedger(workspace, thread)}
    </section>`;
}
