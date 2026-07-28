function esc(value) {
  return String(value ?? '').replace(/[—–]/g, '-').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function selected(value, current) {
  return value === current ? ' selected' : '';
}

function fieldOrigin(field) {
  const labels = { ai_derived: 'AI drafted', source_copied: 'Source copied without AI transformation', physician_edited: 'Physician edited', physician_authored: 'Physician added' };
  return labels[field?.authorship?.origin] ?? 'Lineage unavailable';
}

function lineage(field) {
  const adopted = (field.source_adopted_claim_ids ?? []).map((id) => `Adopted claim ${id}`);
  const promoted = (field.source_promotion_event_ids ?? []).map((id) => `Promotion ${id}`);
  const model = field.model_id ? [`${field.model_id} · ${field.prompt_version}`] : [];
  return [...adopted, ...promoted, ...model].join(' · ');
}

function fieldMeta(field) {
  const detail = lineage(field);
  if (!detail) return `<small class="cp-field-meta"><strong>${esc(fieldOrigin(field))}</strong></small>`;
  return `<details class="cp-field-meta"><summary>${esc(fieldOrigin(field))} · lineage</summary><small>${esc(detail)}</small></details>`;
}

function displayState(value) {
  const labels = {
    no_match: 'No existing match',
    not_checked: 'Not checked',
    matched_existing: 'Matched existing',
    catalog_match_missing: 'Catalog match required',
    pending: 'Awaiting order authorization',
    locked_simulated: 'Note locked (simulation)',
    unlocked: 'Editable draft',
    authorized_simulated: 'Authorized in simulation'
  };
  return labels[value] ?? String(value ?? 'Not emitted').replaceAll('_', ' ');
}

function orderCard(order, locked) {
  const excluded = order.inclusion_state === 'excluded';
  const blockers = order.adapter_block_reasons ?? [];
  const authorization = order.authorization_state === 'authorized_simulated'
    ? 'Authorized simulation payload frozen'
    : order.validation_state === 'valid'
      ? 'Ready for simulation authorization'
      : blockers.includes('catalog_match_missing')
        ? 'Catalog match required'
        : 'Needs review before authorization';
  return `<article class="cp-order ${excluded ? 'excluded' : ''}" data-care-plan-order="${esc(order.order_intent_id)}">
    <header><div><span>Blood laboratory</span><h5>${esc(order.display_name)}</h5></div><strong>${esc(authorization)}</strong></header>
    <p class="cp-order-indication">${esc(order.clinical_indication)}</p>
    <div class="cp-order-summary"><span>${esc(order.timing)}</span><span>${esc(order.specimen)}</span><span>${esc(order.collection_method)}</span></div>
    <details class="cp-order-editor"><summary>Edit order intent</summary><div class="cp-order-grid">
      <label>Clinical indication<input data-care-plan-order-field="${esc(order.order_intent_id)}:clinical_indication" value="${esc(order.clinical_indication)}" ${locked || order.authorization_state ? 'disabled' : ''}></label>
      <label>Timing<input data-care-plan-order-field="${esc(order.order_intent_id)}:timing" value="${esc(order.timing)}" ${locked || order.authorization_state ? 'disabled' : ''}></label>
      <label>Specimen<input data-care-plan-order-field="${esc(order.order_intent_id)}:specimen" value="${esc(order.specimen)}" ${locked || order.authorization_state ? 'disabled' : ''}></label>
      <label>Collection<input data-care-plan-order-field="${esc(order.order_intent_id)}:collection_method" value="${esc(order.collection_method)}" ${locked || order.authorization_state ? 'disabled' : ''}></label>
    </div></details>
    <div class="cp-order-controls"><span>Catalog: ${esc(order.catalog_test_key ?? 'No catalog match')}</span>${order.catalog_match_state !== 'verified' ? `<button type="button" class="secondary" data-care-plan-catalog="${esc(order.order_intent_id)}" ${locked ? 'disabled' : ''}>Match approved fixture catalog</button>` : ''}<button type="button" class="secondary" data-care-plan-order-toggle="${esc(order.order_intent_id)}" ${locked || order.authorization_state ? 'disabled' : ''}>${excluded ? 'Restore order' : 'Remove order'}</button></div>
  </article>`;
}

function problemEntry(entry, index, locked, highlightedEntryId = null) {
  const problem = entry.problem;
  const noOrders = entry.order_intents.length === 0;
  const highlighted = entry.entry_id === highlightedEntryId;
  return `<article class="cp-problem${highlighted ? ' cp-problem-highlighted' : ''}" data-care-plan-entry="${esc(entry.entry_id)}"${highlighted ? ' data-new-care-plan-item="true"' : ''}>
    <header class="cp-entry-head"><span>${String(index + 1).padStart(2, '0')}</span><div><h3>Problem</h3><p>${esc(problem.proposed_label.value)}</p></div><label>Entry<select data-care-plan-entry-inclusion="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}><option value="included"${selected('included', problem.entry_inclusion)}>Included</option><option value="removed"${selected('removed', problem.entry_inclusion)}>Removed</option></select></label></header>
    ${fieldMeta(problem.proposed_label)}
    <div class="cp-problem-controls">
      <label>Problem label<input data-care-plan-problem-label="${esc(entry.entry_id)}" value="${esc(problem.proposed_label.value)}" ${locked ? 'disabled' : ''}></label>
      <label>Diagnostic certainty<select data-care-plan-certainty="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}>${['confirmed','provisional','monitoring','not_applicable'].map((value) => `<option value="${value}"${selected(value, problem.diagnostic_certainty)}>${esc(value.replaceAll('_',' '))}</option>`).join('')}</select></label>
      <label>EMR match<input value="${esc(displayState(problem.emr_match_state))}${problem.matched_problem_id ? ` · ${esc(problem.matched_problem_id)}` : ''}" disabled></label>
      <label>Problem-list disposition<select data-care-plan-disposition="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}>${['note_only','add_to_active_problem_list','update_existing_problem'].map((value) => `<option value="${value}"${selected(value, problem.problem_list_disposition)} ${value === 'update_existing_problem' && !problem.matched_problem_id ? 'disabled' : ''}>${esc(value.replaceAll('_',' '))}</option>`).join('')}</select></label>
    </div>
    <section class="cp-clinical-field"><h4>Assessment</h4><textarea data-care-plan-assessment="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}>${esc(entry.assessment.value)}</textarea></section>
    <section class="cp-clinical-field"><h4>Plan</h4><textarea data-care-plan-plan="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}>${esc(entry.plan.value)}</textarea></section>
    <section class="cp-orders"><div class="cp-section-head"><div><h4>Orders</h4><p>${noOrders ? 'No order results from this plan.' : `${entry.order_intents.length} blood-laboratory intents`}</p></div><button type="button" class="secondary" data-care-plan-add-order="${esc(entry.entry_id)}" ${locked ? 'disabled' : ''}>Add blood-laboratory intent</button></div>${entry.order_intents.map((order) => orderCard(order, locked)).join('')}</section>
  </article>`;
}

function receipts(state) {
  if (!state.receipts.length) return '<p class="truth-empty">No simulation receipts yet.</p>';
  const label = (receipt) => receipt.receipt_kind.includes('note_lock')
    ? 'Note locked in simulation'
    : receipt.receipt_kind.includes('order_authorization')
      ? 'Order set authorized in simulation'
      : receipt.receipt_kind.includes('problem')
        ? 'Problem-list decision recorded in simulation'
        : 'Simulation workflow receipt';
  return state.receipts.map((receipt) => `<div class="cp-receipt"><strong>${label(receipt)}</strong><small>No native record was created.</small><details><summary>Technical details</summary><span>${esc(receipt.receipt_id)}</span><small>${esc(receipt.receipt_kind.replaceAll('_', ' '))}</small></details></div>`).join('');
}

function projections(state) {
  const history = state.projections.notes_history.map((row) => `<div><strong>Note locked in simulation</strong><small>Immutable note snapshot retained.</small><details><summary>Technical details</summary><span>${esc(row.note_id)}</span><small>${esc(row.note_lock_receipt_id)}</small></details></div>`).join('') || '<p class="truth-empty">No locked notes.</p>';
  const labs = state.projections.lab_orders.map((row) => `<div><strong>${row.projection_kind?.includes('pending') ? 'Orders pending authorization' : 'Orders authorized in simulation'}</strong><small>${esc(row.label ?? displayState(row.status ?? ''))}${row.native_id ? ` · native ${esc(row.native_id)}` : ' · no native order created'}</small><details><summary>Technical details</summary><span>${esc(row.projection_kind.replaceAll('_',' '))}</span></details></div>`).join('') || '<p class="truth-empty">No authorization receipts and no pending order sets.</p>';
  const emr = state.projections.emr.map((row) => `<div><strong>No Canvas record created</strong><small>Simulation receipt retained for review.</small><details><summary>Technical details</summary><span>${esc(row.simulation_note_receipt_id ?? row.simulation_order_receipt_id ?? row.simulation_receipt_id ?? 'No simulation receipt')}</span><small>Patient link: ${esc(displayState(row.canvas_patient_link_state))}</small></details></div>`).join('') || '<p class="truth-empty">No Canvas records or simulation references.</p>';
  return `<section class="cp-projections"><article><h3>Notes History</h3>${history}</article><article><h3>Lab Orders</h3>${labs}</article><article><h3>EMR</h3>${emr}</article></section>`;
}

function pendingTransitionOutcome(state) {
  const transition = state.last_transition;
  if (transition?.status !== 'succeeded') return '';
  if (transition.transition_kind === 'revise_pending_order_set') {
    const changes = Object.entries(transition.changes ?? {}).map(([field, values]) => {
      const label = field.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
      return `<li><strong>${esc(label)}</strong><span>${esc(values?.from ?? 'Not emitted')} → ${esc(values?.to ?? 'Not emitted')}</span></li>`;
    }).join('');
    return `<section class="cp-transition-outcome" role="status"><strong>Order revision applied</strong><p>${esc(transition.display_name ?? transition.order_intent_id ?? 'Order')}</p>${changes ? `<ul>${changes}</ul>` : ''}<small>${esc(transition.reason ?? 'Revision reason not emitted.')}</small><details><summary>Technical details</summary><code>${esc(transition.snapshot_id)}</code></details></section>`;
  }
  if (transition.transition_kind === 'cancel_pending_intent') {
    return `<section class="cp-transition-outcome" role="status"><strong>Order cancelled</strong><p>${esc(transition.display_name ?? transition.order_intent_id ?? 'Order')}</p><small>${esc(transition.reason ?? 'Cancellation reason not emitted.')}</small><details><summary>Technical details</summary><code>${esc(transition.snapshot_id)}</code></details></section>`;
  }
  return '';
}

function pendingOrderActions(state) {
  const pending = state.pending_order_set;
  if (!pending) return '';
  const active = (pending.payload?.order_intents ?? []).filter((order) => order.inclusion_state === 'included' && order.pending_state !== 'cancelled');
  const orderPicker = `<label>Order<select data-care-plan-pending-order>${active.map((order) => `<option value="${esc(order.order_intent_id)}">${esc(order.display_name)}</option>`).join('')}</select></label>`;
  const actionBody = state.ui_pending_edit_mode
    ? `${orderPicker}<label>Revised timing<input data-care-plan-pending-timing value="Within 7 days"></label><div class="cp-pending-controls"><button type="button" class="secondary" data-care-plan-pending-cancel-edit>Cancel revision</button><button type="button" data-care-plan-pending-revise ${active.length ? '' : 'disabled'}>Apply revision</button></div>`
    : `${orderPicker}<div class="cp-pending-controls"><button type="button" class="secondary" data-care-plan-pending-begin-revise ${active.length ? '' : 'disabled'}>Revise selected order</button><button type="button" class="secondary" data-care-plan-pending-cancel ${active.length ? '' : 'disabled'}>Cancel selected order</button><button type="button" class="secondary" data-care-plan-pending-leave>Leave pending</button></div>`;
  return `<section class="cp-pending-actions" aria-label="Pending order set actions">
    ${pendingTransitionOutcome(state)}
    <div class="cp-section-head"><div><span>Post-lock workflow</span><h2>Pending order set</h2><p>Revision ${esc(pending.snapshot_revision)}</p><details><summary>Exact set hash</summary><code>${esc(pending.payload_hash)}</code></details></div><strong>${esc(displayState(pending.status))}</strong></div>
    ${actionBody}
  </section>`;
}

export function syntheticCarePlanView(state, context = {}) {
  const patientLabel = context.patientDisplayName ? ` · ${esc(context.patientDisplayName)}` : '';
  if (state.fixture_content_state === 'not_emitted') return `<div class="cp-workflow" data-care-plan-synthetic-v1><header class="screen-head"><div><h1>Care Plan${patientLabel}</h1><p>One problem-centered review workspace.</p></div></header>${context.changeReviewHtml ?? ''}<section class="cp-plan-editor"><h2>Care Plan not emitted</h2><p class="truth-empty">An explicitly adopted AI conclusion may create one compact problem, assessment, plan, and orders proposal.</p></section></div>`;
  const locked = state.note_lock_state.startsWith('locked');
  const conflict = state.persistence_state === 'conflict';
  const editingDisabled = locked || conflict;
  const includedProblems = state.entries.filter((entry) => entry.problem.entry_inclusion === 'included');
  const includedOrders = includedProblems.flatMap((entry) => entry.order_intents).filter((order) => order.inclusion_state === 'included');
  const readyOrders = includedOrders.filter((order) => order.validation_state === 'valid' && order.catalog_match_state === 'verified');
  const blockedOrders = includedOrders.filter((order) => !readyOrders.includes(order));
  const orderAuthorized = state.order_authorization_state === 'authorized_simulated';
  const pendingOrderCount = orderAuthorized ? 0 : includedOrders.filter((order) => !order.authorization_state).length;
  const activeListAdds = includedProblems.filter((entry) => entry.problem.problem_list_disposition === 'add_to_active_problem_list').length;
  const existingUpdates = includedProblems.filter((entry) => entry.problem.problem_list_disposition === 'update_existing_problem').length;
  const noteOnly = includedProblems.filter((entry) => entry.problem.problem_list_disposition === 'note_only').length;
  const incompleteProblems = includedProblems.filter((entry) => !String(entry.problem.proposed_label.value ?? '').trim() || !String(entry.assessment.value ?? '').trim() || !String(entry.plan.value ?? '').trim() || !entry.problem.problem_list_disposition);
  const blockers = [
    incompleteProblems.length ? `${incompleteProblems.length} problem${incompleteProblems.length === 1 ? '' : 's'} incomplete` : '',
    blockedOrders.length ? `${blockedOrders.length} order${blockedOrders.length === 1 ? '' : 's'} need review` : '',
    state.persistence_state !== 'saved' ? 'Current Care Plan changes are not saved' : '',
    state.narrative_state !== 'current' ? 'Preview note regeneration is pending' : '',
    conflict ? 'Draft conflict requires reload' : ''
  ].filter(Boolean);
  const planReady = blockers.length === 0;
  const previewProblems = includedProblems.map((entry) => `<article><h3>${esc(entry.problem.proposed_label.value)}</h3><h4>Assessment</h4><p>${esc(entry.assessment.value)}</p><h4>Plan</h4><p>${esc(entry.plan.value)}</p>${entry.order_intents.some((order) => order.inclusion_state === 'included') ? `<h4>Orders</h4><ul>${entry.order_intents.filter((order) => order.inclusion_state === 'included').map((order) => `<li>${esc(order.display_name)} · ${esc(order.timing)}</li>`).join('')}</ul>` : ''}</article>`).join('');
  const orderControls = orderAuthorized ? `<section class="cp-commit-complete"><strong>Order set authorized in simulation</strong><small>${includedOrders.length} orders · no native orders created</small></section>` : includedOrders.length ? `<details><summary>Exact order-set hash</summary><code>${esc(state.order_set_hash)}</code></details><label class="cp-attestation"><input type="checkbox" data-care-plan-order-attestation> I reviewed the exact enumerated simulation order set.</label><button type="button" data-care-plan-authorize-orders ${readyOrders.length !== includedOrders.length ? 'disabled' : ''}>Authorize exact order set in simulation</button>` : '<section class="cp-commit-complete"><strong>No included orders</strong><small>No order authorization act is required.</small></section>';
  const lockControls = locked ? `<section class="cp-commit-complete"><strong>Preview note locked in simulation</strong><small>${includedProblems.length} problems · problem-list decisions frozen</small><details><summary>Commitment boundary</summary><small>Order authorization remains a separate physician act.</small></details></section>` : !planReady ? `<section class="cp-readiness-blockers"><strong>Plan not ready to lock</strong><ul>${blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>` : state.ui_lock_confirmation_pending ? `<section class="cp-lock-confirmation"><strong>Lock this exact Preview note?</strong><small>${includedProblems.length} problems · ${activeListAdds} active-list add · ${existingUpdates} update · ${noteOnly} note only · orders remain separate</small><div><button type="button" class="secondary" data-care-plan-cancel-lock>Cancel</button><button type="button" data-care-plan-lock-note>Lock exact Preview note in simulation</button></div></section>` : `<label class="cp-attestation"><input type="checkbox" data-care-plan-lock-attestation> I reviewed the exact Preview note and problem-list mutation set.</label>${pendingOrderCount ? `<label class="cp-attestation"><input type="checkbox" data-care-plan-pending-ack> I understand pending orders remain unsent.</label>` : '<small class="cp-commit-status">Orders are authorized separately.</small>'}<button type="button" data-care-plan-begin-lock>Review and lock Preview note</button>`;
  const projectionCount = state.projections.notes_history.length + state.projections.lab_orders.length + state.projections.emr.length;
  const artifactSections = state.receipts.length || projectionCount ? `<section class="cp-receipts"><div class="cp-section-head"><div><h2>Workflow receipts</h2><p>Verified references for this synthetic workflow.</p></div></div>${receipts(state)}</section>${projections(state)}` : '';
  const releaseReady = locked && (orderAuthorized || includedOrders.length === 0);
  return `<div class="cp-workflow" data-care-plan-synthetic-v1>
    <header class="screen-head"><div><h1>Care Plan${patientLabel}</h1><p>One problem-centered workspace for review, editing, and physician-controlled commitment.</p></div><div class="cp-save-state"><strong>${esc(state.persistence_state === 'saved' ? 'Saved' : displayState(state.persistence_state))} · revision ${state.server_revision}</strong><small>${esc(displayState(state.note_lock_state))}</small></div></header>
    <div class="cp-simulation-banner"><span>Simulation: no order was transmitted, no patient release occurred, and no Canvas record was created.</span>${state.source === 'backend' ? '' : '<button type="button" class="secondary" data-care-plan-reset>Reset fixture</button>'}</div>
    ${state.ui_error ? `<div class="error-line" role="alert"><span>${esc(state.ui_error)}</span>${conflict ? '<button type="button" class="secondary" data-care-plan-reload-conflict>Reload current Care Plan</button>' : ''}</div>` : ''}
    ${context.changeReviewHtml ?? ''}
    <section class="cp-plan-editor" aria-label="Editable Care Plan"><div class="cp-note-meta"><div><span>Canonical problem-centered workspace</span><h2>${esc(state.encounter_label ?? 'Care Plan')}</h2><details class="cp-note-provenance"><summary>Care Plan provenance</summary><small>${esc(fieldOrigin(state.indication))} · ${esc(lineage(state.indication))}</small></details></div><strong>${locked ? 'Locked plan record' : conflict ? 'Conflict · reload required' : 'Editable Care Plan'}</strong></div><label class="cp-clinical-field"><h3>Visit context</h3><textarea data-care-plan-field="indication" ${editingDisabled ? 'disabled' : ''}>${esc(state.indication.value)}</textarea></label><div class="cp-entry-list">${state.entries.map((entry, index) => problemEntry(entry, index, editingDisabled, context.highlightedEntryId)).join('')}</div></section>
    <section class="cp-preview-note" aria-label="Derived Preview note"><div class="cp-note-meta"><div><span>Derived from the reviewed Care Plan</span><h2>Preview note</h2></div><strong>Read only</strong></div><p class="cp-preview-context">${esc(state.indication.value)}</p><div class="cp-preview-problems">${previewProblems || '<p class="truth-empty">No included problems.</p>'}</div><small>Editing happens in the Care Plan above. This preview updates from those problem, assessment, plan, and order fields.</small></section>
    <section class="cp-progressive-workflow" aria-label="Care Plan commitment workflow"><article class="cp-commit-card"><span>${planReady || locked ? 'Ready physician act' : 'Revealed when ready'}</span><h2>1. Note lock</h2><p>Locks the exact derived Preview note and problem-list decisions.</p>${lockControls}</article>${locked ? `<article class="cp-commit-card"><span>Separate physician act</span><h2>2. Order authorization</h2><p>${includedOrders.length} included · ${readyOrders.length} ready</p>${orderControls}</article>` : ''}${releaseReady ? `<article class="cp-release-stage"><span>Final physician-controlled stage</span><h2>3. Patient release</h2>${context.releaseHtml ?? '<p>Release workflow not emitted for this case.</p>'}</article>` : ''}</section>
    ${locked ? pendingOrderActions(state) : ''}${artifactSections}
  </div>`;
}
