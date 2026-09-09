> # ⚠ SUPERSEDED — historical record, do not build on this
>
> **Version** 2.1 · **Status** Superseded · **Updated** April 2026 · **Superseded by** [`system-design/neuro-phenotype-risk-model-condensed.md`](../../system-design/neuro-phenotype-risk-model-condensed.md)
>
> This is the neurodegenerative specification as it stood in April 2026, moved here from
> `Aleron-Web/docs/risk-engines/`. The current specification is
> **neurodegenerative phenotype risk model v3.1 (27 June 2026)**.
>
> It is kept because **the engines in `Aleron-Web` were built and documented against
> this version**, so it is the only way to read that code as intended. It is not the
> clinical authority. Reconciling the two is [AL-106](https://lasohealth.atlassian.net/browse/AL-106)'s
> explicit non-goal and needs a clinician.

Meridian Neurodegenerative Risk Model

Version 2.1 | April 2026

Executive Summary

This model estimates 20-year all-cause dementia risk for adults aged 40–64, then adjusts that estimate using biomarker, vascular/metabolic, lifestyle, genetic, and fitness data.

The model has four components:

1. A monogenic triage gate (Gate 1\) that routes deterministic neurodegenerative variants to protocol-driven management  
2. A validated base model (CogDrisk-ML) that estimates baseline dementia risk for patients who do not trigger Gate 1  
3. Four modifier domains (biomarkers, vascular/metabolic, lifestyle/exposure, genetic/familial) plus a cross-cutting cardiorespiratory fitness modifier that adjust risk using patient-specific data  
4. All calculations are deterministic. APOE and other high-salience genetic findings require separate clinical communication and counseling protocols outside the score itself.

## ---

1\. Architectural Decision: Hybrid (Base Score \+ Triage Gate)

---

Recommendation: Hybrid architecture — a probabilistic base risk score for all-cause dementia (the dominant mortality and disability pathway) combined with a triage gate for monogenic neurodegenerative conditions, analogous to the Cancer model's Gate 1\.  
Rationale:  
Unlike cancer (dozens of independent diseases, no unified equation), dementia *does* have validated population-level prediction models. Alzheimer's disease accounts for 60–70% of all dementia, and the shared risk factor profile (vascular, metabolic, lifestyle) across AD, vascular dementia, and mixed dementia means a single probabilistic score captures the majority of preventable burden. This is more like CKD/CVD than Cancer.  
However, monogenic causes (PSEN1, PSEN2, APP for early-onset AD; LRRK2, GBA1, SNCA for PD) require deterministic protocol routing, not probabilistic modification. A patient with a pathogenic PSEN1 variant has \~100% penetrance for early-onset AD — a risk score is meaningless; they need a clinical protocol.  
Architecture:

* Gate 1 (Monogenic): Invitae P/LP in PSEN1/PSEN2/APP/LRRK2/GBA1/SNCA → deterministic protocol (override, not modifier)  
* Gate 2 (Probabilistic): All other patients → base risk model \+ modifier domains A/B/C/D  
* Output: NeuroDomainResult — either a protocol assignment (Gate 1\) or a DomainRiskResult with base\_risk, modified\_risk, sensitivity\_map, citations (Gate 2\)

## ---

2\. Recommended Base Model: CogDrisk-ML (Huque & Anstey, 2025\)

---

Citation: Huque MH, Anstey KJ et al. "Development of a midlife-specific CogDrisk algorithm (CogDrisk-ML) to enable validated implementation of dementia risk assessment from midlife to late life." *Age Ageing* 2025;54(7). (PMID: 40685637\)

### Why CogDrisk-ML is the Pareto-optimal choice

| Criterion | CogDrisk-ML | CAIDE | ANU-ADRI | LIBRA   |
| :---- | :---- | :---- | :---- | :---- |
| Age range | 40–64 (purpose-built for midlife) | 39–64 | ≥60 | ≥65 |
| Method | Cox PH, sex-specific, random-effects meta-analysis of cohort coefficients | Logistic regression | Weighted sum | Weighted sum |
| Derivation cohorts | UK Biobank \+ ARIC (N\>500K combined) | CAIDE (N=1,449) | Retrospective factor synthesis | Expert panel |
| External validation | Whitehall II (C-stat reported) | Moderate (C-stat \~0.70–0.78 across external validations, PMID: 41629914\) | Limited external validation for midlife | Limited midlife data |
| Midlife-specific risk factors | Yes — includes recent Lancet 2024 commission risk factors | No — developed 2006, limited factor set | Partially | Partially |
| Outcome | Incident all-cause dementia | 20-year dementia | Dementia/MCI | Dementia |
| Transparency | Published regression coefficients per sex | Published | Weighted factors | Weighted factors |
| Guideline alignment | Builds on Lancet 2024 commission 14 modifiable risk factors (PMID: 39096926\) | Historic benchmark | Research tool | Research tool |

Key advantages for Meridian:

1. Purpose-built for our cohort. CogDrisk-ML is the only validated Cox PH dementia prediction model specifically developed and validated for adults 40–64. Every other model (CAIDE, ANU-ADRI, LIBRA) was either developed on older populations and retroactively applied to midlife, or uses simpler scoring methods without proper survival modeling.  
2. Large derivation sample. UK Biobank \+ ARIC gives N in the hundreds of thousands — orders of magnitude larger than CAIDE's 1,449.  
3. Sex-specific coefficients. Random-effects meta-analysis across cohorts per sex handles the well-documented sex differences in dementia risk trajectory.  
4. Cox PH model. Proper time-to-event survival model, compatible with our modifier architecture (log-additive HRs with sigmoid bounding).  
5. Incorporates 2024 Lancet commission factors. The 2024 Lancet commission identified 14 modifiable risk factors accounting for \~45% of dementia cases worldwide (PMID: 39096926, 1,778 citations). CogDrisk-ML was designed to include these.

Fallback note: If CogDrisk-ML regression coefficients prove insufficiently granular for our needs (paper is 2025, full coefficient tables may require supplementary data access), CAIDE remains the fallback — it's the most externally validated midlife dementia score in the literature, with a pooled AUC of \~0.71 across 36 external validation studies (PMID: 41629914). Less accurate, but battle-tested.

## ---

3\. Boundary Definition: What Does Neuro Own?

### ---

Neuro domain OWNS:

* All-cause dementia risk (Alzheimer's, vascular, mixed, Lewy body, FTD)  
* Parkinson's disease risk (via modifier \+ monogenic gate)  
* Neurodegenerative biomarker trajectories (NfL, p-tau217)  
* Cognitive decline trajectory  
* Sleep architecture as neurodegeneration risk factor

### CVD domain OWNS (no overlap):

* Stroke (ischemic and hemorrhagic) — already captured in PREVENT's ASCVD outcome  
* Cerebrovascular disease as CVD endpoint  
* Atrial fibrillation as stroke risk factor

### Shared inputs, separate ownership:

| Input | CVD ownership | Neuro ownership   |
| :---- | :---- | :---- |
| Hypertension | CVD risk modifier (Domain B) | Dementia risk modifier (Domain B) — different HR, same data source |
| T2D / insulin resistance | CVD Domain C: HOMA-IR 1.15×, prediabetic HbA1c 1.10× (Shared Metabolic Input Policy v3.4) | Dementia risk modifier (Domain B) — HR 1.6× for T2D, 1.25× for HOMA-IR \>3.0 |
| Atrial fibrillation | Stroke risk in PREVENT | NOT used as Neuro modifier (stroke-mediated dementia is CVD's problem) |
| Physical activity | Not in CVD base model | Neuro modifier (Domain C) |
| Sleep | Not in CVD model | Neuro modifier (Domain C) — primary home |

Key boundary rule: Vascular dementia *risk* is captured in the Neuro base model (CogDrisk-ML predicts all-cause dementia including vascular). But the *acute cerebrovascular event* (stroke) is CVD's domain. This prevents double-counting — Neuro captures the chronic neurodegeneration pathway, CVD captures the acute vascular event.  
Metabolic overlap (Shared Metabolic Input Policy v3.4): T2D increases all-cause dementia risk HR \~1.5–2.0× (multiple meta-analyses; recent: PMID: 41852471). All domain models consume metabolic inputs independently with outcome-specific HRs. The mechanism in Neuro is distinct — insulin resistance drives tau hyperphosphorylation via GSK-3β, amyloid clearance failure, and neuroinflammation through pathways independent of the vascular damage that CVD models. The Metabolic domain owns T2D *risk prediction* (QDiabetes); Neuro uses T2D *status* as a modifier input. No double-counting — different outcomes from the same biology.

## ---

4\. Gate 1: Monogenic Neurodegenerative Conditions

### ---

Covered genes (must verify against Invitae 163-gene panel):

| Gene | Condition | Penetrance | Action   |
| :---- | :---- | :---- | :---- |
| PSEN1 | Early-onset AD | \~100% by age 65 | Deterministic: genetic counseling, presymptomatic monitoring protocol, clinical trial enrollment (DIAN-TU), biomarker surveillance (p-tau217, NfL annually) |
| PSEN2 | Early-onset AD | \~95% (variable age of onset) | Same as PSEN1 but wider onset window |
| APP | Early-onset AD (duplications, specific missense) | \~100% for duplications | Same as PSEN1 |
| LRRK2 | Parkinson's disease | \~25–42.5% by age 80 (G2019S) (PMID: 39962078\) | Risk-stratified monitoring: DAT-SCAN if prodromal symptoms, annual neurological assessment from age 50, α-synuclein seed amplification if available |
| GBA1 | PD / Lewy body dementia | Variable (5–30% depending on variant severity) | Risk-stratified: severe variants (L444P, 84GG) → monitoring from age 45; mild variants (N370S) → monitoring from age 55 |
| SNCA | PD (duplications/triplications) | High (dose-dependent) | Deterministic monitoring protocol |

Gate 1 logic: If Invitae reports P/LP variant in any of the above → bypass probabilistic model, output protocol assignment with gene-specific surveillance schedule. No risk percentage — it's clinically meaningless for PSEN1.  
Invitae panel gap: Must verify which of these 6 genes are on the 163-gene panel. PSEN1, PSEN2, APP are likely included. LRRK2, GBA1, SNCA may not be — these are movement disorder genes that aren't always on multi-cancer/cardio panels. If missing, this is a data gap to flag.

## ---

5\. Gate 2: Modifier Domains (A/B/C/D Pattern)

### ---

Combination logic

Same as CKD v2: log-additive across domains, sigmoid bounding per domain and globally.  
modified\_risk \= sigmoid(base\_logit \+ Σ(domain\_log\_HR))

Global cap: 3.0× base risk (given that absolute dementia risk in 35-60 is low, we need the cap to prevent implausible values)

### ---

Domain A: Neurodegenerative Biomarkers

Rationale: This is Meridian's unique edge. Blood-based neurodegenerative biomarkers (NfL, p-tau217) are the most powerful reclassifiers available for preclinical disease, and we already collect them.

| ID | Modifier | Threshold | HR | Evidence Grade | Data Input   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| A1 | p-tau217 elevated | \>2× age-adjusted ULN (assay-specific; C2N PrecivityAD2 or Lumipulse cutoffs) | 2.0× | Strong — AUC 0.89–0.98 for distinguishing AD from non-AD across 3 cohorts (Palmqvist et al., JAMA 2020, PMID: 32722745, 1,099 citations). Predicts amyloid/tau PET positivity in preclinical stage. | Blood lab: p-tau217 |
| A2 | p-tau217 borderline | 1.5–2× age-adjusted ULN | 1.4× | Moderate — gray zone; sensitivity high but specificity lower in this range | Blood lab: p-tau217 |
| A3 | p-tau217 normal | \<1.5× age-adjusted ULN | 1.0× (no modification) | Strong (negative predictive value \>95% for amyloid negativity) | Blood lab: p-tau217 |
| A4 | NfL elevated (age-adjusted) | \>90th percentile for age (using log-linear age adjustment model, \~2.3% increase per year; Harp et al., PMID: 35229997\) | 1.5× | Strong — NfL is a non-specific marker of neuronal injury; elevated in AD, FTD, PD, ALS, MS. Predictive of cognitive decline and brain atrophy in preclinical populations. | Blood lab: NfL |
| A5 | NfL markedly elevated | \>97.5th percentile for age | 2.0× | Strong — at this level, active neurodegeneration highly likely regardless of etiology | Blood lab: NfL |
| A6 | NfL trajectory rising | \>30% increase over 12 months (age-adjusted) | 1.8× | Moderate — trajectory data adds beyond single measurement; less validation data for serial monitoring in asymptomatic populations | Blood lab: NfL (serial) |
| A7 | Both p-tau217 \+ NfL elevated | A1 \+ (A4 or A5) | See combination rule | — | Blood labs: both |

Intra-domain rule:

* p-tau217: pick ONE of A1/A2/A3  
* NfL: pick ONE of A4/A5, then apply A6 if trajectory data available (multiplicative with NfL level modifier)  
* Cross-biomarker combination: If both p-tau217 elevated (A1) AND NfL elevated (A4/A5): multiply p-tau HR × NfL HR × 0.7 (attenuation factor — partial correlation expected since both reflect AD-related neurodegeneration). Example: A1 (2.0) × A4 (1.5) × 0.7 \= 2.1×

Domain A cap: 3.0×  
Critical implementation notes:

* p-tau217 assay standardization is evolving. Cutpoints MUST be assay-specific (Lumipulse, C2N PrecivityAD, Fujirebio, Roche Elecsys). Do not use absolute pg/mL across assays.  
* NfL age-adjustment is mandatory. Raw NfL increases \~2.3%/year in healthy adults. A 55-year-old at 20 pg/mL is very different from a 35-year-old at 20 pg/mL.  
* These biomarkers detect *ongoing pathology*, not future risk. An elevated p-tau217 in a 45-year-old means amyloid/tau pathology is already present — this is early detection, not prediction. The HR applies to progression to clinical dementia.

### ---

Domain B: Vascular & Metabolic Risk Factors for Neurodegeneration

Rationale: The 2024 Lancet commission (PMID: 39096926\) established that \~45% of dementia cases are attributable to 14 modifiable risk factors, most of which are vascular/metabolic. These operate through cerebrovascular damage, blood-brain barrier disruption, and neuroinflammation — mechanisms distinct from the acute stroke pathway owned by CVD.

| ID | Modifier | Threshold | HR | Evidence Grade | Data Input   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| B1 | Hypertension (midlife, untreated) | SBP ≥140 at age 40–65 | 1.6× | Strong — Lancet 2024 commission; midlife hypertension PAF for dementia \~2% (PMID: 39096926). SPRINT-MIND showed intensive BP control reduced MCI risk (HR 0.81, PMID: 30688979). | Wearable: BP trends; Labs: clinic BP |
| B2 | Hypertension (treated, controlled) | On antihypertensives, SBP \<130 | 1.1× | Strong — residual risk from prior exposure \+ medication class effects | History: medication list; Wearable: BP |
| B3 | T2D present | Diagnosed T2D or HbA1c ≥6.5% | 1.6× | Strong — meta-analyses consistently show HR 1.5–2.0 for all-cause dementia (PMID: 41852471). Insulin resistance drives tau phosphorylation via GSK-3β and impairs amyloid clearance. | Labs: HbA1c, FPG; History: T2D diagnosis |
| B4 | Insulin resistance (pre-diabetic) | HOMA-IR \>3.0 without T2D diagnosis | 1.25× | Moderate — HOMA-IR independently predicts cognitive decline in non-diabetic adults; weaker evidence for dementia endpoint specifically | Labs: fasting insulin \+ glucose |
| B5 | Obesity (midlife) | BMI ≥30 at age 35–65 | 1.3× | Strong — Lancet 2024 commission; midlife obesity PAF \~1% for dementia. Mechanism: adipokine-mediated neuroinflammation, insulin resistance. | History: BMI |
| B6 | High LDL cholesterol (midlife) | LDL-C ≥160 mg/dL untreated | 1.25× | Moderate — Lancet 2024 added high LDL cholesterol as new risk factor. Evidence less robust than hypertension/T2D but consistent signal from large cohort studies. | Labs: lipid panel |

Intra-domain rule:

* BP: pick ONE of B1/B2  
* Metabolic: pick ONE of B3/B4 (mutually exclusive — diabetic vs. pre-diabetic)  
* B5 and B6 are independent  
* Combine: BP × max(B3 or B4, B5) × B6. Cap at 2.5× for domain.

Domain B cap: 2.5×  
T2D overlap note: The Metabolic domain model owns T2D *risk prediction* (QDiabetes) and T2D *severity assessment* (MetabolicSeverityVector). The Neuro domain uses T2D *status* (binary: present/absent) and insulin resistance markers as modifiers. No double-counting — Metabolic predicts whether you'll develop T2D; Neuro quantifies the dementia risk increment if you already have it or are insulin resistant.

### ---

Domain C: Lifestyle & Exposure

Rationale: Modifiable lifestyle factors collectively account for the largest fraction of preventable dementia. These are the primary intervention targets for the Action Layer.

| ID | Modifier | Threshold | HR | Evidence Grade | Data Input   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| C1 | Physical inactivity | \<150 min/week moderate activity (WHO threshold) | 1.4× | Strong — Lancet 2024 commission; PAF \~2%. Meta-analyses show consistent HR 1.3–1.5 for physical inactivity and dementia. Mechanism: reduced BDNF, impaired cerebral perfusion, loss of neuroplasticity. | Wearable: activity minutes, step count, VO2max estimate |
| C2 | High physical activity (protective) | ≥300 min/week moderate OR ≥150 vigorous | 0.75× | Strong — consistent dose-response in meta-analyses | Wearable: activity data |
| C3 | Sleep duration abnormal | \<6h or \>9h average (wearable-measured) | 1.3× | Strong — U-shaped relationship well-established. Short sleep associated with amyloid accumulation (glymphatic clearance theory). Long sleep may reflect prodromal neurodegeneration. Sabia et al., *Nature Communications* 2021 (PMID: 33879422 — verify): Whitehall II, N=7,959, 25-year follow-up, HR 1.30 for persistent short sleep. | Wearable: sleep duration |
| C4 | Sleep quality poor | Sleep efficiency \<85% OR frequent fragmentation | 1.15× | Moderate — sleep fragmentation independently associated with tau accumulation; evidence less mature than duration | Wearable: sleep staging, efficiency |
| C5 | Excessive alcohol | \>14 drinks/week (men) or \>7 (women) | 1.2× | Strong — Lancet 2024 commission; dose-dependent above moderate levels. Direct neurotoxicity \+ thiamine deficiency pathway. | History: alcohol intake |
| C6 | Smoking (current) | Current smoker | 1.3× | Strong — Lancet 2024 commission; consistent across meta-analyses. Accelerates cerebrovascular damage \+ oxidative stress. | History: smoking status |
| C7 | Smoking (former, \>5yr quit) | Former smoker, \>5 years since quit | 1.05× | Moderate — risk attenuates significantly after cessation but residual signal persists | History: smoking history |
| C8 | Social isolation | Self-reported low social contact (validated questionnaire) | 1.3× | Strong — Lancet 2024 commission; PAF \~5%. One of the highest-PAF modifiable factors. Mechanism: reduced cognitive reserve, depression pathway, HPA axis dysregulation. | History: social assessment |
| C9 | Depression (current/recurrent) | Active MDD or ≥2 lifetime episodes | 1.3× | Strong — Lancet 2024 commission; bidirectional but causal signal supported by Mendelian randomization studies. Mechanism: cortisol-mediated hippocampal atrophy, neuroinflammation. | History: psychiatric history |
| C10 | Low cognitive engagement | No regular cognitively stimulating activity; \<12 years education | 1.3× | Strong — Lancet 2024 commission; education/cognitive engagement builds cognitive reserve. PAF \~5% for low education. | History: education, occupation, activities |
| C11 | Head trauma history | Prior TBI with LOC \>30 min or repeated concussions | 1.5× | Strong — Lancet 2024 commission; risk dose-dependent with severity and frequency. CTE pathway distinct. | History: TBI/concussion history |
| C12 | Hearing loss (untreated) | Self-reported moderate+ hearing difficulty, no hearing aids | 1.4× | Strong — Lancet 2024 commission: \#1 PAF-weighted modifiable risk factor (\~7% of all dementia). ACHIEVE trial (PMID: [40369891](https://pubmed.ncbi.nlm.nih.gov/40369891/)): hearing intervention reduced 3-year cognitive decline by 61.6% in highest-risk quartile. First RCT-level evidence for a dementia risk factor intervention. | History: supplemental intake (self-reported hearing difficulty) |
| C13 | Hearing loss (treated with hearing aids) | Self-reported hearing difficulty, uses hearing aids | 1.1× | Strong — ACHIEVE trial: significant residual risk reduction with hearing aids, but not fully eliminated. | History: supplemental intake |

Intra-domain rule:

* Sleep: max(C3, C4) — partial correlation expected  
* Substance: C5 × C6 (or C7) — independent pathways  
* Psychosocial: max(C8, C9, C10) — correlated cluster, take strongest signal  
* Physical: pick ONE of C1/C2 (suppressed when CRF cross-cutting modifier is available — see Section 6a)  
* Hearing: pick ONE of C12/C13 (mutually exclusive)  
* C11 (trauma): independent, multiply with result  
* Combine: Physical × Sleep × Substance × Psychosocial × Hearing × C11

Domain C cap: 2.5×  
CRF/C1-C2 interaction: When CRF data is available, the CRF cross-cutting modifier (Section 6a) fires and C1/C2 are suppressed (set to 1.0×). When CRF is NOT available, C1/C2 fire as activity-minutes-based fallback. This prevents double-counting fitness benefit.  
Wearable leverage: This is where Meridian's continuous wearable data creates the most value in the Neuro domain. Sleep duration, sleep quality, and physical activity are the three highest-value wearable-derived inputs. They're objective (vs. self-report), continuous (trajectory tracking), and directly modifiable. Canonical wearable inputs use the most recent completed 30-day window: physical activity is moderate-equivalent minutes per week; sleep duration is median hours per night; sleep quality is median sleep efficiency. Each requires at least 20 valid days or nights, and the window must end no more than 45 days before the engine run.

### ---

Domain D: Genetic & Familial (Non-Monogenic)

Rationale: APOE genotype is the single strongest common genetic risk factor for late-onset AD. It's not on the Invitae panel (APOE genotyping is a separate test, already flagged as ASMP recommended action). Family history adds independent signal even after APOE adjustment.

| ID | Modifier | Threshold | HR | Evidence Grade | Data Input   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| D1 | APOE ε4/ε4 (homozygous) | Homozygous ε4 | 3.0× | Strong — E2-CHARGE consortium (PMID: 31356640, N=38,537): HR 1.52 for all-cause mortality; dementia-specific OR \~12–15 for AD. We use HR 3.0 for all-cause dementia (attenuated from AD-specific OR because our outcome is all-cause dementia, not AD alone, and some ε4 risk is mediated through vascular pathways captured by CVD). | Genetic: APOE genotyping |
| D2 | APOE ε3/ε4 (heterozygous) | One ε4 allele | 1.5× | Strong — same E2-CHARGE data; dose-dependent. HR 1.17 for mortality; dementia-specific OR \~3–4 for AD. We use 1.5× for all-cause dementia. | Genetic: APOE genotyping |
| D3 | APOE ε2/ε2 or ε2/ε3 (protective) | At least one ε2 allele, no ε4 | 0.7× | Strong — E2-CHARGE: HR 0.94 for mortality; ε2 consistently protective for AD across studies. | Genetic: APOE genotyping |
| D4 | APOE ε2/ε4 | One of each | 1.0× (neutral) | Moderate — competing effects; net risk approximately population-average. Insufficient data to model interaction precisely. | Genetic: APOE genotyping |
| D5 | Family history (first-degree relative with dementia onset \<70) | ≥1 first-degree relative with early-onset dementia | 1.5× | Strong — consistently replicated; independent of APOE status. Captures unmeasured genetic \+ shared environmental risk. | History: family history |
| D6 | Family history (first-degree relative with dementia onset ≥70) | ≥1 first-degree relative with late-onset dementia | 1.2× | Moderate — weaker signal, more confounded by age-related incidence | History: family history |
| D7 | APOE not tested | APOE genotype unavailable | 1.0× (no modification) | — | Flag as high-value data gap |

Intra-domain rule:

* APOE: pick ONE of D1/D2/D3/D4/D7 (mutually exclusive)  
* FH: pick ONE of D5/D6 (use earlier-onset if both apply)  
* Combination: APOE × FH, BUT if APOE ε4/ε4 \+ early FH: cap at 4.0× (prevents implausible values; much of FH signal is likely APOE-mediated in ε4 homozygotes)  
* If APOE is ε4/ε4 and FH is positive: apply FH modifier × 0.5 (50% attenuation — substantial proportion of FH signal explained by shared APOE genotype)

Domain D cap: 4.0×  
APOE calibration note: The HRs above are deliberately conservative relative to AD-specific odds ratios from case-control studies (which cite OR 12–15 for ε4/ε4). Reasons:

1. Our outcome is all-cause dementia, not AD alone  
2. Some APOE ε4 risk operates through lipid/vascular pathways already captured in CVD domain  
3. Absolute risk in 35-60 is low — high HRs on a tiny base risk still produce small absolute risk  
4. We need the model to be useful for *all* patients, not just APOE ε4 carriers. Extreme HRs for ε4/ε4 would dominate the output and mask other modifiable factors.

## ---

6\. Sensitivity Map

---

The DomainRiskResult includes a sensitivity map showing which modifiers contributed most to the final score, ordered by absolute log-HR contribution. This enables the Action Layer (ASMP/SPAREQ) to target the highest-leverage interventions.  
Example for a hypothetical patient:  
{  
  "sensitivity\_map": \[  
    {"modifier": "D1\_APOE\_e4e4", "log\_hr": 1.10, "modifiable": false},  
    {"modifier": "A1\_ptau217\_elevated", "log\_hr": 0.69, "modifiable": false, "note": "early detection trigger"},  
    {"modifier": "C1\_physical\_inactivity", "log\_hr": 0.34, "modifiable": true},  
    {"modifier": "B3\_T2D\_present", "log\_hr": 0.47, "modifiable": true, "note": "glycemic optimization"},  
    {"modifier": "C3\_sleep\_abnormal", "log\_hr": 0.26, "modifiable": true},  
    {"modifier": "C8\_social\_isolation", "log\_hr": 0.26, "modifiable": true}  
  \]  
}

Key design choice: Non-modifiable factors (APOE, p-tau217 status) are included in the sensitivity map but flagged. They drive monitoring/surveillance intensity, not behavioral intervention. The Action Layer should prioritize candidates targeting the highest-contributing *modifiable* factors.

## ---

7\. Cross-Domain Combination (Log-Additive \+ Sigmoid)

---

Same formula as CKD v2 and CVD v2 (copied here for self-containment):  
\# Step 1: Convert base risk to log-odds  
base\_logit \= ln(base\_risk / (1 \- base\_risk))

\# Step 2: Add clamped domain log-HRs  
modified\_logit \= base\_logit  
  \+ ln(clamp(domain\_A\_hr, 1/3.0, 3.0))  
  \+ ln(clamp(domain\_B\_hr, 1/2.5, 2.5))  
  \+ ln(clamp(domain\_C\_hr, 1/2.5, 2.5))  
  \+ ln(clamp(domain\_D\_hr, 1/4.0, 4.0))

\# Step 3: Convert back to probability  
modified\_risk \= 1 / (1 \+ exp(-modified\_logit))

\# Step 4: Apply CRF cross-cutting modifier (multiplicative)  
crf\_adjusted\_risk \= modified\_risk × crf\_modifier

\# Step 5: Global cap  
final\_risk \= min(crf\_adjusted\_risk, 3.0 × base\_risk)

### Properties

* Sigmoid bounding prevents probability \>1.0  
* Domain caps: A=3.0×, B=2.5×, C=2.5×, D=4.0×  
* CRF modifier cap: 0.60×–1.4×  
* Global 3.0× cap is more aggressive than CKD's because absolute dementia risk in 35-60 is low (\~1-5% 20-year). Even 3× of 3% \= 9%, which is clinically meaningful without being alarmist.

### Missing-data default

Missing modifier \= HR 1.0 (neutral). The model does NOT impute missing data.

## ---

7a. CRF Cross-Cutting Modifier

---

Cardiorespiratory Fitness (CRF) operates as a cross-cutting modifier for dementia risk — same shared-input pattern as CVD Section 4b and Metabolic Section 6a.  
Pipeline position:  
CogDrisk-ML base risk → Domain A/B/C/D modifiers → sigmoid combination → CRF modifier → global cap → final 20-year dementia risk

Evidence: Tari et al. 2019 (*Lancet Public Health*, PMID: [31677775](https://pubmed.ncbi.nlm.nih.gov/31677775/), HUNT Study, N=30,375): participants who improved CRF over 10 years had 48% lower dementia risk (HR 0.52) compared to those who stayed unfit. CRF predicted dementia incidence AND dementia-specific mortality after adjusting for education, BMI, BP, smoking, diabetes — all CogDrisk-ML inputs.  
Mechanism: Exercise has disproportionate neurobiological benefit beyond cardiovascular protection: BDNF upregulation, hippocampal neurogenesis, cerebral blood flow enhancement, glymphatic clearance during sleep, and anti-neuroinflammatory effects.

### CRF Modifier Tiers (Age/Sex-Adjusted Percentiles)

| CRF Percentile | HR (Dementia) | Label   |
| :---- | :---- | :---- |
| \<20th (CPET) / \<15th (wearable) | 1.4× | Low fitness — high dementia risk |
| 20-49th (CPET) / 15-49th (wearable) | 1.1× | Below average |
| 50-74th (CPET) / 50-79th (wearable) | 1.0× | Reference — neutral |
| 75-97th (CPET) / 80-97th (wearable) | 0.75× | Protective |
| ≥97.7th | 0.60× | Strongly protective |

CRF modifier is multiplicative (not log-additive with domains). Cap: 0.60× to 1.4×.  
Neuro-specific note: The protective HRs are slightly stronger than CVD (0.75× vs 0.80× at 75th %ile, 0.60× vs 0.65× at elite) because the Tari data shows 48% dementia reduction — larger than the typical \~30% CV reduction for the same fitness improvement.  
C1/C2 interaction: When CRF data is available, C1/C2 (activity minutes) are suppressed. When CRF is NOT available, C1/C2 fire as fallback.  
Data quality safeguards: Same as CVD Section 4b — 30-day rolling median, source flag, uncertainty buffer for wearable sources, trend flagging, \>2 MET decline alert. Wearable CRF windows must end no more than 90 days before the engine run; CPET or submaximal test values carry their own test date and source flag.

## ---

7b. Data Completeness & Confidence Tiers

---

| Tier | Requirements | Confidence | Presentation   |
| :---- | :---- | :---- | :---- |
| Tier 1 (Full) | CogDrisk-ML base \+ ≥3 modifier domains \+ CRF \+ APOE | High | Show modified risk with full audit trail |
| Tier 2 (Partial) | CogDrisk-ML base \+ 1–2 modifier domains | Moderate | Show modified risk \+ “additional testing recommended” \+ top 3 EVOI tests |
| Tier 3 (Base only) | CogDrisk-ML inputs only | Low | Show base risk ONLY. List top 3 EVOI tests |

Minimum Viable Neuro Score (MVNS): CogDrisk-ML base \+ Domain A (p-tau217 \+ NfL) \+ Domain D (APOE) \+ CRF modifier. These are the highest-EVOI inputs for dementia risk stratification.

## ---

7c. Time-Horizon Note

---

CogDrisk-ML predicts 20-year dementia risk from midlife — different from CVD (10/30-year) and Metabolic (10-year). Our modifiers are calibrated to this horizon. Relative effects may differ over shorter or longer periods. Flag for v2 recalibration with longitudinal data.

## ---

7d. PD Gap & Emerging Biomarkers

---

There is no validated population-level PD risk prediction model for asymptomatic adults. PD without dementia is handled only by Gate 1 (monogenic: LRRK2, GBA1, SNCA) and partially by NfL elevation (non-specific neuronal injury marker that rises in PD as well as AD).  
Emerging: α-Synuclein seed amplification assay (SAA/RT-QuIC) is the most promising presymptomatic PD biomarker. CSF-based SAA shows high sensitivity/specificity for diagnosed PD (Yu et al. 2026, PMID: [41517811](https://pubmed.ncbi.nlm.nih.gov/41517811/)). Blood-based SAA is in development. When a CLIA-validated blood assay becomes available with prospective screening data, it would be a candidate for Domain A — giving us a triage gate for synucleinopathies parallel to the amyloid/tau gate for AD.  
NfL interpretation note: An NfL-elevated patient with no p-tau217 elevation and no AD-pattern findings might be showing early synucleinopathy. The spec should surface this as a clinical interpretation nuance, not a model decision.

### ---

Worked Example: Hypothetical APOE ε3/ε4 Carrier

Patient: 52F, APOE ε3/ε4, p-tau217 borderline (1.7× ULN), NfL normal, T2D: no, BP controlled on meds, BMI 27, sleep 5.5h/night (wearable), moderate hearing loss (no hearing aids), no TBI, active (CRF \~60th %ile wearable), mother had dementia onset age 72\.  
Gate 1: No monogenic variants → Gate 2\.  
CogDrisk-ML base 20-year dementia risk: \~3.5% (estimated for 52F, controlled BP, non-diabetic, non-smoker) base\_logit \= ln(0.035 / 0.965) \= \-3.317

| Domain | Modifier(s) fired | Domain HR | ln(HR)   |
| :---- | :---- | :---- | :---- |
| A (Biomarkers) | A2: p-tau217 borderline → 1.4×. NfL normal → 1.0×. | 1.4 | 0.336 |
| B (Vascular/Metabolic) | B2: HTN controlled → 1.1×. No T2D. BMI 27 (\<30). | 1.1 | 0.095 |
| C (Lifestyle) | C3: sleep 5.5h (\<6h) → 1.3×. C12: hearing loss untreated → 1.4×. No smoking/alcohol/TBI. | Sleep × Hearing \= 1.3 × 1.4 \= 1.82 (under 2.5× cap) | 0.599 |
| D (Genetic) | D2: APOE ε3/ε4 → 1.5×. D6: mother dementia ≥70 → 1.2×. Combined: 1.5 × 1.2 \= 1.8× | 1.8 | 0.588 |

Sigmoid combination: modified\_logit \= \-3.317 \+ 0.336 \+ 0.095 \+ 0.599 \+ 0.588 \= \-1.699 modified\_risk \= 1 / (1 \+ exp(1.699)) \= 15.5%  
Global cap check: 3.0× × 3.5% \= 10.5%. 15.5% \> 10.5% → cap binds. Final pre-CRF risk: 10.5%  
CRF: 60th %ile (wearable, within 50-79th neutral zone) → 1.0× Final risk: 10.5% 20-year dementia  
Confidence: Tier 1 (Full) — all 4 domains \+ CRF \+ APOE Clinical interpretation: Elevated risk driven by APOE ε3/ε4 (non-modifiable) \+ borderline p-tau217 (early detection signal) \+ short sleep \+ untreated hearing loss (both highly modifiable). Top actions: (1) hearing aids referral, (2) sleep optimization, (3) repeat p-tau217 in 12 months to assess trajectory, (4) consider amyloid PET if p-tau217 rises.

## ---

8\. Recommended Future / Additional Data Points

### ---

High priority (significant model improvement):

| Data Point | Value-Add | How Used   |
| :---- | :---- | :---- |
| APOE genotyping (if not yet done) | Highest-value single genetic test for Neuro domain. APOE ε4/ε4 \= 3× modifier on top of base risk. | Domain D — already specified as recommended ASMP action |
| Audiometric screening | ✅ PROMOTED TO v1.1 (Domain C modifiers C12/C13). \#1 PAF-weighted modifiable risk factor (\~7% PAF). ACHIEVE trial: 61.6% cognitive decline reduction. Self-report used for v1; audiometric screening recommended as v2 upgrade. | Domain C: C12 untreated 1.4×, C13 treated 1.1× |
| VO2max / cardiorespiratory fitness | ✅ PROMOTED TO v1.1 (Section 6a CRF Cross-Cutting Modifier). Tari 2019: improving CRF cuts dementia risk 48%. CRF subsumes C1/C2 when available. | Section 6a: cross-cutting modifier, 0.60×–1.4× |
| Continuous glucose monitoring (CGM) | Time-in-range and glycemic variability predict cognitive decline better than HbA1c snapshots. Relevant for both diabetic and pre-diabetic populations. | Upgrade B3/B4 with continuous glycemic data |
| Digital cognitive assessment | Brief (\~5 min) digital cognitive tests (e.g., Linus Health, Cogstate, Neurotrack) detect subtle cognitive change years before clinical diagnosis. Combined with p-tau217, AUC \>0.95 for preclinical AD detection (PMID: 40491259). | New modifier: Domain A — trajectory of objective cognitive performance |

### Medium priority (incremental improvement):

| Data Point | Value-Add   |
| :---- | :---- |
| GFAP (Glial Fibrillary Acidic Protein) | Blood biomarker of astrocyte activation; adds to NfL/p-tau217 panel. Predicts progression in APOE ε4 carriers specifically. |
| Aβ42/40 ratio (blood) | Amyloid blood test; combined with p-tau217, provides full ATN staging from blood alone. |
| α-synuclein seed amplification assay | Blood-based PD preclinical detection; not yet CLIA-validated but rapidly advancing. Would transform Gate 1 for PD genes. |
| Air pollution exposure | Lancet 2024 commission risk factor; PM2.5 exposure data available via ZIP code \+ EPA data. HR \~1.1 for high-exposure zones. |
| Vision impairment | Newly added in Lancet 2024 commission. Easy to screen. |

## ---

9\. Limitations & Caveats

1. ---

   Low absolute risk in our cohort. 20-year all-cause dementia risk for a 45-year-old is \~1-3%. Even with aggressive modifiers, we're dealing with small absolute numbers. The model is more valuable for *relative prioritization* and *early detection triggering* than for communicating absolute risk to patients.  
2. CogDrisk-ML is new (2025). It has one external validation (Whitehall II). More validation data will accumulate. CAIDE has 20 years of external validations but was built on a small, homogeneous Finnish cohort.  
3. Biomarker cutpoints are assay-dependent and evolving. p-tau217 and NfL cutpoints must be tied to specific assay platforms and updated as standardization improves. The AA/Alzheimer's Association 2024 criteria for blood biomarkers are still being operationalized.  
4. APOE HRs are ethnicity-dependent. APOE ε4 confers lower relative risk in Black and Hispanic populations compared to non-Hispanic White populations. The E2-CHARGE data is predominantly European ancestry. For SP-001 (Korean-American), the APOE ε4 HR may be slightly different — East Asian data suggests similar magnitude to European populations but with wider confidence intervals.  
5. PD risk is poorly captured by a dementia-centric base model. CogDrisk-ML predicts dementia, not Parkinson's disease specifically. PD without dementia is handled only by Gate 1 (monogenic) and partially by NfL elevation. There is no validated population-level PD risk prediction model suitable for asymptomatic adults. This is an acknowledged gap — PD is rare enough in 35-60 (incidence \~10-20/100K/year) that it's low on the Pareto curve for preventable mortality.  
6. Causal vs. associational risk factors. Many Lancet 2024 commission risk factors are supported by observational data. Mendelian randomization supports causal inference for some (education, BMI, smoking) but not all (social isolation, depression). The HRs should be interpreted as *predictive* rather than *causal* for modifiers with weaker causal evidence.  
7. No validated intervention that reverses amyloid/tau pathology in preclinical AD. p-tau217 elevation triggers monitoring and possible anti-amyloid therapy referral, but lecanemab/donanemab have modest efficacy in *symptomatic* early AD. The preclinical intervention evidence is still accruing (AHEAD 3-45, A45 trials).

## ---

11\. Interaction Notes: Cross-Domain at Action Layer

### ---

Neuro → CVD

* APOE ε4 carriers have elevated cardiovascular risk through lipid pathways (APOE ε4 → higher LDL). CVD model may already capture this via lipid modifiers. Action Layer should avoid double-recommending lipid interventions if both domains flag it.  
* Intensive BP control benefits both domains. ASMP should consolidate rather than generate duplicate BP recommendations.

### Neuro → Metabolic

* T2D prevention is arguably the single highest-leverage intervention for BOTH metabolic and neurodegenerative outcomes. ASMP should flag T2D prevention as a *multi-domain benefit* candidate — this should boost its SPAREQ score.  
* Metformin shows emerging neuroprotective signal (observational data, HR \~0.76 for dementia in T2D patients). ASMP should include this in intervention candidates for patients with T2D/prediabetes \+ Neuro risk.

### Neuro → Cancer

* Radiation sensitivity genes (ATM, TP53, BRCA1/2) don't directly interact with Neuro domain.  
* However: anti-amyloid therapies (lecanemab) require MRI surveillance for ARIA. If a patient is on an anti-amyloid therapy, this is a monitoring burden the Action Layer should consolidate with other imaging.

### Neuro → CKD

* CKD accelerates cognitive decline through uremic toxins and cerebrovascular damage. Severe CKD (eGFR \<30) is an independent dementia risk factor (HR \~1.5). However, at Meridian's age range (35-60), eGFR \<30 is rare enough that this isn't worth a dedicated modifier. Monitor for future inclusion.

### Neuro ← Longevity/Geroscience (Domain J)

* Sleep optimization and exercise are the two interventions with the strongest evidence for BOTH longevity and neuroprotection. ASMP v3.3's longevity domain should reinforce, not duplicate, these recommendations.  
* FMD/caloric restriction: limited but growing evidence for amyloid clearance via autophagy. Relevant for APOE ε4 carriers.  
* Rapamycin: mTOR inhibition shows neuroprotective signal in animal models. Human evidence still preclinical. Flag as speculative for Neuro benefit.

## ---

Summary Table: All Modifiers

---

| Domain | ID | Modifier | HR | Evidence | Primary Data Source   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| A | A1 | p-tau217 elevated | 2.0× | Strong | Blood lab |
| A | A2 | p-tau217 borderline | 1.4× | Moderate | Blood lab |
| A | A4 | NfL elevated (age-adj) | 1.5× | Strong | Blood lab |
| A | A5 | NfL markedly elevated | 2.0× | Strong | Blood lab |
| A | A6 | NfL trajectory rising | 1.8× | Moderate | Blood lab (serial) |
| B | B1 | Midlife hypertension | 1.6× | Strong | Wearable \+ clinic |
| B | B2 | Hypertension controlled | 1.1× | Strong | History \+ wearable |
| B | B3 | T2D present | 1.6× | Strong | Labs \+ history |
| B | B4 | Insulin resistance | 1.25× | Moderate | Labs |
| B | B5 | Midlife obesity | 1.3× | Strong | History |
| B | B6 | High LDL (midlife) | 1.25× | Moderate | Labs |
| C | C1 | Physical inactivity | 1.4× | Strong | Wearable |
| C | C2 | High physical activity | 0.75× | Strong | Wearable |
| C | C3 | Abnormal sleep duration | 1.3× | Strong | Wearable |
| C | C4 | Poor sleep quality | 1.15× | Moderate | Wearable |
| C | C5 | Excessive alcohol | 1.2× | Strong | History |
| C | C6 | Current smoking | 1.3× | Strong | History |
| C | C7 | Former smoking | 1.05× | Moderate | History |
| C | C8 | Social isolation | 1.3× | Strong | History |
| C | C9 | Depression | 1.3× | Strong | History |
| C | C10 | Low cognitive engagement | 1.3× | Strong | History |
| C | C11 | Head trauma | 1.5× | Strong | History |
| C | C12 | Hearing loss (untreated) | 1.4× | Strong | History |
| C | C13 | Hearing loss (treated) | 1.1× | Strong | History |
| D | D1 | APOE ε4/ε4 | 3.0× | Strong | Genetic |
| D | D2 | APOE ε3/ε4 | 1.5× | Strong | Genetic |
| D | D3 | APOE ε2/+ (protective) | 0.7× | Strong | Genetic |
| D | D5 | FH early-onset dementia | 1.5× | Strong | History |
| D | D6 | FH late-onset dementia | 1.2× | Moderate | History |

## ---

Key Citations

---

| PMID | Citation | Used For   |
| :---- | :---- | :---- |
| 40685637 | Huque & Anstey 2025, *Age Ageing* — CogDrisk-ML | Base model |
| 39096926 | Livingston et al. 2024, *Lancet* — Dementia commission | Risk factor PAFs, modifier HRs |
| 32722745 | Palmqvist et al. 2020, *JAMA* — p-tau217 | Domain A biomarker thresholds |
| 35229997 | Harp et al. 2022, *Ann Clin Transl Neurol* — NfL age adjustment | Domain A NfL calibration |
| 31356640 | Wolters et al. 2019, *PLoS One* — E2-CHARGE APOE survival | Domain D APOE HRs |
| 41629914 | Stephan et al. 2026, *BMC Med* — Dementia model meta-analysis | Base model comparison |
| 39962078 | MDSGene 2025, *NPJ Parkinsons Dis* — LRRK2 review | Gate 1 PD genetics |
| 39885961 | Karagas et al. 2025, *Neurol Genet* — AD genetic spectrum | Gate 1 AD genetics |
| 40491259 | 2025, *Alzheimers Dement* — p-tau217 \+ digital cognitive | Future data: cognitive testing |
| 41852471 | 2026, *Front Endocrinol* — T2D-dementia meta-analysis | Domain B: T2D HR |
| 31677775 | Tari et al. 2019, *Lancet Public Health* — HUNT Study CRF and dementia | CRF modifier |
| 40369891 | ACHIEVE trial 2025 — Hearing intervention and cognitive decline | Domain C: hearing loss |
| 41517811 | Yu et al. 2026, *J Clin Neurol* — α-synuclein SAA review | PD gap / future biomarker |

Data Schema Reference (Engineering Mapping):  
https://docs.google.com/spreadsheets/d/1FbnbUm6iBLwcaOZ0l7og5QAZTiVUfL-bR\_RIEFjNF5s/edit\#gid=909907825  
