> # ⚠ SUPERSEDED — historical record, do not build on this
>
> **Version** 1.0 · **Status** Superseded · **Updated** April 2026 · **Superseded by** [`models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md`](../../models/risk-models/cancer/sporadic-cancer-burden-calculator-v0.md)
>
> This is the cancer specification as it stood in April 2026, moved here from
> `Aleron-Web/docs/risk-engines/`. The current specification is
> **the sporadic cancer burden calculator v0**.
>
> It is kept because **the engines in `Aleron-Web` were built and documented against
> this version**, so it is the only way to read that code as intended. It is not the
> clinical authority. Reconciling the two is [AL-106](https://lasohealth.atlassian.net/browse/AL-106)'s
> explicit non-goal and needs a clinician.
>
> **Note the scope changed, it was not a straight version bump.** This document covers genetic, familial and exposure-driven risk translated into organ-specific screening protocols. The calculator that replaced it is a deterministic index of preventable cancer-risk pressure, and is itself a v0 draft pending clinical review and cohort calibration. Neither is a superset of the other.

Meridian Cancer Risk Model  
Version 1.0 | April 2026

Executive Summary  
This model identifies adults aged 35–60 who carry elevated cancer risk — genetic, familial, or exposure-driven — and translates that risk into organ-specific screening protocols with concrete timing, modality, and gap detection.

The model has three components:

1\. A three-gate triage engine that routes each patient to the correct screening intensity for each organ site, based on whether their risk is hereditary, familial, or population-level

2\. Organ-specific screening protocols drawn from current NCCN and USPSTF guidelines, with gene-to-protocol mappings for hereditary syndromes and family-history criteria for enhanced screening

3\. Gap detection that compares recommended screening against the patient's actual screening history and flags overdue or missing studies

Cancer is architecturally different from the other Meridian domain models. There is no single validated "cancer risk" equation analogous to PREVENT for cardiovascular disease or CKD-PC for kidney disease. Cancer is dozens of diseases with distinct etiologies, and the primary intervention lever is screening timing and modality — not a risk threshold that triggers medication. A single "cancer risk" number is clinically meaningless. This model produces a structured vector of organ-specific results, not a single adjusted probability.

The output of all three gates is uniform: organ-specific screening recommendations, risk-reducing interventions where applicable, and gap detection. The Action Layer does not need to know which gate produced a given result — it sees screening actions, interventions, and gaps. The gate designation is metadata for traceability, not routing logic.

## **1\. Architecture: Three-Gate Triage**

For each organ site, the model runs a sequential triage. A patient is evaluated independently per organ — one person can be Gate 1 for breast (BRCA2 carrier), Gate 2 for colorectal (father diagnosed at 52), and Gate 3 for everything else.

### **Gate 1 — Hereditary (5–10% of patients)**

The Invitae 163-gene panel result is checked for pathogenic or likely pathogenic variants in cancer predisposition genes. A positive finding routes the patient directly to the corresponding NCCN syndrome protocol. Gate 1 operates on four design principles:

**Deterministic.** P/LP variant found → output the NCCN protocol. No probabilistic scoring is involved.

**Syndrome-based, not gene-based.** Multiple genes map to the same syndrome (for example, MLH1, MSH2, MSH6, and PMS2 all map to Lynch syndrome). The protocol is per-syndrome, not per-gene.

**Penetrance-tiered.** Not all hereditary syndromes carry the same urgency. TP53 (Li-Fraumeni, approximately 90% lifetime cancer risk) demands a fundamentally different response than CHEK2 (approximately 20–25% breast cancer risk). The penetrance tier drives urgency classification.

**Multi-organ.** One gene often confers risk across multiple organ sites. BRCA2 triggers results for breast, ovarian, pancreatic, and prostate. Each organ gets its own result, but they share the same gate trigger.

Variants of uncertain significance do not trigger Gate 1\. A VUS with a concordant phenotype (strong family history, early-onset cancer) is flagged for genetic counseling re-referral and may trigger enhanced surveillance through Gate 2, but does not activate syndrome-level protocols.

### **Gate 2 — Familial (15–20% of patients)**

Patients who are panel-negative but have significant family history are evaluated against NCCN family history criteria for each organ site. Where criteria are met, screening is intensified — earlier start age, shorter intervals, or additional modalities.

For breast cancer specifically, the Tyrer-Cuzick (IBIS) model provides a quantitative lifetime risk estimate. This is the one organ where Gate 2 produces a number: lifetime risk of 20% or greater triggers the addition of annual breast MRI to mammography.

"Panel-negative, family-positive" is a distinct clinical state. These patients may harbor undetected variants — deep intronic, structural, or in genes not on the current panel — or may carry polygenic risk. The model recommends genetic counseling re-referral when the family pattern is strongly suggestive of a hereditary syndrome.

### **Gate 3 — Sporadic (70–80% of patients)**

Patients without hereditary or familial risk factors receive guideline-based screening per USPSTF and NCCN recommendations for average-risk adults. Meridian's primary value at this gate is gap detection — identifying patients who are overdue for recommended screening — and flagging exposure-based modifiers that may warrant clinical attention.

Gate 3 does not produce a cancer risk percentage. There is no validated, clinically useful total sporadic cancer risk score for the general population. Gate 3 does not override guideline-based screening ages based on lab values or wearable data — the evidence for biomarker-based reclassification in average-risk individuals is insufficient. Gate 3 does not recommend multi-cancer early detection (MCED) tests as standard — Galleri and similar cfDNA-based tests are promising but lack RCT evidence for mortality reduction (see Section 9, Future Data Points).

## **2\. Gate 1: Hereditary Gene-to-Protocol Mapping**

### **Penetrance Tiers**

Not all hereditary syndromes carry the same urgency. The model classifies findings into four penetrance tiers that drive the intensity of the clinical response:

| Tier | Lifetime Cancer Risk | Response Pattern | Examples |
| :---- | :---- | :---- | :---- |
| Ultra-high | \>70% for primary cancer | Risk-reducing surgery is standard of care. Surveillance bridges to surgery or covers organs where surgery is not an option. | TP53 (Li-Fraumeni), APC (FAP), BRCA1 ovarian, CDH1 gastric |
| High | 40–70% | Enhanced surveillance plus serious discussion of risk-reducing surgery or chemoprevention. | BRCA1/2 breast, Lynch MLH1/MSH2 colorectal |
| Moderate | 15–40% | Enhanced surveillance. Risk-reducing surgery generally not indicated. Chemoprevention in some cases. | ATM, CHEK2, PALB2 breast; Lynch MSH6/PMS2 |
| Modestly elevated | 5–15% above population | May warrant earlier or more frequent screening. Clinical significance debated for some genes. | CHEK2 colorectal, RAD51C/D breast |

### **Hereditary Breast and Ovarian Cancer (HBOC)**

| Gene | Penetrance Tier | Breast (F) | Ovarian | Prostate | Pancreatic | Other |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| BRCA1 | Ultra-high (ovarian), High (breast) | Annual mammogram \+ MRI from 25\. Discuss risk-reducing mastectomy. | Risk-reducing salpingo-oophorectomy recommended age 35–40. | PSA from 40\. | Consider EUS/MRCP if one or more first-degree relatives with pancreatic cancer. | — |
| BRCA2 | High (breast), High (ovarian) | Annual mammogram \+ MRI from 25\. Discuss risk-reducing mastectomy. | Risk-reducing salpingo-oophorectomy recommended age 40–45. | PSA from 40 (NCCN classifies BRCA2 as high-risk prostate). | EUS/MRCP from 50 or 10 years before youngest affected first-degree relative. | — |
| PALB2 | Moderate (breast) | Annual mammogram \+ MRI from 30\. | Insufficient data for risk-reducing surgery. | — | Consider if family history. | — |
| ATM | Moderate (breast) | Annual mammogram \+ MRI from 40\. | — | PSA from 40 (NCCN). | Consider EUS/MRCP from 50 if family history. | Radiation sensitivity — avoid unnecessary CT and radiation exposure. |
| CHEK2 | Moderate (breast), Modest (colorectal) | Annual mammogram \+ MRI from 40\. | — | — | — | Colonoscopy from 40\. |
| RAD51C | Moderate (ovarian) | Consider enhanced breast screening. | Discuss risk-reducing salpingo-oophorectomy age 45–50. | — | — | — |
| RAD51D | Moderate (ovarian) | Consider enhanced breast screening. | Discuss risk-reducing salpingo-oophorectomy age 45–50. | — | — | — |

### **Lynch Syndrome**

| Gene | Penetrance Tier | Colorectal | Endometrial (F) | Ovarian | Gastric | Urinary |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| MLH1 | High | Colonoscopy every 1–2 years from age 20–25. | Discuss hysterectomy after childbearing. Annual endometrial sampling from 30–35. | Discuss risk-reducing salpingo-oophorectomy. | Consider EGD every 2–3 years from 30–35. | Annual urinalysis from 30–35. |
| MSH2 | High | Same as MLH1. | Same as MLH1. | Discuss risk-reducing salpingo-oophorectomy. | Same as MLH1. | Same as MLH1. |
| MSH6 | Moderate | Colonoscopy every 1–2 years from age 25–30. | Same as MLH1 (endometrial risk may exceed colorectal risk for MSH6). | Lower risk than MLH1/MSH2. | Consider. | Consider. |
| PMS2 | Moderate | Colonoscopy every 1–2 years from age 30–35. | Discuss. | Lower risk. | — | — |
| EPCAM | High (if MSH2 silenced) | Same as MSH2. | Same as MSH2. | Same as MSH2. | Same as MSH2. | Same as MSH2. |

### **Polyposis Syndromes**

| Gene | Syndrome | Penetrance Tier | Protocol |
| :---- | :---- | :---- | :---- |
| APC | Familial Adenomatous Polyposis | Ultra-high (colorectal approaches 100%) | Colonoscopy from age 10–12, annual. Discuss colectomy in late teens or early 20s. EGD from 20–25. |
| MUTYH (biallelic) | MUTYH-Associated Polyposis | High | Colonoscopy from 25–30, every 1–2 years. EGD from 30–35. |
| STK11 | Peutz-Jeghers | High (multi-organ) | Colonoscopy from 18, every 2–3 years. EGD from 18\. Mammogram \+ MRI from 25\. Pancreas MRI/EUS from 30\. |
| SMAD4 | Juvenile Polyposis | High | Colonoscopy from 12–15, annual. EGD from 12–15. |
| BMPR1A | Juvenile Polyposis | High | Same as SMAD4. |

### **Li-Fraumeni Syndrome**

| Gene | Penetrance Tier | Protocol |
| :---- | :---- | :---- |
| TP53 | Ultra-high (approximately 90% lifetime cancer risk) | Annual whole-body MRI from age 20 or at diagnosis. Annual brain MRI. Annual dermatologic exam. Annual breast MRI from 20 (female). Colonoscopy from 25, every 2–5 years. Avoid radiation — no mammography (MRI only), minimize diagnostic CT. |

### **Other Cancer Predisposition Genes**

| Gene | Syndrome | Primary Cancers | Penetrance Tier | Key Protocol Elements |
| :---- | :---- | :---- | :---- | :---- |
| CDH1 | Hereditary Diffuse Gastric Cancer | Gastric (approximately 70%), lobular breast (approximately 42% in females) | Ultra-high (gastric) | Discuss prophylactic gastrectomy. Annual breast MRI from 30\. |
| PTEN | Cowden Syndrome | Breast, thyroid, endometrial | High | Annual mammogram \+ MRI from 30\. Annual thyroid ultrasound from 18\. Endometrial screening from 35\. |
| RET | MEN2 | Medullary thyroid, pheochromocytoma | Ultra-high (medullary thyroid) | Prophylactic thyroidectomy (timing by codon). Annual biochemical screening. |
| VHL | Von Hippel-Lindau | Renal, pheochromocytoma, CNS hemangioblastoma | High | Annual abdominal imaging from 15\. Annual metanephrines. Retinal exam annually. |
| RB1 | Retinoblastoma | Retinoblastoma, osteosarcoma, soft tissue sarcoma | High | Ophthalmologic surveillance. Awareness of second malignancy risk. |
| SDHA/B/C/D | Paraganglioma-Pheochromocytoma | Paraganglioma, pheochromocytoma, renal, GIST | Moderate-High | Annual biochemical screening plus imaging every 1–2 years from age 10–15. |
| BAP1 | BAP1 Tumor Predisposition | Mesothelioma, uveal melanoma, renal, cutaneous melanoma | Moderate | Annual dermatologic exam. Annual ophthalmologic exam. Consider abdominal imaging. |
| CDKN2A | Familial Melanoma/Pancreatic | Melanoma, pancreatic | High | Annual dermatologic exam from 10\. Consider EUS/MRCP from 40 for pancreatic surveillance. |

### **Implementation Notes**

**Compound heterozygosity.** Some genes have different implications when biallelic. MUTYH monoallelic confers modest risk; biallelic causes MAP syndrome with high colorectal cancer risk. The model checks zygosity before assigning a protocol.

**Radiation sensitivity genes.** ATM, TP53, BRCA1/2, and NBN carriers should minimize diagnostic radiation exposure. This affects imaging choices across all domains — prefer MRI and ultrasound over CT when clinically equivalent. This is a cross-cutting constraint enforced at the Action Layer.

**Cascade testing.** Every Gate 1 finding triggers a recommendation for first-degree relatives to undergo genetic testing. This is flagged in the model output for the Action Layer to surface.

## **3\. Gate 2: Familial — Modified Screening**

Patients who are panel-negative but have significant family history are evaluated against organ-specific criteria. Where criteria are met, screening is modified — typically starting earlier, repeating more frequently, or adding modalities.

### **Colorectal**

| Family History Pattern | Screening Modification | Source |
| :---- | :---- | :---- |
| One or more first-degree relatives with colorectal cancer before age 60 | Colonoscopy at 40 or 10 years before youngest relative's diagnosis, whichever is earlier. Repeat every 5 years. | NCCN CRC Screening v2.2025 |
| Two or more first-degree relatives with colorectal cancer at any age | Same as above. | NCCN |
| One or more first-degree relatives with advanced adenoma before age 60 | Colonoscopy at 40 or at time of relative's diagnosis. Repeat every 5 years. | NCCN |
| Family pattern suggestive of Lynch syndrome but panel negative | Colonoscopy every 1–2 years from 25 or 5 years before youngest diagnosis. Recommend genetic counseling re-referral for expanded panel or tumor testing. | NCCN |

### **Breast**

| Family History Pattern | Screening Modification | Source |
| :---- | :---- | :---- |
| One or more first-degree relatives with premenopausal breast cancer | Run Tyrer-Cuzick. If lifetime risk 20% or greater, add annual MRI to mammography starting 10 years before relative's diagnosis age (not before 25). | NCCN Breast Screening v1.2025 |
| Two or more first-degree relatives with breast cancer at any age | Run Tyrer-Cuzick. Same threshold. | NCCN |
| First-degree relative with bilateral breast cancer | Run Tyrer-Cuzick. Same threshold. | NCCN |
| Male first-degree relative with breast cancer | Strongly suggestive of BRCA. Recommend genetic counseling re-referral. Enhanced screening per Tyrer-Cuzick. | NCCN |

**Why Tyrer-Cuzick over Gail.** Tyrer-Cuzick incorporates second-degree family history and bilateral disease, which the Gail model does not. It is better calibrated for the family-history-positive population that reaches Gate 2\. Inputs include age, age at menarche, age at first live birth, menopausal status, family history with ages at diagnosis, prior breast biopsies (including atypical hyperplasia and LCIS), BMI, HRT use, and genetic testing results. Breast density, if available, further improves discrimination.

Clinical thresholds: lifetime risk of 20% or greater triggers the addition of annual breast MRI (ACS/NCCN). Lifetime risk of 15% or greater triggers a discussion of chemoprevention (tamoxifen, raloxifene, or aromatase inhibitor). Below 15%, standard screening applies.

### **Prostate**

| Family History Pattern | Screening Modification | Source |
| :---- | :---- | :---- |
| One or more first-degree relatives with prostate cancer before age 60 | PSA baseline at 40\. | NCCN Prostate Early Detection |
| Two or more first-degree relatives with prostate cancer at any age | PSA baseline at 40\. | NCCN |
| BRCA2 in family (patient not tested or negative) | PSA from 40, consider enhanced screening. | NCCN |

### **Pancreatic**

| Family History Pattern | Screening Modification | Source |
| :---- | :---- | :---- |
| Two or more first-degree relatives with pancreatic cancer | Consider EUS/MRCP from 50 or 10 years before youngest relative's diagnosis. | NCCN, CAPS consortium |
| One or more first-degree relatives plus Ashkenazi Jewish ancestry | Same — higher baseline risk. | NCCN |

### **Gastric**

| Family History Pattern | Screening Modification | Source |
| :---- | :---- | :---- |
| Two or more first-degree relatives with gastric cancer (one before age 50\) | EGD from 40 or 10 years before youngest relative's diagnosis. Consider H. pylori testing and eradication. | NCCN |

### **Ovarian**

No effective screening exists for ovarian cancer in the general population. CA-125 plus transvaginal ultrasound is not recommended for screening even in high-risk women without an identified genetic variant. For patients with strong family history but a negative panel, the model recommends genetic counseling re-referral. Risk-reducing surgery is discussed only when the family pattern is very strongly suggestive of a hereditary syndrome.

## **4\. Gate 3: Sporadic — Guideline-Based Screening**

### **Standard Screening Recommendations (Average Risk, Ages 35–60)**

| Organ | Guideline | Start Age | Modality | Interval | Source |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Colorectal | USPSTF 2021 | 45 | Colonoscopy (preferred) or stool-based (FIT annual, Cologuard every 3 years) | Colonoscopy every 10 years, FIT annual | USPSTF A recommendation |
| Breast (F) | USPSTF 2024 | 40 | Mammography | Biennial (USPSTF) or annual (NCCN/ACR) | USPSTF B recommendation |
| Cervical (F) | USPSTF 2018 | 21 (or 25 for HPV primary) | Pap \+ HPV co-test or HPV primary | Every 3 years (Pap) or every 5 years (co-test/HPV primary) | USPSTF A recommendation |
| Lung | USPSTF 2021 | 50 | Low-dose CT | Annual | Only if age 50–80, 20 or more pack-year history, currently smoking or quit within 15 years |
| Prostate (M) | AUA 2023 | 45–50 | PSA (shared decision) | Every 2–4 years based on baseline PSA | Shared decision-making; not universal |
| Skin | USPSTF | — | No universal screening recommended | — | Insufficient evidence for general population |

### **Exposure-Based Modifiers**

These modifiers can shift a patient from standard to enhanced screening or flag exposures for the Action Layer to address:

| Modifier | Threshold | Effect | Evidence |
| :---- | :---- | :---- | :---- |
| Smoking history (lung) | 20 or more pack-years, age 50 or older | Triggers low-dose CT screening eligibility. | Strong (USPSTF 2021, NLST, PMID 21714641\) |
| Obesity (colorectal) | BMI 30 or greater | Flag for Action Layer (lifestyle intervention). Does not change screening age — USPSTF already starts at 45 for all. | Moderate (HR approximately 1.3) |
| Obesity (breast, postmenopausal F) | BMI 30 or greater, postmenopausal | Flag for Action Layer. Consider running Tyrer-Cuzick even without family history. | Strong (HR approximately 1.2–1.4) |
| Alcohol (breast, F) | More than 1 drink per day | Flag for Action Layer (risk counseling). | Strong (approximately 7–10% increased risk per drink per day) |
| Alcohol (colorectal) | More than 2 drinks per day | Flag for Action Layer. | Moderate (HR approximately 1.2–1.5) |
| H. pylori (gastric) | Positive serology or breath test | Eradication therapy. Consider EGD if additional risk factors. | Strong (WHO class I carcinogen) |
| Hepatitis B/C (liver) | HBsAg positive or HCV Ab positive | HCC surveillance: abdominal ultrasound plus AFP every 6 months. | Strong (AASLD guidelines) |
| NAFLD/cirrhosis (liver) | FIB-4 greater than 2.67 or known cirrhosis | HCC surveillance: abdominal ultrasound plus AFP every 6 months. | Strong (AASLD guidelines) |
| HPV (cervical, F) | High-risk HPV positive | Shortened screening interval per ASCCP guidelines. | Strong |
| Inflammatory markers | Persistent hsCRP greater than 3.0 plus other metabolic risk factors | Flag for Action Layer — chronic inflammation as a cancer promoter. Does not change screening recommendations. | Weak-Moderate (epidemiologic association, no screening reclassification evidence) |

## **5\. Priority Organ Sites**

Ranked by preventable mortality impact multiplied by Meridian's marginal value-add for the 35–60 age cohort:

| Rank | Organ | Gate 1 Value | Gate 2 Value | Gate 3 Value | Why High Priority |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Colorectal | High (Lynch, APC, MUTYH) | High (family history criteria well-defined) | High (gap detection — many skip colonoscopy) | Screening reduces mortality approximately 18% ITT, 31% per-protocol (NordICC, PMID 36214590). Lynch prevalence approximately 1 in 300\. |
| 2 | Breast (F) | Very high (BRCA1/2, PALB2, ATM, CHEK2) | Very high (Tyrer-Cuzick) | Moderate (standard screening) | Most common cancer in women. Moderate-penetrance genes highly actionable. Tyrer-Cuzick enables quantitative risk stratification. |
| 3 | Prostate (M) | High (ATM, BRCA2) | Moderate (family history criteria) | Moderate (shared decision PSA) | Genotype-driven screening timing is high-value (ATM, BRCA2, HOXB13). |
| 4 | Pancreatic | High (BRCA2, PALB2, ATM, CDKN2A, STK11, Lynch) | Moderate (two or more first-degree relatives) | Low (no general screening) | Lethal (5-year survival approximately 12%). Genetic and familial surveillance protocols exist for the 2–5% who qualify. |
| 5 | Lung | Low (rare hereditary lung cancer) | Low | Moderate (smoking history triggers LDCT eligibility) | Leading cancer killer, but Meridian's population is mostly non-smokers. Value is in catching those who have not been screened. |
| 6 | Ovarian (F) | Very high (BRCA1/2, RAD51C/D, Lynch) | Low (no screening to modify) | None | No effective screening even in high-risk women. Value is entirely in Gate 1 — directing carriers to risk-reducing salpingo-oophorectomy. |
| 7 | Liver | Low (rare hereditary) | Low | Moderate (HBV/HCV/cirrhosis triggers surveillance) | Rising incidence (NAFLD/MASH epidemic). HCC surveillance in at-risk populations is effective. |
| 8 | Gastric | High (CDH1 — prophylactic gastrectomy) | Moderate (family history plus H. pylori) | Low | Low US incidence but CDH1 carriers have approximately 70% lifetime risk. |
| 9 | Skin/Melanoma | Moderate (CDKN2A, BAP1) | Low | Low | CDKN2A and BAP1 carriers have actionable surveillance. General population screening not recommended. |

## **6\. Clinical Examples**

### **Patient C: "The ATM Carrier"**

47-year-old male. No prior cancer diagnoses. Non-smoker. BMI 26\. No significant family history of cancer.

Genetics: Invitae panel — pathogenic variant in ATM (c.8395\_8404del, p.Phe2799Lysfs\*4).

**Gate 1 findings:**

**Prostate:** ATM pathogenic variant triggers enhanced screening. PSA from age 40 per NCCN. This patient is 47 and has no PSA on record — flagged as overdue.

**Breast:** Not applicable (male).

**Pancreatic:** ATM confers moderately elevated pancreatic cancer risk. Consider EUS/MRCP from 50 if family history is present. No family history here, so this is noted but does not trigger immediate surveillance.

**Cross-domain constraint:** ATM carriers have impaired DNA double-strand break repair. Radiation sensitivity flag is set — avoid unnecessary CT scans and diagnostic radiation across all Meridian domains. Prefer MRI and ultrasound when clinically equivalent. This specifically constrains the CVD domain's ability to recommend coronary artery calcium scoring (CT-based).

**Cascade testing:** Recommended for first-degree relatives.

**Gate 2 and Gate 3:** No significant family history modifies screening for other organs. Standard guideline-based screening applies — colonoscopy from 45 (none on record, flagged as overdue at 47).

What traditional care says: "Healthy 47-year-old. No family history. See you next year."

What Meridian recommends: (1) PSA immediately — 7 years overdue per ATM-specific guidelines, (2) colonoscopy — 2 years overdue per standard guidelines, (3) radiation sensitivity flag across all imaging decisions, (4) pancreatic surveillance discussion at age 50, (5) cascade testing for siblings and children.

### **Patient D: "The Family History Pattern"**

42-year-old female. No prior cancer diagnoses. Non-smoker. BMI 24\. Mother diagnosed with breast cancer at 48\. Maternal aunt diagnosed with ovarian cancer at 55\. Father diagnosed with colorectal cancer at 58\.

Genetics: Invitae panel — no pathogenic or likely pathogenic variants detected.

**Gate 1:** Panel negative. No syndrome protocols triggered.

**Gate 2 findings:**

**Breast:** Mother with premenopausal breast cancer plus maternal aunt with ovarian cancer. Run Tyrer-Cuzick. With this family history pattern, lifetime breast cancer risk is likely to exceed 20%. If confirmed, add annual breast MRI to mammography starting at age 38 (10 years before mother's diagnosis). Genetic counseling re-referral recommended — the family pattern (breast plus ovarian, same lineage) is strongly suggestive of BRCA despite a negative panel. Consider expanded testing or tumor testing on affected relatives.

**Colorectal:** Father with colorectal cancer at 58 (first-degree relative before age 60). Colonoscopy at 40 or 10 years before father's diagnosis (age 48), whichever is earlier. This patient should have started colonoscopy at age 40 — flagged as 2 years overdue.

**Gate 3:** Standard cervical screening applies. Lung screening not indicated (non-smoker).

What traditional care says: "You're 42, no personal history. We'll start mammograms soon."

What Meridian recommends: (1) Immediate colonoscopy — 2 years overdue based on family history criteria, (2) Tyrer-Cuzick risk assessment and likely addition of annual breast MRI, (3) genetic counseling re-referral for expanded testing given the breast-ovarian pattern, (4) standard cervical screening per guidelines.

## **7\. Limitations**

**This is not a risk score model.** The Cancer domain does not produce a single probability. It produces a structured set of organ-specific screening recommendations with gap detection. This is architecturally different from CKD and CVD, and intentionally so.

**NCCN guidelines update frequently.** The gene-protocol mapping (Gate 1\) and family history criteria (Gate 2\) must be versioned and updated at least annually. The model references specific guideline versions.

**Penetrance estimates are population-level.** Individual penetrance varies by modifier genes, environment, and ancestry. The penetrance tiers are for urgency classification, not individual risk counseling.

**VUS are explicitly excluded from Gate 1\.** This is conservative but correct for a screening platform. VUS reclassification rates vary by gene and laboratory. The model flags VUS for periodic re-query against ClinVar and laboratory updates.

**Overdiagnosis is a real harm.** Especially for prostate (PSA) and thyroid screening. Screening recommendations are presented with shared decision-making context, not as mandates.

**Ancestry matters.** Ashkenazi Jewish ancestry increases baseline risk for BRCA1/2 founder mutations, Lynch syndrome, and several other hereditary cancers. The model captures ancestry in the history intake and adjusts Gate 2 thresholds accordingly.

**The model cannot detect somatic mutations.** The Invitae panel tests germline DNA only. Somatic driver mutations — the actual cause of most cancers — are not detectable until a tumor exists. This is a fundamental limitation of any germline-based risk model.

## **8\. Cross-Domain Interactions**

**Cancer and CVD.** Radiation sensitivity genes (ATM, TP53, BRCA1/2) constrain the CVD domain's ability to recommend CT-based diagnostics such as coronary artery calcium scoring and CT angiography. The Action Layer enforces this cross-domain constraint. Statin therapy, when recommended for CVD, carries observational evidence of approximately 20% colorectal cancer risk reduction — noted as a cross-domain benefit but not formally scored. If a patient is diagnosed with cancer, chemotherapy and radiation cardiotoxicity become CVD concerns — the Action Layer should flag this when cancer treatment history is present. If future CHIP testing is added, positive results feed both the Cancer domain (hematologic malignancy risk) and the CVD domain (inflammatory atherosclerosis risk).

**Cancer and CKD.** Prior nephrotoxic chemotherapy (cisplatin, methotrexate) feeds the CKD model's exposure domain. APOL1 high-risk genotype may interact with interferon-based cancer therapies — flagged as a cross-domain consideration.

**Cancer and Longevity.** Growth-promoting interventions (growth hormone secretagogues, stem cells, exosomes) are contraindicated or require caution in hereditary cancer carriers. The Action Layer enforces this constraint. Conversely, caloric restriction and mTOR inhibition carry preclinical evidence of cancer risk reduction — noted as cross-domain benefits. Note: in ATM carriers specifically, mTOR inhibition may have complex interactions because ATM is upstream of mTOR signaling. This warrants caution rather than a blanket recommendation.

## **9\. Future Data Points**

### **Near-Term (Tier 1\)**

**Breast density.** The strongest non-genetic breast cancer risk factor. Dense breasts confer approximately 4-fold risk versus fatty tissue. Required input for optimal Tyrer-Cuzick performance. Many states now mandate reporting. Would enhance Gate 2 discrimination.

**Polygenic risk scores.** Breast cancer PRS is the most mature (313-SNP, Mavaddat 2019). Top 1% confers approximately 4-fold risk. Combined PRS plus Tyrer-Cuzick improves discrimination (PMID 36646003). Colorectal and prostate PRS are emerging but less validated. Allelica AbsoluteDx includes breast cancer PRS.

### **Longer-Term (Tier 2\)**

**Multi-cancer early detection (MCED).** cfDNA methylation-based tests (Galleri) detect 50+ cancer types. Sensitivity varies by stage (17% stage I, 77% stage IV) and cancer type. Specificity approximately 99.5%. Highest value for cancers with no standard screening — pancreatic, ovarian, gastric. No RCT mortality data yet (NHS-Galleri trial ongoing). Adjunct to organ-specific screening, not a replacement.

**Clonal hematopoiesis (CHIP).** Approximately 10% prevalence at age 50\. Confers approximately 10-fold risk of hematologic malignancy and approximately 1.5–2-fold ASCVD risk (cross-domain with CVD). Requires deep sequencing not on the Invitae panel.

**Tumor markers panel (CA-125, CEA, AFP, CA 19-9).** These have low sensitivity and specificity for screening in asymptomatic individuals and high false-positive rates. Not recommended for general screening. AFP is used only in the context of specific high-risk protocols (HCC surveillance). CA-125 is not recommended even in BRCA carriers for ovarian cancer screening.

**Whole-body MRI.** Emerging as a screening tool for Li-Fraumeni syndrome (TP53 carriers) and potentially other ultra-high-risk syndromes. Scoped to Gate 1 only — not for the general population.

## **Appendix: Reference Studies**

| Ref | Citation | PMID |
| :---- | :---- | :---- |
| 1 | Tomasetti C, Vogelstein B. "Variation in cancer risk among tissues can be explained by the number of stem cell divisions." Science 2015\. | 25554788 |
| 2 | NordICC. "Effect of Colonoscopy Screening on Risks of Colorectal Cancer and Related Death." NEJM 2022\. | 36214590 |
| 3 | Breast cancer PRS review. "Polygenic risk scores and breast cancer risk prediction." Breast 2023\. | 36646003 |
| 4 | RRSO in BRCA carriers meta-analysis. Cancers 2023\. | 36900415 |
| 5 | Lynch syndrome review. Cancers 2025\. | 41463230 |
| 6 | Incomplete penetrance and variable expressivity. Front Genet 2022\. | 35983412 |
| 7 | ACMG SF v2.0 cancer gene prevalence. Genome Med 2019\. | 30583724 |
| 8 | NCCN Genetic/Familial High-Risk Assessment: Breast, Ovarian, and Pancreatic v2.2026. | — |
| 9 | NCCN Genetic/Familial High-Risk Assessment: Colorectal v1.2026. | — |
| 10 | USPSTF Colorectal Cancer Screening 2021\. | — |
| 11 | USPSTF Breast Cancer Screening 2024\. | — |
| 12 | USPSTF Lung Cancer Screening 2021\. | — |
| 13 | NLST Research Team. "Reduced lung-cancer mortality with low-dose computed tomographic screening." NEJM 2011\. | 21714641 |

Data Schema Reference (Engineering Mapping): [https://docs.google.com/spreadsheets/d/1FbnbUm6iBLwcaOZ0l7og5QAZTiVUfL-bR\_RIEFjNF5s/edit](https://docs.google.com/spreadsheets/d/1FbnbUm6iBLwcaOZ0l7og5QAZTiVUfL-bR_RIEFjNF5s/edit)