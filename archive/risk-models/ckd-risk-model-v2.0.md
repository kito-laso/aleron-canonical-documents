> # ⚠ SUPERSEDED — historical record, do not build on this
>
> **Version** 2.0 · **Status** Superseded · **Updated** April 2026 · **Superseded by** [`system-design/ckd-phenotype-risk-model-condensed.md`](../../system-design/ckd-phenotype-risk-model-condensed.md)
>
> This is the CKD specification as it stood in April 2026, moved here from
> `Aleron-Web/docs/risk-engines/`. The current specification is
> **CKD phenotype risk model v4.0 (26 June 2026)**.
>
> It is kept because **the engines in `Aleron-Web` were built and documented against
> this version**, so it is the only way to read that code as intended. It is not the
> clinical authority. Reconciling the two is [AL-106](https://lasohealth.atlassian.net/browse/AL-106)'s
> explicit non-goal and needs a clinician.

Meridian CKD Risk Model/mod

Version 2.0 | April 2026

Executive Summary

This model identifies adults aged 35–60 at elevated risk of chronic kidney disease — early enough that proven interventions (RAAS blockade, SGLT2 inhibitors, blood pressure control) meaningfully reduce the probability of kidney failure and associated cardiovascular death.

The model has three components:

1. A two-stage base model that routes patients to the correct risk equation based on their initial labs  
2. Eight algorithmic modifiers organized into four mechanistic domains, with built-in safeguards against overcounting correlated risk factors  
3. A sigmoid-bounded combination formula that prevents implausible risk estimates

All calculations are deterministic. No AI is involved in the risk scoring itself.

## ---

1\. Base Model: Two-Stage Routing

Most 35–60 year olds do not have established CKD. The model selects the appropriate equation based on initial lab results.

Stage A — No Established CKD (eGFR ≥60 and UACR \<30 mg/g)

CKD Prognosis Consortium Incident CKD Risk Equations. Predicts 5-year probability of developing CKD (eGFR falling below 60). Derived on 5.2 million individuals across 34 cohorts in 28 countries. Published in JAMA 2019 (Nelson et al., PMID 31703124).

Inputs: age, sex, eGFR, UACR, hypertension treatment, smoking, BMI, cardiovascular disease history, HbA1c (diabetic version).

Stage B — Established CKD (eGFR \<60 or UACR ≥30 mg/g)

Kidney Failure Risk Equation (KFRE), 8-variable. Predicts 2-year and 5-year probability of kidney failure. Validated in over 700,000 patients across 31 cohorts. C-statistic 0.90. Endorsed by KDIGO 2024 (Tangri et al., PMID 26757465).

Inputs: age, sex, eGFR, UACR, serum calcium, phosphate, bicarbonate, albumin.

Routing rule**:** Patients scored under Stage A who develop CKD on subsequent testing transition to Stage B automatically.

## ---

2\. Algorithmic Modifiers

Modifiers adjust the base model risk using patient-specific data that the base equation does not capture — degree of blood pressure control, genetic findings, wearable trends, medication exposures, and biomarker trajectories.

How modifiers combine**.** Modifiers are grouped into four mechanistic domains. Within each domain, correlated modifiers use partial-credit rules to prevent overcounting shared biology. Across domains, contributions are combined using a logistic (sigmoid) function:

Adjusted risk \= base risk transformed through log-odds, plus the sum of domain contributions, converted back to probability.

This ensures that even when multiple modifiers fire, the adjusted risk compresses toward 100% rather than exceeding it. At low base risk, the result is nearly identical to simple multiplication. At higher risk levels, it behaves more conservatively — which is appropriate.

Evidence grading**.** Each modifier carries a grade:

* Strong — RCT or large meta-analysis (\>100K patients), CKD-specific endpoint  
* Moderate — Large observational cohort, CKD-specific endpoint, some confounding concerns  
* Weak — Mechanistic extrapolation from non-CKD data, or high heterogeneity across studies

### ---

Domain A: Kidney-Specific Signals

These capture direct renal biomarker abnormalities not represented in the base model.

Important constraint**:** The base model eGFR must use the CKD-EPI 2021 creatinine-only equation. If cystatin C-based eGFR is fed into the base model, the discordance modifier would double-count.

2.1 — Cystatin C Discordance

What it measures: Whether creatinine-based eGFR is masking true kidney impairment. Cystatin C is not affected by muscle mass and detects early tubular damage that creatinine misses.

Inputs: Serum creatinine and Cystatin C (both in Quest Elite panel).

Discordance is calculated as the percentage difference between creatinine-based and cystatin C-based eGFR.

* 30% or greater discordance → risk multiplied by 1.5. Evidence: Strong (CKD-PC meta-analysis, 821K patients, PMID 41202182\)  
* 45% or greater → risk multiplied by 2.0. Evidence: Strong (same source)  
* Cystatin C eGFR more than 10% higher than creatinine eGFR → risk multiplied by 0.85 (protective). Evidence: Moderate (PMID 31700174, 40235956\)

2.2 — UACR Trajectory

What it measures: Whether albuminuria is rising, which is the strongest dynamic predictor of CKD progression independent of baseline values.

Inputs: Two or more UACR measurements at least 3 months apart.

* 50% or greater increase over 6–12 months, with second value at least 20 mg/g → risk multiplied by 1.4. Evidence: Strong (PMID 24938220, 20483451\)  
* Persistent UACR above 300 mg/g on two or more measurements → risk multiplied by 2.5. Evidence: Strong (KDIGO 2024\)  
* Declining 30% or more, with second value below 30 mg/g → risk multiplied by 0.8 (protective). Evidence: Moderate

Note: A minimum absolute floor of 20 mg/g prevents clinically irrelevant percentage changes (e.g., 3 to 5 mg/g) from triggering the modifier.

Domain A combination rule**:** The single most applicable cystatin C modifier and the single most applicable UACR modifier are multiplied together. These capture different renal axes (filtration versus barrier integrity), so their combination is defensible. Domain A cap: 3.0×.

### ---

Domain B: Hemodynamic and Metabolic

These capture blood pressure control, autonomic dysfunction, and glycemic or insulin resistance — the triad of systemic drivers of glomerular hyperfiltration.

2.3 — Blood Pressure Control

What it measures: Degree of blood pressure control, not just the presence or absence of hypertension (which the base model already captures as a binary variable).

Inputs: Wearable blood pressure trends (preferred) or intake-reported BP plus antihypertensive medication list.

* Uncontrolled (≥140/90 or more than 30% of wearable readings above 140 systolic) → 1.4×. Evidence: Strong (SPRINT, PMID 26551272\)  
* Controlled on medications, below 130/80 → 1.1×. Evidence: Strong  
* No hypertension, consistently below 120/80 → 0.9× (protective). Evidence: Strong

Clinical note: Wearable blood pressure captures ambulatory and nocturnal hypertension missed by clinic readings. A patient with normal office BP but 38% of home readings above 140 has undiagnosed hypertension.

2.4 — Resting Heart Rate and HRV (Autonomic Dysfunction)

What it measures: Sympathetic overdrive, which drives RAAS activation and glomerular hyperfiltration. This is a wearable-only signal not available in traditional care.

Inputs: 7-day average resting heart rate and HRV (RMSSD).

* RHR above 80 (isolated) → 1.08×. Evidence: Weak (extrapolated from CVD data, PMID not CKD-specific)  
* RHR above 90 → 1.15×. Evidence: Weak  
* Combined RHR above 80 plus RMSSD below 20 ms → 1.15×. Evidence: Weak

Note: These hazard ratios are conservative because no CKD-specific outcome data exists for wearable autonomic markers. The mechanistic argument is sound but the magnitudes are directional.

Hemodynamic sub-group rule**:** Because blood pressure and autonomic dysfunction share a sympathetic pathway, they do not multiply independently. The formula takes the larger modifier, then adds half of the excess from the smaller one. Example: uncontrolled BP (1.4) plus combined autonomic (1.15) yields 1.475× rather than 1.4 × 1.15 \= 1.61×.

2.5 — Glycemic Control and Insulin Resistance

What it measures: The degree of glycemic dysregulation beyond the binary diabetes flag in the base model.

Inputs: HbA1c, fasting glucose, fasting insulin (for HOMA-IR), BMI.

For diabetics: \- HbA1c above 9% → 1.5× (reduced to 1.25× when the CKD-PC diabetic equation is the base model, since it already weights HbA1c). Evidence: Strong (PMID 32970396, 36331190, 27188921\) \- HbA1c 7–9% → 1.2× (reduced to 1.1× with CKD-PC diabetic base). Evidence: Strong \- Currently on SGLT2 inhibitor → 0.7× (protective, stacks with glycemic modifier only). Evidence: Strong (DAPA-CKD, EMPA-KIDNEY)

For non-diabetics: \- Prediabetes (fasting glucose 100–125) plus BMI above 30 → 1.3×. Evidence: Moderate \- HOMA-IR above 3.0 → 1.2×. Evidence: Moderate

Note: HOMA-IR is calculated as fasting glucose × fasting insulin / 405\. This captures insulin resistance invisible to standard labs — a fasting glucose of 108 with insulin of 18 looks unremarkable individually but yields a HOMA-IR of 4.8.

Domain B combination rule**:** Hemodynamic sub-group result multiplied by metabolic modifier. Domain B cap: 2.5×.

### ---

Domain C: Exposure and Iatrogenic

These are directly actionable — identification drives deprescription.

2.6 — Nephrotoxin Exposure

Inputs: Medication and supplement history from intake.

* Chronic NSAIDs (4 or more days per week for 3 or more months) → 1.3×. Evidence: Moderate (KDIGO 2024, PMID 31573641\)  
* Lithium → 1.4×. Evidence: Moderate  
* Prior aminoglycoside or cisplatin exposure → 1.2×. Evidence: Moderate  
* Daily PPI for more than 1 year → 1.10×. Evidence: Weak (meta-analysis shows RR 1.68 but I² \= 99%, PMID 41737121). Residual confounding likely explains most of the signal.

Nephrotoxins act on different tubular targets, so they multiply within this domain. Domain C cap: 2.0×.

### ---

Domain D: Genetic and Familial

These capture heritable risk from monogenic variants and family history.

2.7 — Monogenic Kidney Disease (Invitae 163-Gene Panel)

Pathogenic variants in kidney disease genes create deterministic, not probabilistic, risk.

Inputs: Invitae panel results, specifically PKD1, PKD2, COL4A3/A4/A5, UMOD, HNF1B, MUC1, REN, APOL1.

* APOL1 high-risk genotype (two risk alleles) without known second hit (no HIV, SLE, or interferon exposure) → 2.0× plus nephrology referral. Evidence: Strong for association; penetrance uncertain without cofactors (PMID 30586318\)  
* APOL1 high-risk genotype with known second hit → 3.0× plus nephrology referral. Evidence: Strong  
* PKD1 or PKD2 pathogenic variant → overrides all domain modifiers. Sets probability to 0.95. This is a diagnosis, not a risk modifier. Triggers imaging plus nephrology referral. Evidence: Strong  
* Other monogenic pathogenic or likely pathogenic variant → 2.0× plus genetic counseling. Evidence: Moderate  
* Panel negative → no adjustment

2.8 — Family History of Kidney Disease

Inputs: First-degree relatives with CKD, ESKD, dialysis, or transplant.

* One or more first-degree relatives with ESKD or dialysis → 1.5×. Evidence: Moderate (PMID in appendix)  
* One or more with CKD (not ESKD) → 1.2×. Evidence: Moderate  
* Family history of ADPKD but genetic panel negative → 1.3×. Evidence: Moderate

Domain D combination rules:

1. PKD1 or PKD2 pathogenic → overrides everything. Output the 0.95 probability and surveillance protocol. No other modifiers apply.  
2. APOL1 high-risk genotype → use applicable HR. Family history does not additionally fire if the family history is consistent with the genetic finding (prevents double-counting).  
3. Family history modifiers only fire when the monogenic panel is negative or the family history is discordant with the genetic finding.

Domain D cap: 3.0× (excluding PKD override).

## ---

3\. Clinical Examples

### Patient A: "The Hidden Decliner"

48-year-old male. No prior diagnoses. Nonsmoker. BMI 27\. No medications.

Labs: eGFR (creatinine) 72, eGFR (cystatin C) 58, UACR 22 mg/g (was 15 six months ago), HbA1c 5.4%, fasting glucose 108, fasting insulin 18\.

Wearable: Resting HR 84, RMSSD 18 ms, 38% of blood pressure readings above 140 systolic.

Genetics: Invitae panel negative.

Family history: Father started dialysis at age 62\.

Routing**:** eGFR ≥60, UACR \<30 → Stage A (incident model). Base 5-year risk: approximately 4%.

Domain A (Kidney-Specific)**:** Cystatin C discordance is 19.4% — below the 30% threshold. UACR trajectory is \+47% — below the 50% threshold. Neither fires. Domain A: 1.0×. However, both are borderline and trigger a recheck protocol at 3 months.

Domain B (Hemodynamic/Metabolic)**:** Uncontrolled blood pressure (1.4×) plus combined autonomic dysfunction (1.15×) yields a hemodynamic sub-group of 1.475×. HOMA-IR of 4.8 yields metabolic modifier of 1.2×. Domain B: 1.77×.

Domain C (Exposure)**:** No nephrotoxins. Domain C: 1.0×.

Domain D (Genetic/Familial)**:** Panel negative. Father on dialysis. Domain D: 1.5×.

Adjusted 5-year risk: approximately 10**%** — more than twice the population baseline of 3–5%.

What traditional care says**:** "Labs look fine. See you next year."

What Meridian recommends**:** (1) Nephrology referral for comprehensive evaluation, (2) ambulatory blood pressure monitoring and likely RAAS blockade, (3) repeat UACR and cystatin C in 3 months to confirm trajectory, (4) address insulin resistance through lifestyle modification and consider metformin, (5) serial monitoring every 6 months.

The interventions are the same as they would be at 28% risk. The difference is that 10% is a credible and defensible number. A clinician seeing 28% for a 48-year-old with normal-range labs would question the model. 10% motivates the same clinical action without straining credibility.

### ---

Patient B: "The Genetic Timebomb"

39-year-old female. No prior diagnoses. Nonsmoker. BMI 23\. Takes daily ibuprofen for migraines.

Labs: eGFR (creatinine) 88, eGFR (cystatin C) 85, UACR 12 mg/g, HbA1c 5.1%, fasting glucose 92\.

Wearable: Resting HR 68, RMSSD 42 ms, blood pressure consistently 118/72.

Genetics: Invitae panel — pathogenic variant in PKD1.

Family history: Mother had "kidney problems" in her 50s.

Routing**:** eGFR ≥60, UACR \<30 → Stage A. Base 5-year risk: approximately 1.5%.

Domain D Override**:** PKD1 pathogenic variant detected. This overrides all domain modifiers. PKD is not a probability — it is an expected outcome. Adjusted probability: 0.95.

The nephrotoxin finding (daily NSAIDs) does not factor into the probability calculation but is still clinically critical. NSAIDs accelerate cyst growth and PKD progression and must be deprescribed immediately.

What traditional care says**:** "Perfectly healthy 39-year-old. Great labs."

What Meridian recommends**:** (1) Immediate nephrology referral to a PKD specialist, (2) kidney ultrasound for cyst burden and total kidney volume, (3) tolvaptan evaluation if kidney volume meets TEMPO criteria, (4) discontinue daily ibuprofen immediately and switch to non-nephrotoxic migraine management, (5) family screening for mother, siblings, and future children, (6) genetic counseling referral, (7) serial imaging and eGFR monitoring every 6–12 months, (8) blood pressure target below 110/75 per PKD-specific guidelines.

This patient's labs are perfect today. Without genetic screening, her diagnosis would likely come 10–15 years from now with eGFR in the 40s and established cystic disease.

## ---

Appendix: Reference Studies

### Base Model References

| Ref | Citation | PMID   |
| :---- | :---- | :---- |
| 16 | Nelson RG et al. "Development of risk prediction equations for incident chronic kidney disease." JAMA 2019;322(21):2104-2114. | 31703124 |
| 17 | Tangri N et al. "Multinational assessment of accuracy of equations for predicting risk of kidney failure." JAMA 2016;315(2):164-174. | 26757465 |

### Modifier Evidence References

| Ref | Citation | PMID | Used For   |
| :---- | :---- | :---- | :---- |
| 1 | Lees JS et al. "Glomerular filtration rate by differing measures, albuminuria and prediction of cardiovascular disease, mortality and end-stage kidney disease." Nature Medicine 2019\. | 31700174 | Cystatin C discordance (2.1) |
| 2 | Coresh J et al. "Decline in estimated glomerular filtration rate and subsequent risk of end-stage renal disease and mortality." JAMA 2014;311(24):2518-2531. | 24938220 | UACR trajectory (2.2) |
| 3 | Matsushita K et al. (CKD-PC). "Association of estimated glomerular filtration rate and albuminuria with all-cause and cardiovascular mortality." Lancet 2010;375(9731):2073-2081. | 20483451 | UACR trajectory (2.2) |
| 4 | Groopman EE et al. "Diagnostic utility of exome sequencing for kidney disease." NEJM 2019;380(2):142-151. | 30586318 | Monogenic panel (2.7), APOL1, family history logic (2.8) |
| 5 | SPRINT Research Group. "A randomized trial of intensive versus standard blood-pressure control." NEJM 2015;373(22):2103-2116. | 26551272 | Blood pressure control (2.3) |
| 6 | Tanner RM et al. "Resistant hypertension and risk of CKD." Hypertension 2013\. | — | Blood pressure control (2.3) |
| 7 | Heerspink HJL et al. "Dapagliflozin in patients with chronic kidney disease." NEJM 2020;383(15):1436-1446. | 32970396 | SGLT2i protective modifier (2.5) |
| 8 | EMPA-KIDNEY Collaborative Group. "Empagliflozin in patients with chronic kidney disease." NEJM 2023;388(2):117-127. | 36331190 | SGLT2i protective modifier (2.5) |
| 9 | Alicic RZ et al. "Diabetic kidney disease: challenges, progress, and possibilities." Nat Rev Dis Primers 2016\. | 27188921 | Glycemic control (2.5) |
| 10 | KDIGO 2024 Clinical Practice Guideline for CKD Evaluation and Management. | 31573641 | UACR trajectory (2.2), nephrotoxins (2.6) |
| 11 | Lazarus B et al. "Proton pump inhibitor use and risk of chronic kidney disease." JAMA Intern Med 2016;176(2):238-246. | 26752337 | PPI nephrotoxicity (2.6) |
| 12 | Piepoli MF et al. "2016 European Guidelines on cardiovascular disease prevention." European Heart Journal 2016;37(29):2315-2381. | 27222591 | HRV and autonomic dysfunction (2.4) |
| 13 | Baber U et al. "Association of resting heart rate and CKD." Am J Cardiol 2012\. | — | Resting heart rate (2.4) |
| 14 | Lei HH et al. "Familial aggregation of renal disease." JASN 1998\. | — | Family history (2.8) |
| 15 | O'Seaghdha CM et al. "Family history and CKD in the Framingham Heart Study." Am J Kidney Dis 2009\. | — | Family history (2.8) |
| 18 | Estrella MM et al. (CKD-PC). "Discordance in creatinine- and cystatin C-based eGFR and clinical outcomes." JAMA 2025\. | 41202182 | Cystatin C percentage thresholds (2.1) |
| 19 | Liu Q, Mark PB. "Discordance between cystatin C-based and creatinine-based eGFR and health outcomes." Clin Kidney J 2025\. | 40235956 | Cystatin C discordance (2.1) |
| 20 | "Proton pump inhibitors and risk of chronic kidney disease: a systematic review and meta-analysis." Cureus 2026\. | 41737121 | PPI evidence grade reduction (2.6) |

Data Schema Reference (Engineering Mapping) https://docs.google.com/spreadsheets/d/1FbnbUm6iBLwcaOZ0l7og5QAZTiVUfL-bR\_RIEFjNF5s/edit  
