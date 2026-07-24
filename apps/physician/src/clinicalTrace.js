import { displayValue } from './dashboardAdapter.js?v=physician-design-basics-v2';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[c]);
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? 'unknown').replaceAll('_', ' ');
const disposition = (candidate) => text(candidate.disposition ?? candidate.selection_state ?? candidate.status ?? (candidate.selected ? 'selected' : 'eligible'));

function signals(candidate) {
  const rows = array(candidate.patient_signals_used ?? candidate.patient_signals ?? candidate.signals ?? candidate.patient_signal_references ?? candidate.evidence?.patient_signals);
  if (!rows.length) return '<div class="truth-empty">No patient-signal references emitted.</div>';
  return `<div class="trace-table" role="table" aria-label="Exact patient signals">${rows.map((signal) => {
    const assumption = signal.assumption_state ?? signal.data_state ?? (signal.synthetic ? 'synthetic' : signal.assumed ? 'assumed' : signal.derived ? 'derived' : 'measured');
    return `<div class="trace-row" role="row"><strong>${esc(signal.label ?? signal.field_ref ?? signal.key ?? signal.id)}</strong><span>${esc(displayValue(signal.value, signal.unit ?? signal.units, signal.state))}</span><span>${esc(signal.observed_at ?? signal.measured_at ?? signal.date ?? signal.effective_at ?? 'Date not emitted')}</span><span>${esc(signal.source ?? signal.provenance?.source ?? 'Source not emitted')}</span><span>${esc(signal.status ?? signal.interpretation ?? 'Status not emitted')}</span><span>${esc(signal.reference_range ?? signal.reference ?? 'Reference not emitted')}</span><span>${esc(text(assumption))}</span></div>`;
  }).join('')}</div>`;
}

function models(candidate) {
  const rows = array(candidate.model_output_refs ?? candidate.model_findings ?? candidate.model_outputs ?? candidate.model_output_references ?? candidate.evidence?.model_findings);
  if (!rows.length) return '<div class="truth-empty">No model-finding references emitted.</div>';
  return rows.map((finding) => `<div class="model-trace-card" data-model-state="${esc(finding.state ?? finding.calculation_state ?? 'unknown')}"><div><strong>${esc(finding.label ?? finding.id ?? 'Model finding')}</strong><b>${esc(text(finding.state ?? finding.calculation_state ?? 'unknown'))}</b></div><p>${esc(displayValue(finding.value, finding.unit ?? finding.units, finding.state))}</p><small>${esc(finding.model_version ?? finding.version ?? 'Version not emitted')} · ${esc(finding.applicability ?? finding.applicability_boundary ?? 'Applicability not emitted')}</small>${array(finding.assumptions).length ? `<small>Assumptions: ${esc(array(finding.assumptions).join(' · '))}</small>` : ''}</div>`).join('');
}

export function recommendationTraceHTML(model, selected) {
  const candidates = array(model.actionMap?.candidates);
  if (!candidates.length) return '';
  const selectedKeys = [selected?.candidate_id, selected?.library_item_id, selected?.id].filter(Boolean);
  const candidate = candidates.find((row) => [row.candidate_id,row.id,row.action_library_item_id,row.library_item_id].filter(Boolean).some((key) => selectedKeys.includes(key)))
    ?? candidates.find((row) => (row.title ?? row.label) === (selected?.title ?? selected?.label))
    ?? candidates.find((row) => /selected/i.test(disposition(row))) ?? candidates[0];
  const ranking = candidate.ranking ?? candidate.ranking_dimensions ?? candidate.scores ?? {};
  const library = model.actionMap.library ?? {};
  return `<section class="rail-card clinical-trace" aria-label="Recommendation clinical trace"><span class="section-label">Reasoning traceback</span><h2>${esc(candidate.title ?? candidate.label ?? candidate.candidate_id ?? 'Candidate')}</h2><section><h3>Why selected</h3><p>${esc(candidate.selection_reason ?? candidate.why_selected ?? candidate.rationale ?? 'Selection reason not emitted.')}</p></section><section><h3>Exact patient signals</h3>${signals(candidate)}</section><section><h3>Model findings</h3>${models(candidate)}</section><section><h3>Candidate ranking</h3><p>Rank ${esc(candidate.ordered_rank ?? candidate.rank ?? candidate.ranking_position ?? 'not emitted')} · ${esc(Object.entries(ranking).map(([key,value]) => `${text(key)} ${value}`).join(' · '))}</p><ol class="candidate-ranking">${candidates.map((row) => `<li><strong>${esc(row.title ?? row.label ?? row.candidate_id ?? row.id)}</strong><span>${esc(disposition(row))}</span><small>${esc(row.selection_reason ?? row.why_selected ?? row.why_not_selected ?? row.disposition_reason ?? row.exclusion_reason ?? row.reason ?? 'Reason not emitted')}</small></li>`).join('')}</ol></section><p class="library-identity"><strong>Action library</strong> ${esc(library.library_id ?? library.id ?? 'ID not emitted')} · ${esc(library.version ?? 'Version not emitted')} · ${esc(library.sha256 ?? library.hash ?? 'Hash not emitted')} · item ${esc(candidate.action_library_item_id ?? candidate.library_item_id ?? 'not emitted')}</p></section>`;
}

export function releasePreviewHTML(preview) {
  if (!preview) return '';
  const list = (items, emptyText) => array(items).length ? array(items).map((item) => `<li><strong>${esc(item.title ?? item.label ?? item.id)}</strong><small>${esc(item.disposition ?? item.reason ?? item.provenance ?? '')}</small></li>`).join('') : `<li>${esc(emptyText)}</li>`;
  const hidden = [...array(preview.hidden_items ?? preview.hidden_actions), ...array(preview.excluded_items)];
  const provenance = preview.provenance ?? {};
  return `<section class="preview-document complete-preview" aria-label="Complete release preview"><span class="section-label">Complete release preview</span><h2>${esc(preview.doctor_message ?? 'Patient release package')}</h2><section><h3>Exact patient-visible actions</h3><ul>${list(preview.visible_actions ?? preview.patient_visible_actions ?? preview.actions, 'No visible actions')}</ul></section><section><h3>Hidden / excluded items</h3><ul>${list(hidden, 'No hidden or excluded items')}</ul></section><section><h3>Required-item disposition</h3><ul>${list(preview.required_item_dispositions ?? preview.required_dispositions, 'No required-item dispositions emitted')}</ul></section><p><strong>Provenance</strong> ${esc(provenance.source ?? provenance.action_library_version ?? preview.provenance_summary ?? 'Not emitted')} · ${esc(provenance.action_library_hash ?? '')}</p><p class="boundary-banner signal-hazard">${esc(preview.nonclinical_boundary ?? preview.boundary ?? 'Clinical release boundary not emitted')}</p><p><strong>Preview hash</strong> ${esc(preview.preview_hash ?? preview.package_hash ?? 'Not emitted')}</p><dl class="lineage-labels" aria-label="Release preview lineage"><dt>Packet</dt><dd>${esc(preview.packet_id ?? preview.source_packet_id)}</dd><dt>Run</dt><dd>${esc(preview.source_engine_run_id)}</dd><dt>Action map</dt><dd>${esc(preview.source_action_map_state_id ?? preview.source_action_map_id)}</dd><dt>Plan</dt><dd>${esc(preview.source_plan_id)}</dd></dl></section>`;
}
