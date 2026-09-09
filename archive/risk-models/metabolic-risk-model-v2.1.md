> # ⚠ SUPERSEDED — historical record, do not build on this
>
> **Version** 2.1 · **Status** Superseded · **Updated** April 2026 · **Superseded by** [`system-design/metabolic-phenotype-risk-model-condensed.md`](../../system-design/metabolic-phenotype-risk-model-condensed.md)
>
> This is the metabolic specification as it stood in April 2026, moved here from
> `Aleron-Web/docs/risk-engines/`. The current specification is
> **metabolic phenotype risk model v3.0 (26 June 2026)**.
>
> It is kept because **the engines in `Aleron-Web` were built and documented against
> this version**, so it is the only way to read that code as intended. It is not the
> clinical authority. Reconciling the two is [AL-106](https://lasohealth.atlassian.net/browse/AL-106)'s
> explicit non-goal and needs a clinician.

Meridian Metabolic Risk Model

Version 2.1 | April 2026

Executive Summary

This model estimates metabolic dysfunction risk for adults aged 35–60 across two pathways: future type 2 diabetes onset in non-diabetic patients and structured severity assessment in patients with established type 2 diabetes.

The model has four components:

1. A validated base model (QDiabetes-2018) that estimates 10-year risk of type 2 diabetes onset in non-diabetic patients  
2. A Gate 2 severity assessment (MetabolicSeverityVector) that grades glycemic control, hepatic risk, treatment adequacy, and trajectory in patients with established type 2 diabetes  
3. Four modifier domains (glycemic/insulin resistance, adiposity, hepatic/lipid, genetic/familial) plus a cross-cutting cardiorespiratory fitness modifier that adjust risk or severity using patient-specific data  
4. All calculations are deterministic. The model shares certain metabolic inputs with the CVD, CKD, and Neuro docs, while the clinical action layer deduplicates overlapping recommendations.

## 

## 1\. Scope and Overlap Resolution: Shared Metabolic Input Policy v3.4

### ---

1.1 Architectural Decision

All domain models consume raw metabolic inputs (HOMA-IR, HbA1c, fasting insulin, glucose, triglycerides, metabolic syndrome components) independently with outcome-specific hazard ratios. There is no mutual exclusivity — no domain "owns" a metabolic input to the exclusion of others. Each domain predicts a different outcome from the same underlying biology.  
This is not double-counting. The patient genuinely is at elevated risk for multiple outcomes when metabolically unhealthy.

### 1.2 Shared Input Table

| Input | CVD HR (CV events) | CKD HR (eGFR decline) | Neuro HR (dementia) | Metabolic HR (T2D onset) |
| :---- | :---- | :---- | :---- | :---- |
| HOMA-IR \>3.0 | 1.15× | 1.2× | 1.25× | Base model input (QDiabetes) |
| Prediabetic HbA1c | 1.10× | In base model | N/A | Base model input (QDiabetes) |
| MetS (≥3 components) | 1.20× | N/A | N/A | Decomposed into individual modifiers |
| T2D present | In PREVENT base | In CKD-PC base | 1.6× | Gate 2 trigger |
| Diabetic HbA1c poorly controlled | 1.15× | In base model | N/A | Glycemic control assessment |
| SGLT2i | 0.75× (CV benefit) | 0.7× (renal benefit) | N/A | T2D management |
| GLP-1 RA | 0.80× (CV benefit) | N/A | N/A | T2D management \+ weight |
| FIB-4 / hepatic | N/A | N/A | N/A | Exclusively Metabolic |
| Adiposity (BMI, WC) | N/A (indirect via PREVENT) | N/A | 1.3× (midlife obesity) | Primarily Metabolic (Domain B) |

### 1.3 CVD Domain C (Restored)

The CVD model's Domain C contains attenuated metabolic modifiers (approximately 60% of original v1 hazard ratios) to capture residual vascular damage from insulin resistance beyond what CVD Domains A and B explain. These are: HOMA-IR at 1.15× (endothelial NO/endothelin imbalance, vascular smooth muscle cell phenotypic switching), metabolic syndrome at 1.20× (clustering signal for residual vascular risk), prediabetic HbA1c at 1.10× (residual glycemic vascular damage), poorly controlled diabetic HbA1c at 1.15× (retained), SGLT2i protective at 0.75× (retained), and GLP-1 RA protective at 0.80× (retained).  
Evidence for independent vascular damage from insulin resistance: TyG meta-analysis, N=7.2 million ([PMID: 39871273](https://pubmed.ncbi.nlm.nih.gov/39871273/)); Mendelian randomization confirms causal link independent of adiposity ([PMID: 41249132](https://pubmed.ncbi.nlm.nih.gov/41249132/)).

### 1.4 Action Planning Deduplication

Interventions appearing from multiple domains are merged into one candidate with a multi-domain benefit vector. When an intervention independently benefits three or more domains, it receives priority scoring. Cross-domain contraindication gating applies: if any domain vetoes an intervention, it is excluded regardless of other domains' recommendations.

## 2\. Recommended Base Model: QDiabetes-2018

### ---

2.1 Overview

Hippisley-Cox J, Coupland C. "Development and validation of QDiabetes-2018 risk prediction algorithm to estimate future risk of type 2 diabetes: cohort study." *BMJ*. 2017;359:j5019. [PMID: 29158232](https://pubmed.ncbi.nlm.nih.gov/29158232/). DOI: 10.1136/bmj.j5019.  
QDiabetes-2018 is a sex-specific Cox proportional-hazards survival model derived on N=11,472,063 patients from the QResearch database (1,350 UK general practices, 2005–2017) and externally validated on N=3,622,488 patients from 364 separate practices. It predicts 10-year risk of incident type 2 diabetes with C-statistics of 0.889 (women) and 0.872 (men) — excellent discrimination. It is well-calibrated across deciles in the validation cohort and is NICE-endorsed for T2D risk assessment.  
Core predictors, all available in Meridian's data: age, sex, ethnicity, BMI, smoking status, first-degree family history of T2D, Townsend deprivation score (mapped to SDI proxy via zip code), treated hypertension, cardiovascular disease history, current corticosteroid use, current statin use, current atypical antipsychotic use, history of PCOS, history of gestational diabetes, and history of learning disability, schizophrenia, or bipolar disorder.  
Two optional enhancers built into QDiabetes-2018 — fasting plasma glucose and HbA1c — each improve the C-statistic by 0.03–0.05. Meridian should use the FPG+HbA1c enhanced version, as both are standard in our lab panel. This pushes discrimination above 0.90, exceptional for a screening model.

### 2.2 Model Comparison

| Criterion | QDiabetes-2018 | FINDRISC | Framingham Offspring | ADA Risk Score |
| :---- | :---- | :---- | :---- | :---- |
| Model type | Cox PH (survival) | Logistic (cross-sectional) | Cox PH | Logistic (screening) |
| Derivation N | 11.5M | 4,746 | 3,140 | Varies |
| C-statistic | 0.89 (F), 0.87 (M) | \~0.80 | \~0.85 | \~0.72 |
| Lab integration | ✅ FPG \+ HbA1c optional | ❌ No labs | ✅ FPG | ❌ No labs |
| Guideline endorsed | ✅ NICE | ✅ IDF screening | Framingham reference | ADA screening |
| Ethnicity modeled | ✅ 9 ethnic groups | ❌ Finnish-derived | ❌ Limited diversity | ❌ |
| Medication effects | ✅ Steroids, statins, antipsychotics | ❌ | ❌ | ❌ |
| PCOS / GDM | ✅ Explicitly modeled | ❌ | ❌ | ❌ |
| Published coefficients | ✅ Open-source | ✅ | ✅ | N/A |
| Age range | 25–84 | 35–64 | 30–74 | Adult |
| Deterministic | ✅ | ✅ | ✅ | ✅ |

### 2.3 Key Advantages for Meridian

Largest derivation cohort by three orders of magnitude. 11.5 million versus approximately 5,000 for FINDRISC. This statistical power detects subgroup effects (ethnicity, medication interactions) that smaller models miss.  
Lab-enhanced version exploits Meridian's data advantage. FINDRISC and ADA are designed for settings without labs. Meridian has comprehensive labs — not using them would be negligent. QDiabetes with FPG+HbA1c achieves C-statistic above 0.90.  
Ethnicity modeling. Meridian's target population includes diverse ethnicities. QDiabetes explicitly models 9 ethnic groups. FINDRISC was derived in a Finnish population — generalizability is limited.  
Medication effects built in. Corticosteroids (HR \~2× for T2D), statins (modest T2D risk increase), and atypical antipsychotics (significant T2D risk) are modeled. These are common medications in the 35–60 cohort.  
Sex-specific conditions. PCOS (HR \~1.4) and gestational diabetes history (HR \~5–7 for subsequent T2D) are explicitly modeled. No other validated model includes these at scale.  
Actionability. T2D onset is the single most preventable chronic disease outcome. The Diabetes Prevention Program demonstrated 58% reduction with lifestyle intervention ([PMID: 11832527](https://pubmed.ncbi.nlm.nih.gov/11832527/)), sustained at 43% over 7 years in the Finnish DPS ([PMID: 17098085](https://pubmed.ncbi.nlm.nih.gov/17098085/)). Identifying high-risk individuals before conversion is the highest-value screening intervention for Meridian's cohort.

### 2.4 The Pareto Argument

Type 2 diabetes is the gateway condition for the 35–60 cohort. It amplifies risk across every other Meridian domain: CVD (T2D doubles cardiovascular event rate), CKD (T2D is the number one cause of end-stage kidney disease worldwide), cancer (T2D increases risk of liver, pancreatic, colorectal, breast, and endometrial cancer), and neurodegeneration (T2D increases dementia risk approximately 1.5–2×). Preventing one case of T2D prevents the downstream cascade across four or more domains. No other single metabolic outcome has this multiplier effect. QDiabetes-2018 is the best validated model for this prediction.

## 3\. Dual-Outcome Architecture (Triage-Gated)

---

Unlike the CKD and CVD models, the Metabolic domain uses a triage gate because the clinical question fundamentally differs based on whether the patient already has T2D.

### 3.1 Gate 1: Non-Diabetic → T2D Onset Risk (Primary)

The base model is QDiabetes-2018 (FPG+HbA1c enhanced), outputting a 10-year probability of incident T2D. This applies to approximately 85–90% of Meridian's cohort (non-diabetic at enrollment). Modifier domains A through D adjust the base risk.

### 3.2 Gate 2: Established T2D → Metabolic Severity Assessment

No base survival model is used — T2D complications are modeled by the CVD, CKD, and Cancer domain models for their respective outcomes. The output is a structured MetabolicSeverityVector: glycemic control tier (well-controlled / suboptimal / poorly controlled / dangerous), hepatic risk tier via FIB-4 (low / intermediate / high fibrosis risk), treatment adequacy assessment (medication optimization gaps), and metabolic trajectory (improving / stable / worsening based on longitudinal data).  
The rationale: for patients with T2D, the unique mortality surface not already captured by CVD/CKD/Cancer models is hepatic (MASLD → MASH → cirrhosis / HCC). Other T2D complications (MI, heart failure, ESKD, neuropathy) are captured by their respective domain models. Building a separate survival model for "T2D complications" would double-count over 80% of the mortality.

### 3.3 Gate Selection Logic

Patients are routed to Gate 2 if they have a history of type 2 diabetes, or HbA1c ≥ 6.5%, or fasting plasma glucose ≥ 126 mg/dL on two or more measurements. All others go to Gate 1\. Patients with prediabetes (HbA1c 5.7–6.4%) go through Gate 1 — they are the highest-value prevention targets.

## 4\. Algorithmic Modifiers (Gate 1: Non-Diabetic T2D Onset Risk)

### ---

4.1 Domain A: Glycemic and Insulin Resistance Signals

This domain captures insulin resistance depth and glycemic trajectory beyond what QDiabetes-2018 models with its FPG/HbA1c inputs. QDiabetes-2018 enhanced already uses FPG and HbA1c; these modifiers capture insulin dynamics (HOMA-IR, C-peptide) and trajectories that are orthogonal to the static glucose/HbA1c snapshots in the base model.  
A1 — HOMA-IR Elevated. What it measures: insulin resistance beyond what fasting glucose alone reveals. Threshold: HOMA-IR \>2.5. HR: 1.3×. Evidence grade: Strong — meta-analyses consistently show HOMA-IR top quartile predicts incident T2D with HR 1.5–3.0, independent of FPG/HbA1c. Reduced to 1.3× because the QDiabetes enhanced model already partially captures insulin resistance via FPG. Data source: fasting glucose \+ fasting insulin.  
A2 — HOMA-IR Severely Elevated. What it measures: frank insulin resistance with high conversion probability. Threshold: HOMA-IR \>4.0. HR: 1.6×. Evidence grade: Strong — dose-response relationship is well established. Data source: fasting glucose \+ fasting insulin.  
A3 — Fasting Insulin Elevated (Isolated). What it measures: compensatory hyperinsulinemia that precedes FPG elevation by years, identifying the "pre-prediabetes" window. Threshold: fasting insulin \>15 µIU/mL with normal FPG (\<100 mg/dL). HR: 1.25×. Evidence grade: Moderate. Data source: fasting insulin.  
A4 — HbA1c Trajectory Worsening. What it measures: rising HbA1c within the non-diabetic range, which strongly predicts conversion. Threshold: ≥0.3% increase over 12 months while still below 6.5%. HR: 1.3×. Evidence grade: Moderate — direction is consistent across studies, though few precisely quantify the HR. Data source: longitudinal HbA1c (two or more measurements).  
A5 — TyG Index Elevated. What it measures: triglyceride-glucose index, a validated surrogate for insulin resistance that does not require insulin measurement. Threshold: ln(TG × FPG / 2\) \> 8.5. HR: 1.2×. Evidence grade: Moderate — multiple cohorts show independent T2D prediction. Data source: triglycerides \+ fasting glucose.  
A6 — C-Peptide Elevated. What it measures: beta-cell stress and insulin hypersecretion, less confounded by exogenous insulin than HOMA-IR. Threshold: \>3.0 ng/mL (fasting). HR: 1.2×. Evidence grade: Moderate. Data source: fasting C-peptide.  
*Clinical note: Insulin resistance sub-group: use one of A1/A2/A3, prioritizing A2 \> A1 \> A3 by severity. A4 (glycemic trajectory) is an independent axis and stacks with insulin resistance. A5 (TyG) fires only when HOMA-IR is unavailable (fasting insulin not drawn). A6 (C-peptide) is an independent axis providing a unique beta-cell stress signal. Domain formula: max(A1, A2, A3) × A4 × A6. Domain A cap: 2.5×.*

### 4.2 Domain B: Adiposity and Body Composition

This domain captures adiposity-driven risk beyond QDiabetes-2018's BMI input — focusing on distribution, trajectory, and visceral adiposity signals. QDiabetes-2018 already uses BMI; these modifiers capture distribution (waist circumference, waist-to-height ratio), trajectory (weight change), and metabolic quality (adiponectin) of adiposity, all orthogonal to a static BMI snapshot.  
B1 — Waist Circumference Elevated. What it measures: visceral adiposity that BMI misses in muscular or elderly individuals. Threshold: \>102 cm (men) / \>88 cm (women) per ATP-III criteria. HR: 1.3×. Evidence grade: Strong — WC predicts T2D independently of BMI (HR \~1.3–1.6 in meta-analyses). Data source: waist circumference.  
B2 — Waist-to-Height Ratio Elevated. What it measures: a universal anthropometric threshold for metabolic risk, requiring no sex- or ethnicity-specific cutoffs. Threshold: \>0.5. HR: 1.25×. Evidence grade: Strong — Ashwell meta-analysis demonstrates WHtR \>0.5 is a better predictor of T2D than BMI or WC alone. Data source: waist circumference \+ height.  
B3 — Weight Trajectory: Gaining. What it measures: midlife weight gain, independently predictive of T2D even at normal BMI. Threshold: ≥5% weight gain over 12 months. HR: 1.3×. Evidence grade: Moderate. Data source: wearable weight trend or serial weight history.  
B4 — Weight Trajectory: Significant Loss (Protective). What it measures: intentional sustained weight loss. Threshold: ≥5% intentional weight loss sustained \>6 months. HR: 0.7× (protective). Evidence grade: Strong — DPP: 7% weight loss yielded 58% T2D risk reduction ([PMID: 11832527](https://pubmed.ncbi.nlm.nih.gov/11832527/)). Finnish DPS: sustained at 43% over 7 years ([PMID: 17098085](https://pubmed.ncbi.nlm.nih.gov/17098085/)). The 0.7× is conservative. Data source: wearable weight trend \+ intentionality from history.  
B5 — BMI Severely Obese. What it measures: extreme obesity beyond the base model's non-linear BMI term. Threshold: BMI ≥40. HR: 1.4×. Evidence grade: Strong — class III obesity confers additional risk that the base model may underestimate at the extreme. Data source: BMI.  
B6 — Adiponectin Low. What it measures: metabolically unhealthy obesity. Low adiponectin in high-BMI patients identifies those with the "metabolically unhealthy" phenotype. Threshold: \<4 µg/mL (men) / \<7 µg/mL (women). HR: 1.2×. Evidence grade: Moderate — adiponectin is inversely associated with insulin resistance and T2D risk. Data source: adiponectin.  
*Clinical note: Waist measures: use one of B1/B2, preferring B2 for cross-ethnic applicability. Weight trajectory: B3 and B4 are mutually exclusive. B5 (extreme BMI) and B6 (adiponectin) are independent axes. Domain formula: max(B1, B2) × max(B3, B4) × B5 × B6. Domain B cap: 2.0×.Clinical note — ethnicity adjustment: Asian populations have higher metabolic risk at lower BMI thresholds. Meridian uses ethnicity-adjusted WC cutoffs: \>90 cm for Asian men, \>80 cm for Asian women per IDF criteria. QDiabetes partially handles this via its ethnicity coefficient, but WC thresholds must be explicit in the modifier logic.*

### 4.3 Domain C: Hepatic and Lipid Signals

This domain captures liver-specific metabolic risk (MASLD/steatohepatitis) and lipid patterns reflecting insulin resistance beyond what QDiabetes models. Notably, QDiabetes-2018 does *not* include liver markers — this entire domain is orthogonal to the base model. FIB-4 serves a dual purpose: modifier for T2D onset risk in Gate 1, and hepatic risk triage in Gate 2\.  
C1 — FIB-4 Intermediate. What it measures: intermediate liver fibrosis risk, warranting further workup. Threshold: FIB-4 1.30–2.67. HR: 1.25× (plus hepatology awareness flag). Evidence grade: Strong — FIB-4 is the recommended first-line non-invasive test for liver fibrosis per AASLD/EASL guidelines. Intermediate FIB-4 in a metabolic patient independently predicts T2D progression. Data source: age, AST, ALT, platelets.  
C2 — FIB-4 Elevated. What it measures: likely advanced fibrosis (F3–F4). Threshold: FIB-4 \>2.67. HR: 1.5× (plus hepatology referral flag). Evidence grade: Strong — high specificity (\~97%) for advanced fibrosis in MASLD. These patients have MASH until proven otherwise. Data source: age, AST, ALT, platelets.  
C3 — ALT Elevated (Persistent). What it measures: persistent transaminitis, usually reflecting MASLD in metabolic patients. Threshold: ALT \>40 U/L on two or more measurements, other causes excluded. HR: 1.2×. Evidence grade: Moderate — ALT elevation independently predicts T2D incidence (HR \~1.3), likely through the shared insulin resistance pathway. Data source: serial ALT.  
C4 — GGT Elevated. What it measures: hepatic insulin resistance and oxidative stress — one of the strongest liver-derived predictors of incident T2D. Threshold: \>50 U/L (men) / \>35 U/L (women). HR: 1.3×. Evidence grade: Strong — meta-analysis: top versus bottom quartile GGT → HR \~1.5 for T2D. Data source: GGT.  
C5 — TG/HDL Ratio Elevated. What it measures: a practical insulin resistance surrogate validated against HOMA-IR. Threshold: \>3.5 (men) / \>2.5 (women). HR: 1.2×. Evidence grade: Moderate — predicts T2D independently. Ethnicity-specific cutoffs needed (lower for Asian populations). Data source: triglycerides \+ HDL.  
C6 — Ferritin Elevated. What it measures: hepatic iron loading (non-inflammatory), which impairs insulin signaling and beta-cell function. Threshold: \>300 ng/mL (men) / \>200 ng/mL (women), with normal CRP. HR: 1.2×. Evidence grade: Moderate — prospective cohorts show HR \~1.3–1.7 for T2D. Must exclude inflammation via CRP. Data source: ferritin \+ CRP.  
C7 — Uric Acid Elevated. What it measures: hyperuricemia as an independent predictor of insulin resistance. Threshold: \>7.0 mg/dL (men) / \>6.0 mg/dL (women). HR: 1.15×. Evidence grade: Moderate — meta-analysis: HR \~1.2 per 1 mg/dL increase. Mechanism: oxidative stress, endothelial dysfunction, beta-cell impairment. Data source: uric acid.  
*Clinical note: Fibrosis sub-group: use one of C1/C2 (mutually exclusive tiers). Liver enzymes: C3 (ALT) and C4 (GGT) are partially correlated — use max(C3, C4) plus 50% of the excess from the smaller (partial credit). C5 (TG/HDL) is an independent axis. C6 and C7 both reflect overlapping oxidative/metabolic stress — use max(C6, C7). Domain formula: max(C1, C2) × partial\_credit(C3, C4) × C5 × max(C6, C7). Domain C cap: 2.5×.*

### 4.4 Domain D: Genetic and Familial

This domain captures heritable metabolic risk from monogenic variants and family history beyond QDiabetes-2018's family history and ethnicity coefficients.  
D1 — GCK-MODY (MODY2). GCK pathogenic or likely pathogenic variant. This is *not* type 2 diabetes. GCK-MODY causes stable mild fasting hyperglycemia (100–145 mg/dL) that does not progress and does not require treatment. Override: the probabilistic model is bypassed entirely and the MODY protocol is invoked, preventing misclassification and unnecessary intervention. Evidence grade: Strong. Data source: Invitae genetic panel (if GCK included).  
D2 — HNF1A-MODY (MODY3). HNF1A pathogenic or likely pathogenic variant. The most common form of MODY. Responds to sulfonylureas — *not* metformin or insulin as first-line. Progressive. Override: MODY protocol. Evidence grade: Strong. Data source: Invitae genetic panel (if HNF1A included).  
D3 — HNF4A-MODY (MODY1). HNF4A pathogenic or likely pathogenic variant. Similar to HNF1A-MODY. Sulfonylurea-responsive. Override: MODY protocol. Evidence grade: Strong. Data source: Invitae genetic panel (if HNF4A included).  
D4 — HNF1B-MODY (MODY5). HNF1B pathogenic or likely pathogenic variant. MODY5 causes renal cysts and diabetes syndrome — cross-domain interaction with the CKD model. Override: MODY \+ renal protocol. Evidence grade: Strong. Data source: Invitae genetic panel (if HNF1B included).  
D5 — ABCC8/KCNJ11 Variants. Pathogenic or likely pathogenic variants. Sulfonylurea-responsive. May present as apparent T2D in adults. Genetic diagnosis changes management. Override: neonatal DM/MODY protocol. Evidence grade: Strong. Data source: Invitae genetic panel.  
D6 — Family History: Strong T2D. What it measures: stronger familial risk than what QDiabetes already models (one parent with T2D). Threshold: ≥2 first-degree relatives with T2D, or 1 first-degree relative with T2D onset before age 45\. HR: 1.3×. Evidence grade: Moderate. Data source: family history intake.  
D7 — Family History: Gestational Diabetes in Mother. What it measures: maternal GDM as a risk factor for the offspring. Offspring of GDM mothers have approximately 4× risk of developing prediabetes/T2D by age 30\. QDiabetes captures the patient's own GDM history but not maternal GDM. Threshold: mother had gestational diabetes. HR: 1.2×. Evidence grade: Moderate. Data source: family history intake.  
D8 — Early-Onset T2D in Family. What it measures: early-onset diabetes clustering in families, suggesting stronger genetic load and possible undiagnosed MODY. Threshold: first-degree relative with T2D onset before age 35\. HR: 1.4×. Evidence grade: Strong. Data source: family history intake.  
*Clinical note — MODY overrides: D1–D5 override the probabilistic model entirely. MODY is a specific diagnosis with specific management. If identified, the model outputs the MODY protocol and stops — same pattern as PKD in the CKD model and HCM/arrhythmia in the CVD model. Family history modifiers (D6–D8) fire only when family history is not explained by an identified MODY variant. Family history hierarchy: D8 \> D6 \> D7 (use the highest applicable). QDiabetes already models one-parent T2D; D6 fires only for stronger-than-modeled family history. Domain D cap: 1.5× (excluding MODY overrides).Clinical note — Invitae panel coverage: The current Invitae 163-gene panel must be verified for inclusion of GCK, HNF1A, HNF4A, HNF1B, ABCC8, and KCNJ11. If these genes are not on the panel, D1–D5 cannot fire, and this should be flagged as a panel gap. MODY is underdiagnosed in adults — up to 5% of patients diagnosed with T2D may actually have monogenic diabetes.*

## 5\. Gate 2: Metabolic Severity Assessment (Established T2D)

---

For patients with established type 2 diabetes, the model outputs a MetabolicSeverityVector rather than a single probability.

### 5.1 Glycemic Control Tier

Well-controlled: HbA1c \<7.0% on current therapy. Clinical implication: maintenance and monitoring.  
Suboptimal: HbA1c 7.0–8.0%. Clinical implication: therapy optimization — consider intensification.  
Poorly controlled: HbA1c 8.0–10.0%. Clinical implication: urgent therapy change. High modifier in CVD/CKD domains.  
Dangerous: HbA1c \>10.0% or recurrent severe hypoglycemia. Clinical implication: endocrinology referral, immediate risk.

### 5.2 Hepatic Risk Tier (MASLD Screening)

All T2D patients should be screened for MASLD — prevalence is approximately 55–70% in T2D. The screening algorithm uses FIB-4 as the first-line test, calculated as (Age × AST) / (Platelets × √ALT). All inputs are available in Meridian's lab panel, and FIB-4 should be automatically calculated for every T2D patient at every lab draw.  
FIB-4 below 1.30 indicates low risk; rescreen annually. FIB-4 between 1.30 and 2.67 is intermediate — proceed to step 2 with ELF score or FibroScan if available to confirm or exclude advanced fibrosis. FIB-4 above 2.67 indicates high risk and warrants hepatology referral.

### 5.3 Treatment Adequacy Assessment

The model identifies the following treatment gaps in established T2D:  
Metformin gap: Patient not on metformin and no contraindication (eGFR \>30) — first-line therapy gap.  
Cardiorenal protection gap: Patient with T2D plus CVD risk or CKD who is not on a GLP-1 RA or SGLT2i — both recommended per ADA 2024 Standards of Care.  
Statin gap: Patient with T2D aged 40–75 not on moderate-intensity statin per ADA guidelines — cardiovascular risk reduction gap.  
Blood pressure gap: Patient with T2D and BP \>130/80 not on ACEi/ARB (preferred agent) — blood pressure control gap.  
Weight management gap: Patient with BMI ≥27 and T2D not considered for GLP-1 RA or tirzepatide — weight intervention gap.

### 5.4 Metabolic Trajectory

Using longitudinal data (two or more data points over six or more months), the model reports trajectory along four axes: HbA1c trajectory (improving if ≥0.3% decrease, stable, or worsening if ≥0.3% increase), weight trajectory (losing if ≥3%, stable, or gaining if ≥3%), renal trajectory (stable eGFR or declining — the CKD model handles this in detail), and hepatic trajectory (FIB-4 stable or increasing). Trajectory is reported as a vector of directions for clinical action planning, not as a probability.  
*Clinical note — Gate 2 decision rules: Poorly controlled glycemia combined with high FIB-4 triggers hepatology referral plus SGLT2i/GLP-1 RA priority. Any treatment gap generates a specific intervention recommendation with gap rationale. Worsening trajectory on any axis flags the patient for 6-week reassessment. Dangerous glycemic tier (HbA1c \>10 or recurrent severe hypoglycemia) triggers endocrinology referral with an immediate risk flag.*

## 6\. Cross-Domain Combination (Gate 1\)

### ---

6.1 Combination Formula

The cross-domain combination uses the same sigmoid-bounded, log-additive approach as the CKD and CVD models. The base risk is converted to log-odds. Each clamped domain log-hazard ratio is added. The result is converted back to probability via the sigmoid function. Finally, the CRF cross-cutting modifier is applied multiplicatively.  
Properties: sigmoid bounding prevents probability exceeding 1.0; log-odds is the natural scale for Cox PH hazard ratios; each domain's contribution is fully auditable; the function is monotonic (adding any risk modifier always increases adjusted risk). Domain caps enforced: A \= 2.5×, B \= 2.0×, C \= 2.5×, D \= 1.5×. CRF modifier cap: 0.65× to 1.4×.  
Missing-data default: Missing modifier \= HR 1.0 (neutral). The model does not impute missing data. If 12-month trajectory data are unavailable (A4 HbA1c trajectory, B3/B4 weight trajectory), the model uses the single-point measurement with a "trajectory unavailable" flag.

### 6.2 CRF Cross-Cutting Modifier

Cardiorespiratory fitness operates as a cross-cutting modifier for T2D onset risk, using the same shared-input pattern as the CVD model's CRF modifier. CRF independently predicts T2D after adjusting for BMI and other QDiabetes inputs.  
The CRF modifier is applied after sigmoid combination of domains A–D. It is multiplicative (not log-additive with the domains). Cap: 0.65× to 1.4×.  
Evidence: Williams 2008 (*Med Sci Sports Exerc*, [PMID: 18461008](https://pubmed.ncbi.nlm.nih.gov/18461008/), N=41,124): higher baseline CRF predicted significantly lower incident diabetes independent of activity volume. The Aerobics Center Longitudinal Study body of work (Sui, Blair et al.): low CRF → HR approximately 2.0–3.7× for T2D incidence versus high CRF, after adjusting for BMI, age, smoking, family history — all QDiabetes inputs.  
Mechanism: CRF reflects skeletal muscle insulin sensitivity, GLUT4 transporter density, mitochondrial oxidative capacity, and hepatic insulin clearance — none captured by BMI. A fit person at BMI 28 has fundamentally different insulin dynamics than an unfit person at BMI 28\. QDiabetes sees the same BMI; CRF differentiates them.  
CRF modifier tiers (age/sex-adjusted percentiles):  
CRF below the 20th percentile on CPET (or below the 15th on wearable): HR 1.4× — low fitness, high T2D risk. Between the 20th and 49th percentile on CPET (15th–49th wearable): HR 1.1× — below average. Between the 50th and 74th percentile on CPET (50th–79th wearable): HR 1.0× — reference, neutral. Between the 75th and 97th percentile on CPET (80th–97th wearable): HR 0.80× — protective. At or above the 97.7th percentile: HR 0.65× — strongly protective.  
*Clinical note: T2D hazard ratios differ slightly from CVD hazard ratios because the dose-response curve shape differs by outcome. The protective effect of high CRF is particularly strong for T2D prevention — the DPP showed exercise is the most powerful T2D prevention intervention (PMID: 11832527). Data quality safeguards include a 30-day rolling median, source flag (wearable/CPET/submaximal), uncertainty buffer for wearable sources, and trend flagging with an alert if CRF declines by more than 2 METs. Wearable CRF windows must end no more than 90 days before the engine run; CPET or submaximal test values carry their own test date and source flag. If CRF data are not available, the modifier is skipped and the model flags this for clinical action planning as "establish CRF baseline."*

### 6.3 Data Completeness and Confidence Tiers

Tier 1 (Full confidence): QDiabetes base plus three or more modifier domains plus CRF. Present the modified risk with full audit trail.  
Tier 2 (Moderate confidence): QDiabetes base plus one or two modifier domains. Present the modified risk plus "additional testing recommended" and the top three expected-value-of-information tests.  
Tier 3 (Base only): QDiabetes inputs only. Present the base risk only — do not present modified risk. List the top three expected-value-of-information tests.  
Minimum Viable Metabolic Score: QDiabetes base (FPG+HbA1c enhanced) \+ Domain A (HOMA-IR/TyG) \+ Domain B (WC/BMI) \+ CRF modifier. Domains C and D enhance precision but are not required for clinically useful output.

### 6.4 US Adaptation Notes

QDiabetes-2018 was derived on UK QResearch data. For US deployment: the Townsend deprivation coefficient is set to 0 (neutral) for v1, as cross-Atlantic mapping is not validated — recalibration is planned with Meridian data at N \> 5,000. Ethnicity coefficients are retained as-is (QDiabetes models 9 ethnic groups; Korean-American and South Asian subgroups are flagged for monitoring). The FPG+HbA1c enhanced version is used to maximize discrimination (C-statistic \>0.90).

### 6.5 Ethnicity-Adjusted Thresholds

Domain B adiposity thresholds are ethnicity-adjusted by default in implementation:

| Population | WC Elevated (M/F) | BMI Obesity Threshold |
| :---- | :---- | :---- |
| Standard | \>102 cm / \>88 cm | ≥30 |
| Asian / South Asian (IDF) | \>90 cm / \>80 cm | ≥25 |

## 7\. Worked Examples

### ---

7.1 Worked Example 1: SP-001 (Gate 1 — Limited Data)

SP-001: 47-year-old male, Korean-American, BMI \~26, non-diabetic, non-smoker, no T2D family history.  
QDiabetes-2018 base: approximately 8% 10-year risk (log-odds \= −2.442).  
Domain A: HOMA-IR unavailable (fasting insulin not drawn); FPG normal. Domain HR \= 1.0. Domain B: BMI 26 (borderline at the Asian obesity threshold of 25); waist circumference unknown. Domain HR \= 1.0. Domain C: ALT/AST not flagged; GGT and TG/HDL unknown. Domain HR \= 1.0. Domain D: No MODY variants; no strong family history. Domain HR \= 1.0.  
CRF: approximately 80th percentile (wearable) → 0.80× (protective).  
Final risk: 8% × 0.80 \= 6.4% 10-year T2D risk.  
Confidence: Tier 2 (CRF active but no domain modifiers due to missing data).  
Recommended follow-up: Obtain fasting insulin (for HOMA-IR calculation), waist circumference, and GGT.

### 7.2 Worked Example 2: High-Risk Patient (Gate 1 — Full Data)

Patient: 45-year-old female, BMI 31, waist circumference 96 cm (exceeding the Asian threshold of 80 cm), HOMA-IR 4.2, FIB-4 1.4, mother and sister both have T2D. Non-smoker. No MODY variants. CRF: 25th percentile (wearable).  
QDiabetes-2018 base: approximately 18% 10-year risk (base log-odds \= −1.516).  
Domain A: A2 fires — HOMA-IR 4.2 (\>4.0) → HR 1.6× (ln \= 0.470). Domain B: B2 fires — WHtR 0.58 (\>0.5) → HR 1.25× (ln \= 0.223). Domain C: C1 fires — FIB-4 1.4 (intermediate range) → HR 1.25× (ln \= 0.223). Domain D: D6 fires — two or more first-degree relatives with T2D → HR 1.3× (ln \= 0.262).  
Sigmoid combination: modified log-odds \= −1.516 \+ 0.470 \+ 0.223 \+ 0.223 \+ 0.262 \= −0.338. Modified risk \= 1 / (1 \+ exp(0.338)) \= 41.6%.  
CRF: 25th percentile (wearable, above the 15th percentile threshold) → 1.1×.  
Final risk: 41.6% × 1.1 \= 45.8% 10-year T2D risk.  
Confidence: Tier 1 (Full) — all four domains plus CRF.  
*Clinical interpretation: Very high risk. Immediate DPP-equivalent lifestyle intervention recommended. Consider metformin. GLP-1 RA for combined weight and metabolic benefit. FIB-4 intermediate → hepatology awareness. Rescreen annually.*

## 8\. Recommended Future and Additional Data Points

### ---

8.1 Tier 1: High-Value, Near-Term Collectible

Fasting insulin. Enables HOMA-IR calculation — the single most important metabolic modifier. Without it, Domain A is severely underpowered. Currently not standard in the Quest Elite panel. Also enables C-peptide-to-insulin ratio for beta-cell function assessment. *Recommendation: add to Meridian standard panel.*  
GGT. The strongest liver-derived predictor of T2D. Often omitted from "standard" panels but costs less than $5 and is trivially addable. *Recommendation: add to Meridian standard panel.*  
Waist circumference. Visceral adiposity not captured by BMI. A 30-second measurement that massively improves body composition assessment, especially in Asian patients where BMI underestimates metabolic risk. *Recommendation: collect at every in-person encounter.*  
Polygenic risk score (PRS) for T2D. PRS for T2D is more mature than for most diseases. Top 5% PRS → HR \~2–3× for T2D independent of clinical features. Would stratify the approximately 85% of patients without monogenic findings. Proposed Domain D addition: PRS top 5% → 1.5×, PRS bottom 20% → 0.8×. Allelica AbsoluteDx includes T2D PRS.  
Continuous glucose monitor (CGM) metrics. Time-in-range, glycemic variability (coefficient of variation), and time-above-range provide dynamic glucose data unavailable from snapshot labs. Identifies glucose intolerance patterns in non-diabetic patients with normal FPG/HbA1c. Proposed new Domain A modifier: CGM glucose variability (CV \>36%) or time above 140 mg/dL \>25% in a non-diabetic patient → 1.3×. Emerging evidence, but mechanistically compelling.

### 8.2 Tier 2: Moderate Value, Longer-Term

1,5-Anhydroglucitol (1,5-AG). Reflects glycemic excursions over the prior 1–2 weeks. Captures postprandial spikes that HbA1c misses. Low 1,5-AG (\<10 µg/mL) in a non-diabetic patient flags postprandial dysglycemia → proposed 1.2× modifier.  
PNPLA3 rs738409 (I148M). The strongest common genetic risk factor for MASLD/MASH. Homozygous carriers (GG) have approximately 3× risk of steatohepatitis and 12× risk of HCC in the MASLD context. Proposed Domain D addition for hepatic risk: PNPLA3 I148M homozygous → C1/C2 HR multiplied by 1.5×. Requires genotyping array or whole-genome sequencing (not on monogenic panel).  
TM6SF2 rs58542926 (E167K). The second-strongest MASLD genetic risk variant. Increases hepatic fat but paradoxically decreases cardiovascular risk (retained hepatic lipid → less atherogenic VLDL). This is a critical cross-domain signal: TM6SF2 carriers have lower CVD risk but higher liver risk.  
Branched-chain amino acids (BCAA). Elevated BCAA (leucine, isoleucine, valine) predict T2D 5–12 years before diagnosis, independently of BMI and fasting glucose. One of the earliest metabolic signals. Proposed Domain A modifier: BCAA panel top quartile → 1.25×. Requires specialized metabolomics assay.  
Gut microbiome composition. Emerging evidence for microbiome signatures predicting T2D and metabolic health. Not yet clinically actionable. Not ready for modifier implementation.

## 9\. Limitations and Notes

---

1\. UK derivation cohort. QDiabetes-2018 was derived in UK populations. While it models 9 ethnicities, calibration for East Asian (Korean, Japanese, Chinese) and South Asian populations specifically may differ. The UK South Asian and Chinese cohorts in QDiabetes are smaller than the White British majority. Meridian should plan for recalibration as its own outcome data accumulates.  
2\. Townsend deprivation coefficient set to neutral. QDiabetes uses UK Townsend deprivation quintiles derived from UK census variables (car ownership, overcrowding, unemployment, renter status). The US Social Deprivation Index measures different constructs. The mapping is not validated, and a miscalibrated coefficient could systematically bias risk for entire ZIP codes. Decision: set to 0 (neutral) for v1 launch. Recalibrate with Meridian's own longitudinal outcome data at N \> 5,000 (estimated 2–3 years post-launch). Flagged as a known gap.  
3\. Gate 2 does not produce a mortality probability. This is deliberate — T2D mortality is over 80% mediated through CVD and CKD, which have their own domain models. A "T2D mortality score" would double-count. The MetabolicSeverityVector instead provides structured severity and gap information that drives intervention prioritization.  
4\. MODY override conditions depend on Invitae panel gene coverage. If GCK, HNF1A, HNF4A, HNF1B, ABCC8, and KCNJ11 are not on the current 163-gene panel, this is a significant gap. MODY is underdiagnosed — 1–5% of "T2D" patients have monogenic diabetes, and correct diagnosis changes treatment (sulfonylureas over metformin for HNF1A/HNF4A-MODY; no treatment needed for GCK-MODY).  
5\. Domain C bridges both gates. FIB-4 is a modifier in Gate 1 (T2D risk predictor) and a screening tool in Gate 2 (MASLD severity). This dual use is architecturally clean — same calculation, different clinical context.  
6\. Weight trajectory modifiers require longitudinal data. First-visit patients will not have trajectory data. B3 and B4 only activate after two or more data points with six or more months between them. This is a feature — the model improves over time as longitudinal data accumulates.  
7\. No alcohol consumption modifier. Alcohol intake affects both T2D risk (J-shaped curve) and liver disease. QDiabetes does not model alcohol, and the evidence for a deterministic modifier is complex (moderate alcohol may be protective for T2D but harmful for MASLD). Excluded from v1 pending further analysis.  
8\. CRF/VO2max as a cross-cutting modifier. The DPP showed exercise is the most powerful T2D prevention intervention ([PMID: 11832527](https://pubmed.ncbi.nlm.nih.gov/11832527/)). CRF independently predicts T2D onset after adjusting for BMI and other QDiabetes inputs (Williams 2008, [PMID: 18461008](https://pubmed.ncbi.nlm.nih.gov/18461008/)). When multiple domains recommend increased exercise, the clinical action layer deduplicates this into one multi-domain-benefit intervention.

## 10\. Cross-Domain Interaction Notes

### ---

10.1 Metabolic ↔ CVD

T2D is the single strongest modifiable CVD risk factor. Preventing T2D (Gate 1\) is arguably the highest-impact CVD prevention strategy. The model flags metabolic interventions (lifestyle, metformin, GLP-1 RA) as CVD-preventive. SGLT2i and GLP-1 RA have independent cardiovascular benefit (SELECT: [PMID: 37952131](https://pubmed.ncbi.nlm.nih.gov/37952131/)). When both models recommend these drugs, clinical action planning presents one recommendation with multi-domain benefit notation. Both models consume the same metabolic inputs independently per the Shared Metabolic Input Policy v3.4 (see Section 2).

### 10.2 Metabolic ↔ CKD

SGLT2i benefits CKD independently of diabetes status (DAPA-CKD: [PMID: 32970396](https://pubmed.ncbi.nlm.nih.gov/32970396/); EMPA-KIDNEY: [PMID: 36331190](https://pubmed.ncbi.nlm.nih.gov/36331190/)). A single clinical recommendation with CKD \+ Metabolic \+ CVD benefit is generated. HNF1B-MODY (D4) triggers a cross-domain override — HNF1B causes both diabetes and renal cystic disease; when D4 fires, the CKD model is alerted for renal imaging. Obesity, insulin resistance, and hyperglycemia drive both T2D and CKD progression — the model credits weight management interventions across both domains.

### 10.3 Metabolic ↔ Cancer

T2D increases cancer risk: liver (HCC, especially in MASLD/MASH), pancreatic, colorectal, breast, and endometrial. The Cancer model notes T2D status as a risk amplifier for organ-specific screening protocols. Metformin's cancer signal: observational data suggests metformin may reduce cancer incidence, and the DPP 21-year follow-up ([PMID: 40243198](https://pubmed.ncbi.nlm.nih.gov/40243198/)) examined this in a randomized setting. Cross-domain benefit is noted but not formally scored until RCT evidence is definitive. Weight loss interventions (bariatric surgery, GLP-1 RA) may reduce obesity-associated cancer risk — an emerging signal from semaglutide data, tracked for cross-domain benefit.

### 10.4 Metabolic ↔ Neurodegeneration

T2D increases dementia risk approximately 1.5–2×. Insulin resistance in the brain ("type 3 diabetes" hypothesis) may drive Alzheimer's pathology independently of vascular mechanisms. Intranasal insulin and GLP-1 RA neuroprotection are under active investigation — emerging trial data for semaglutide in Alzheimer's. If confirmed, these become triple-domain interventions (Metabolic \+ CVD \+ Neuro). The Neuro domain model uses the CogDrisk-ML base ([PMID: 40685637](https://pubmed.ncbi.nlm.nih.gov/40685637/)).

### 10.5 General Principle

Each domain model operates independently on raw patient data (per the flat peer architecture). Cross-domain interactions are resolved only at the clinical action planning layer. No domain model consumes another domain model's output.

## 11\. Evidence Grading Key

---

Strong: Randomized controlled trial or large meta-analysis (\>50,000 patients), relevant endpoint, consistent results. HR used as-is.  
Moderate: Large observational cohort, relevant endpoint, some confounding concerns. HR used but flagged for recalibration priority.  
Weak: Extrapolated endpoint, high heterogeneity (I² \> 75%), or mechanistic reasoning only. HR used at reduced magnitude; flagged as "mechanistic extrapolation."

## 12\. Key References

---

1\. Hippisley-Cox J, Coupland C. "Development and validation of QDiabetes-2018 risk prediction algorithm." *BMJ* 2017;359:j5019. [PMID: 29158232](https://pubmed.ncbi.nlm.nih.gov/29158232/). ✅ Verified.  
2\. Knowler WC et al. (DPP). "Reduction in the incidence of type 2 diabetes with lifestyle intervention or metformin." *NEJM* 2002\. [PMID: 11832527](https://pubmed.ncbi.nlm.nih.gov/11832527/). ✅ Verified.  
3\. Lindström J et al. (Finnish DPS). "Sustained reduction in the incidence of type 2 diabetes by lifestyle intervention." *Lancet* 2006\. [PMID: 17098085](https://pubmed.ncbi.nlm.nih.gov/17098085/). ✅ Verified.  
4\. Lincoff AM et al. (SELECT). "Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes." *NEJM* 2023\. [PMID: 37952131](https://pubmed.ncbi.nlm.nih.gov/37952131/). ✅ Verified.  
5\. Wadden TA et al. (SURMOUNT-3). "Tirzepatide after intensive lifestyle intervention in adults with overweight or obesity." *Nat Med* 2023\. [PMID: 37840095](https://pubmed.ncbi.nlm.nih.gov/37840095/). ✅ Verified.  
6\. DPP Research Group. "Randomized Study of Metformin and Intensive Lifestyle Intervention on Cancer Incidence over 21 Years." *Cancer Prev Res* 2025\. [PMID: 40243198](https://pubmed.ncbi.nlm.nih.gov/40243198/). ✅ Verified.  
7\. NIDDK. "The Diabetes Prevention Program and Its Outcomes Study." *Diabetes Care* 2025\. [PMID: 40272279](https://pubmed.ncbi.nlm.nih.gov/40272279/). ✅ Verified.  
8\. Heerspink HJL et al. (DAPA-CKD). "Dapagliflozin in Patients with CKD." *NEJM* 2020\. [PMID: 32970396](https://pubmed.ncbi.nlm.nih.gov/32970396/). ✅ Verified.  
9\. EMPA-KIDNEY Collaborative Group. "Empagliflozin in Patients with CKD." *NEJM* 2023\. [PMID: 36331190](https://pubmed.ncbi.nlm.nih.gov/36331190/). ✅ Verified.  
10\. Mottillo S et al. "The metabolic syndrome and cardiovascular risk: a systematic review and meta-analysis." *JACC* 2010\. PMID: Pending manual verification.  
11\. Ashwell M et al. "Waist-to-height ratio: a better screening tool than waist circumference and BMI." *Obes Rev* 2012\. PMID: Pending manual verification.  
12\. ADA Standards of Care 2024 — Section on pharmacotherapy for T2D. (Guideline; no single PMID.)  
13\. AASLD/EASL MASLD Clinical Practice Guidelines 2023–2024. (Guideline.)  
14\. Williams PT. "Physical fitness and activity as separate heart disease risk factors: a meta-analysis." *Med Sci Sports Exerc* 2008\. [PMID: 18461008](https://pubmed.ncbi.nlm.nih.gov/18461008/).  
15\. TyG index meta-analysis, N=7.2M. [PMID: 39871273](https://pubmed.ncbi.nlm.nih.gov/39871273/).  
16\. Mendelian randomization: insulin resistance and vascular damage, independent of adiposity. [PMID: 41249132](https://pubmed.ncbi.nlm.nih.gov/41249132/).  
17\. CogDrisk-ML (Neuro domain base model). [PMID: 40685637](https://pubmed.ncbi.nlm.nih.gov/40685637/).

Data Schema Reference (Engineering Mapping):  
https://docs.google.com/spreadsheets/d/1FbnbUm6iBLwcaOZ0l7og5QAZTiVUfL-bR\_RIEFjNF5s/edit\#gid=267409730  
