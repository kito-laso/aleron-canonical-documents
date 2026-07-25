export const CODEX_PROVIDER_ENDPOINT = 'http://127.0.0.1:4317/v1/physician-ai/codex';
export const CODEX_PROVIDER_LABEL = 'GPT-5.6 Sol · Codex subscription · synthetic case';

const MODEL = 'gpt-5.6-sol';
const PROVIDER = 'codex_subscription';
const FIXTURE_ID = 'physician_synthetic_case';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const OPERATIONS = new Set(['message', 'consultation', 'draft']);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function claimForRequest(claim) {
  if (!claim || typeof claim !== 'object') return null;
  return {
    claim_id: claim.claim_id,
    thread_id: claim.thread_id,
    patient_id: claim.patient_id,
    statement: claim.statement,
    state: claim.state ?? claim.status,
    confidence: claim.confidence,
    patient_source_refs: array(claim.patient_source_refs),
    evidence_refs: array(claim.evidence_refs)
  };
}

export class CodexProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CodexProviderError';
    this.code = options.code ?? 'CODEX_PROVIDER_ERROR';
    this.status = options.status ?? null;
    this.fallbackGenerated = false;
  }
}

export function codexModeFromLocation(locationLike) {
  try {
    const url = new URL(locationLike?.href ?? String(locationLike ?? ''));
    return url.searchParams.get('ai_provider') === 'codex'
      && LOOPBACK_HOSTS.has(url.hostname)
      && url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildCodexProviderRequest({
  workspace,
  operation,
  question,
  consultationType,
  specialty,
  targetClaim,
  draftType,
  adoptedClaims,
  sessionId
}) {
  if (!workspace?.patientId || !workspace?.packetHash || !workspace?.activeThreadId) {
    throw new CodexProviderError('Codex requests require patient, packet, and active thread identity.', { code: 'INVALID_WORKSPACE' });
  }
  if (!OPERATIONS.has(operation)) {
    throw new CodexProviderError(`Unsupported Codex operation: ${operation}`, { code: 'INVALID_OPERATION' });
  }
  const request = {
    mode: PROVIDER,
    operation,
    fixture_id: workspace.fixtureId ?? FIXTURE_ID,
    patient_id: workspace.patientId,
    packet_hash: workspace.packetHash,
    thread_id: workspace.activeThreadId,
    session_id: sessionId
  };
  if (operation === 'message') {
    request.question = String(question ?? '').trim();
  }
  if (operation === 'consultation') {
    request.question = String(question ?? '').trim();
    request.consultation_type = consultationType;
    if (consultationType === 'specialist') request.specialty = specialty;
    if (consultationType !== 'blind_second_opinion') request.target_claim = claimForRequest(targetClaim);
  }
  if (operation === 'draft') {
    request.draft_type = draftType;
    request.adopted_claims = array(adoptedClaims).map(claimForRequest);
  }
  return request;
}

export function buildConsultationFollowUpQuestion(parentConsultation, question) {
  const followUp = String(question ?? '').trim();
  if (!parentConsultation?.consultation_id || !parentConsultation?.consultation_type || !followUp) {
    throw new CodexProviderError('Consultation follow-up requires its original context and a question.', { code: 'INVALID_CONSULTATION_FOLLOW_UP' });
  }
  const priorPosition = String(parentConsultation.position ?? '').trim();
  const attribution = parentConsultation.specialty
    ? `${parentConsultation.specialty} specialist AI lens`
    : parentConsultation.consultation_type.replaceAll('_', ' ');
  return `Follow-up within consultation ${parentConsultation.consultation_id}. Continue as the same ${attribution}. Your prior independent position was: ${priorPosition || 'Not emitted'}. Physician follow-up: ${followUp}`;
}

export function validateCodexProviderResponse(response, operation) {
  if (!response || typeof response !== 'object') throw new CodexProviderError('Codex provider returned an empty response.', { code: 'INVALID_RESPONSE' });
  if (response.operation !== operation) throw new CodexProviderError('Codex provider returned the wrong operation.', { code: 'INVALID_RESPONSE' });
  if (response.model !== MODEL || response.provider !== PROVIDER || response.synthetic_case !== true) {
    throw new CodexProviderError('Codex provider lineage validation failed.', { code: 'INVALID_RESPONSE' });
  }
  if (!Array.isArray(response.claims)) throw new CodexProviderError('Codex provider claims are invalid.', { code: 'INVALID_RESPONSE' });
  for (const claim of response.claims) {
    if (claim.model !== MODEL || claim.provider !== PROVIDER || claim.status !== 'working') {
      throw new CodexProviderError('Codex provider claim lineage validation failed.', { code: 'INVALID_RESPONSE' });
    }
  }
  if (operation === 'consultation' && !response.consultation) {
    throw new CodexProviderError('Codex provider consultation is missing.', { code: 'INVALID_RESPONSE' });
  }
  if (operation === 'draft' && !response.draft) {
    throw new CodexProviderError('Codex provider draft is missing.', { code: 'INVALID_RESPONSE' });
  }
  return response;
}

export function createCodexSubscriptionProvider({
  endpoint = CODEX_PROVIDER_ENDPOINT,
  fetchImpl = globalThis.fetch,
  sessionId,
  timeoutMs = 50000
} = {}) {
  if (typeof fetchImpl !== 'function') throw new CodexProviderError('Fetch is unavailable for the local Codex provider.');
  if (!sessionId) throw new CodexProviderError('A local Codex session ID is required.');
  return {
    async send(input) {
      const request = { ...input, session_id: input?.session_id ?? sessionId };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(request),
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new CodexProviderError(`Codex provider timed out after ${timeoutMs} ms. No fallback answer was generated.`, { code: 'TIMEOUT' });
        }
        throw new CodexProviderError(`Codex provider unavailable: ${error?.message ?? 'request failed'}. No fallback answer was generated.`, { code: 'UNAVAILABLE' });
      } finally {
        clearTimeout(timeout);
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new CodexProviderError('Codex provider returned invalid JSON. No fallback answer was generated.', {
          code: 'INVALID_JSON',
          status: response.status
        });
      }
      if (!response.ok) {
        throw new CodexProviderError(
          `${body?.error?.message ?? 'Codex provider request failed'} No fallback answer was generated.`,
          { code: body?.error?.code ?? 'PROVIDER_FAILURE', status: response.status }
        );
      }
      return validateCodexProviderResponse(body, request.operation);
    }
  };
}
