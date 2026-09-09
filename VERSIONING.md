# Versioning

Nine documents in this repository carry a version. Before this file, they
expressed it three different ways — an `## Version` heading, a lowercase `-v0.5`
filename suffix, an uppercase `_V1` one — and none of them said whether it was
still current. `product-design-system/DESIGN_SYSTEM.md` sat a full version behind
its own `manifest.json` for weeks without anything catching it.

This file is the index. **Check it before trusting a version number written
anywhere else.**

## The convention

**1. A versioned document carries a status line directly under its title.**

```markdown
# CKD Phenotype Risk Model

**Version** 4.0 · **Status** Current · **Updated** 2026-06-26 · **Supersedes** [v2.0](archive/risk-models/ckd-risk-model-v2.0.md)
```

`Status` is one of **Current**, **Draft**, **Provisional** or **Superseded**.
A superseded document says what replaced it:

```markdown
**Version** 2.0 · **Status** Superseded · **Updated** 2026-04 · **Superseded by** [v4.0](<relative path to the replacement>)
```

**2. Filenames are not renamed to add a version.** Where a version is already in
the filename it stays; where it isn't, it isn't added. Filenames are inbound
links from four repositories and a published Pages site, and a rename breaks
every one of them silently.

**3. Retired versions move to `archive/`, they are not deleted.** Code outlives
specs: the risk engines in `Aleron-Web` compute against the April 2026 specs, so
those specs are the only way to read that code as intended.

**4. Where a machine-readable version exists, it wins.** `manifest.json` is the
authority for the design system, not the prose in `DESIGN_SYSTEM.md`.

## Where the convention can and cannot be applied here

`deployment-metadata.json` lists the directories this repository preserves:
`apps`, `archive`, `data`, `design`, `docs`, `engine`, `platform`, `tooling`,
`workspaces`. **Everything else is generated output** — `system-design/`,
`product-design-system/`, `models/` — and a direct edit there is drift that the
next deploy overwrites.

So the status lines have to be added **upstream**, in the source workspace
recorded as `source_repository` in `canonical-manifest.json`. Until that happens,
the table below carries the same information without touching generated files.
That is the whole reason this is an index rather than nine edits.

## Version index

Current as of 2026-09-09.

### Risk models

| Document | Version | Status | Updated |
|---|---|---|---|
| [`system-design/ckd-phenotype-risk-model-condensed.md`](system-design/ckd-phenotype-risk-model-condensed.md) | 4.0 | **Current** | 2026-06-26 |
| [`system-design/cvd-phenotype-risk-model-condensed.md`](system-design/cvd-phenotype-risk-model-condensed.md) | 3.0 | **Current** | 2026-06-26 |
| [`system-design/metabolic-phenotype-risk-model-condensed.md`](system-design/metabolic-phenotype-risk-model-condensed.md) | 3.0 | **Current** | 2026-06-26 |
| [`system-design/neuro-phenotype-risk-model-condensed.md`](system-design/neuro-phenotype-risk-model-condensed.md) | 3.1 | **Current** | 2026-06-27 |
| [`models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md`](models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md) | 0 | Draft — coefficients need clinical review and cohort calibration | — |
| [`archive/risk-models/ckd-risk-model-v2.0.md`](archive/risk-models/ckd-risk-model-v2.0.md) | 2.0 | Superseded by v4.0 | 2026-04 |
| [`archive/risk-models/metabolic-risk-model-v2.1.md`](archive/risk-models/metabolic-risk-model-v2.1.md) | 2.1 | Superseded by v3.0 | 2026-04 |
| [`archive/risk-models/neuro-risk-model-v2.1.md`](archive/risk-models/neuro-risk-model-v2.1.md) | 2.1 | Superseded by v3.1 | 2026-04 |
| [`archive/risk-models/cancer-risk-model-v1.0.md`](archive/risk-models/cancer-risk-model-v1.0.md) | 1.0 | Superseded, scope changed — see its header | 2026-04 |

**The CVD v2.1 specification is missing.** `Aleron-Web/docs/cvd/*` cites
"Meridian CVD Domain Risk Model — Specification v2.1" throughout, and that file
is not in any repository. The four other April specs were recoverable and are
archived above; this one was not, so it is recorded as missing rather than
reconstructed.

### Vitality models

| Document | Version | Status |
|---|---|---|
| [`docs/vitality-models/male-vitality-state-model-v0.5.md`](docs/vitality-models/male-vitality-state-model-v0.5.md) | 0.5 | **Current** |
| [`docs/vitality-models/female-vitality-state-model-v0.2.md`](docs/vitality-models/female-vitality-state-model-v0.2.md) | 0.2 | **Current** |

### Design system

| Artifact | Version | Status |
|---|---|---|
| [`product-design-system/manifest.json`](product-design-system/manifest.json) | 0.5.0 | **Current, and authoritative for the design system** |
| [`product-design-system/DESIGN_SYSTEM.md`](product-design-system/DESIGN_SYSTEM.md) | tracks the manifest | Prose. Has lagged the manifest before |

The member Cabin register is **ratified**; the physician flight-deck register is
**provisional**.

**The two consumers are pinned a version apart** and this is deliberate, not
drift:

| Consumer | Pinned at | Where |
|---|---|---|
| `Aleron-Web` | **0.4.0** | vendored snapshot, `resources/design-system/aleron/` |
| `aleron` (Flutter) | **0.5.0** | vendored `scripts/tokens.json`, generated into Dart |

Check which one you are working against before porting a token between them.

### Product and engineering contracts

| Document | Version | Status |
|---|---|---|
| [`docs/product/STATE_MACHINE_V1.md`](docs/product/STATE_MACHINE_V1.md) | 1 | Wave 1 product contract |
| [`docs/product/ROLE_AND_RELEASE_MATRIX_V1.md`](docs/product/ROLE_AND_RELEASE_MATRIX_V1.md) | 1 | Wave 1 product contract |
| [`docs/engineering/API_CONTRACT_V1.md`](docs/engineering/API_CONTRACT_V1.md) | 1 | Wave 2 schema and API foundation. **Its `schemas/` registry — 12 files — is not checked in**, so the shared contract it declares cannot be read here |

## Adding or superseding a document

1. Add the status line from the convention above.
2. Move the version it replaces into `archive/`, keeping its directory shape, and
   give it a `Superseded by` line pointing forward.
3. Add both rows to the index above.
4. If the document lives in generated output, make the change upstream — a commit
   here is drift. The exception the README already carves out is a design-system
   proposal on an `al-*` branch.
