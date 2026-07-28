import {
  artifactBindsCurrentLineage,
  canonicalReleasePreviewHash,
  currentArtifactLineage,
  derivedReleaseIdentity,
  releasePreviewAliasesAreConsistent
} from './dashboardAdapter.js?v=physician-ai-care-plan-v9';

const SCHEMA_VERSION = 'physician_review_release_session.v1';
const STORAGE_PREFIX = 'aleron-review-release-session:';
const EMPTY_SESSION = Object.freeze({ reviewStarted: false, releasePackage: null });

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function patientId(caseBundle) {
  return caseBundle?.patient_packet?.patient_id ?? caseBundle?.patient_id ?? null;
}

function completeIdentity(caseBundle) {
  const id = patientId(caseBundle);
  const lineage = currentArtifactLineage(caseBundle);
  if (!id || Object.values(lineage).some((value) => typeof value !== 'string' || !value)) return null;
  return { patient_id: id, ...lineage };
}

function sessionKey(identity) {
  return `${STORAGE_PREFIX}${encodeURIComponent(identity.patient_id)}:${encodeURIComponent(identity.packet_id)}:${encodeURIComponent(identity.packet_hash)}`;
}

function sameIdentity(record, identity) {
  return record?.patient_id === identity.patient_id
    && ['packet_id', 'packet_hash', 'source_engine_run_id', 'source_action_map_state_id', 'source_plan_id']
      .every((field) => record?.[field] === identity[field]);
}

function trustedReleasePackage(caseBundle, releasePackage) {
  if (!releasePackage || typeof releasePackage !== 'object' || Array.isArray(releasePackage)) return false;
  if (releasePackage.schema_version !== 'release_package.v1' || typeof releasePackage.release_id !== 'string' || !releasePackage.release_id) return false;
  if (releasePackage.patient_id !== patientId(caseBundle)
    || !artifactBindsCurrentLineage(caseBundle, releasePackage)
    || !releasePreviewAliasesAreConsistent(caseBundle, releasePackage)) return false;
  if (!['release_package_draft', 'authorized_not_released', 'released_to_patient'].includes(releasePackage.release_state)) return false;
  if (!Array.isArray(releasePackage.required_item_dispositions)
    || releasePackage.required_item_dispositions_complete !== true
    || releasePackage.required_item_dispositions.some((item) => !item?.id || !item?.disposition)) return false;
  const lineage = currentArtifactLineage(caseBundle);
  if (!releasePackage.provenance || typeof releasePackage.provenance !== 'object' || Array.isArray(releasePackage.provenance)
    || !releasePackage.provenance.source
    || releasePackage.provenance.packet_id !== lineage.packet_id
    || releasePackage.provenance.packet_hash !== lineage.packet_hash) return false;
  const recomputedPreviewHash = canonicalReleasePreviewHash(releasePackage);
  if (!/^sha256:[a-f0-9]{64}$/.test(releasePackage.preview_hash ?? '')
    || releasePackage.preview_hash !== recomputedPreviewHash
    || releasePackage.release_id !== derivedReleaseIdentity(releasePackage)) return false;
  if (['authorized_not_released', 'released_to_patient'].includes(releasePackage.release_state)) {
    const authorizationId = releasePackage.signature_or_authorization_id;
    const evidence = releasePackage.authorization_evidence;
    if (typeof authorizationId !== 'string' || !authorizationId
      || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)
      || evidence.authorization_id !== authorizationId
      || evidence.release_id !== releasePackage.release_id
      || evidence.preview_hash !== recomputedPreviewHash) return false;
  }
  if (releasePackage.release_state === 'released_to_patient' && releasePackage.patient_visible !== true) return false;
  return true;
}

function emptySession() {
  return { ...EMPTY_SESSION };
}

export function createReviewReleaseSessionRepository(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('Review/release session persistence requires a storage adapter.');
  }

  return {
    load(caseBundle) {
      const identity = completeIdentity(caseBundle);
      if (!identity) return emptySession();
      const key = sessionKey(identity);
      const raw = storage.getItem(key);
      if (!raw) return emptySession();
      try {
        const record = JSON.parse(raw);
        const valid = record?.schema_version === SCHEMA_VERSION
          && sameIdentity(record, identity)
          && record.review_started === true
          && (record.release_package == null || trustedReleasePackage(caseBundle, record.release_package));
        if (!valid) throw new Error('Stored review/release session is not current and trusted.');
        return { reviewStarted: true, releasePackage: clone(record.release_package) };
      } catch {
        storage.removeItem(key);
        return emptySession();
      }
    },

    save(caseBundle, session) {
      const identity = completeIdentity(caseBundle);
      if (!identity) throw new Error('Cannot persist review/release state without complete current artifact lineage.');
      const key = sessionKey(identity);
      if (session?.reviewStarted !== true) {
        storage.removeItem(key);
        return emptySession();
      }
      if (session.releasePackage != null && !trustedReleasePackage(caseBundle, session.releasePackage)) {
        storage.removeItem(key);
        throw new Error('Cannot persist a release package without exact current lineage and trust evidence.');
      }
      const record = {
        schema_version: SCHEMA_VERSION,
        ...identity,
        review_started: true,
        release_package: clone(session.releasePackage ?? null)
      };
      storage.setItem(key, JSON.stringify(record));
      return { reviewStarted: true, releasePackage: clone(record.release_package) };
    },

    clear(caseBundle) {
      const identity = completeIdentity(caseBundle);
      if (!identity) return false;
      storage.removeItem(sessionKey(identity));
      return true;
    }
  };
}
