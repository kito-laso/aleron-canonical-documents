// Generated from data/qa/risk_arr_v1_production_ready_census.v1.json
// Census sha256: 78c91ddc2e2fb4ab9822f0ee4dca53fbf60c9d22f2a15f72f7fc5aff31efe3d9
// Matrix confidence is the V1 display layer (ruled 2026-07-22).
// Native effects are population-level; clinical use of patient-specific ARR is prohibited
// until baseline risk emits. Regenerate via the census, do not hand-edit values.

export const RISK_DOMAINS = [
  {
    "id": "cardiovascular",
    "modelId": "prevent_base_representative",
    "runtimeIds": ["prevent_base_representative", "cvd"],
    "title": "Cardiovascular",
    "ready": 9,
    "total": 12,
    "modelHead": "Baseline model",
    "modelRows": [
      [
        "Base equation",
        "AHA PREVENT (spec v3.0)"
      ],
      [
        "Baseline risk",
        "Not emitted"
      ]
    ],
    "lanes": [
      {
        "label": "ASCVD events",
        "blurb": "Five production-ready actions. HR and RR are transformed to relative benefit for display within this lane.",
        "actions": [
          {
            "key": "A4",
            "slug": "ascvd_pcsk9_inhibitor",
            "name": "PCSK9 inhibitor class",
            "measure": "RR",
            "estimate": 0.49,
            "lower": 0.34,
            "upper": 0.71,
            "confidence": "LOW",
            "contrast": "observed pooled PCSK9-inhibitor trial risk ratio versus trial controls in the class source"
          },
          {
            "key": "A3",
            "slug": "ascvd_mediterranean_diet",
            "name": "Mediterranean diet",
            "measure": "HR",
            "estimate": 0.69,
            "lower": 0.53,
            "upper": 0.91,
            "confidence": "LOW",
            "contrast": "Mediterranean diet plus extra-virgin olive oil versus reduced-fat advice"
          },
          {
            "key": "A2",
            "slug": "ascvd_ezetimibe",
            "name": "Nonstatin LDL class",
            "measure": "RR",
            "estimate": 0.75,
            "lower": 0.66,
            "upper": 0.86,
            "confidence": "LOW",
            "contrast": "per 1 mmol/L LDL-C reduction for the pooled established-nonstatin mechanism class, not an ezetimibe-only estimate"
          },
          {
            "key": "A5",
            "slug": "ascvd_statin_high_intensity",
            "name": "Statin LDL-C lowering",
            "measure": "RR",
            "estimate": 0.78,
            "lower": 0.76,
            "upper": 0.8,
            "confidence": "LOW",
            "contrast": "per 1.0 mmol/L LDL-C reduction across both trial types"
          },
          {
            "key": "A1",
            "slug": "ascvd_bp_lowering",
            "name": "BP combination",
            "measure": "HR",
            "estimate": 0.93,
            "lower": 0.79,
            "upper": 1.1,
            "confidence": "LOW",
            "contrast": "candesartan 16 mg plus hydrochlorothiazide 12.5 mg once daily versus matching placebo once daily for the first coprimary outcome"
          }
        ]
      },
      {
        "label": "HF hospitalization or CV death",
        "blurb": "Four production-ready actions. All values are population-level hazard ratios from source records.",
        "actions": [
          {
            "key": "H3",
            "slug": "hf_mra",
            "name": "Eplerenone",
            "measure": "HR",
            "estimate": 0.63,
            "lower": 0.54,
            "upper": 0.74,
            "confidence": "MODERATE",
            "contrast": "eplerenone versus placebo on recommended therapy"
          },
          {
            "key": "H2",
            "slug": "hf-betablocker",
            "name": "Bisoprolol",
            "measure": "HR",
            "estimate": 0.66,
            "lower": 0.54,
            "upper": 0.81,
            "confidence": "MODERATE",
            "contrast": "bisoprolol versus placebo on standard therapy"
          },
          {
            "key": "H4",
            "slug": "hf_sglt2i",
            "name": "Dapagliflozin",
            "measure": "HR",
            "estimate": 0.74,
            "lower": 0.65,
            "upper": 0.85,
            "confidence": "MODERATE",
            "contrast": "dapagliflozin 10 mg once daily versus placebo on recommended therapy"
          },
          {
            "key": "H1",
            "slug": "hf_arni",
            "name": "Sacubitril / valsartan",
            "measure": "HR",
            "estimate": 0.8,
            "lower": 0.73,
            "upper": 0.87,
            "confidence": "MODERATE",
            "contrast": "LCZ696 200 mg twice daily versus enalapril 10 mg twice daily"
          }
        ]
      }
    ],
    "tray": []
  },
  {
    "id": "metabolic",
    "modelId": "metabolic_qdiabetes_representative",
    "runtimeIds": ["metabolic_qdiabetes_representative", "metabolic"],
    "title": "Metabolic",
    "ready": 11,
    "total": 12,
    "modelHead": "Baseline risk",
    "modelRows": [
      [
        "Model",
        "QDiabetes-2018 (spec v3.0)"
      ],
      [
        "State",
        "Not emitted"
      ],
      [
        "Role",
        "Baseline risk multiplies native RRR to absolute risk reduction; not yet available"
      ]
    ],
    "lanes": [
      {
        "label": "Incident type 2 diabetes",
        "blurb": "Seven production-ready actions. RRR records are already percent reductions; HR records are transformed to relative benefit.",
        "actions": [
          {
            "key": "M1",
            "slug": "tirzepatide_obesity_prediabetes_t2dm_prevention",
            "name": "Tirzepatide (prediabetes + obesity)",
            "measure": "HR",
            "estimate": 0.07,
            "lower": 0.0,
            "upper": 0.1,
            "confidence": "MODERATE",
            "contrast": "pooled tirzepatide assigned-dose groups versus placebo for type 2 diabetes diagnosis during 176 weeks"
          },
          {
            "key": "M2",
            "slug": "liraglutide_3mg_diabetes_prevention",
            "name": "Liraglutide 3 mg",
            "measure": "HR",
            "estimate": 0.21,
            "lower": 0.13,
            "upper": 0.34,
            "confidence": "MODERATE",
            "contrast": "liraglutide 3.0 mg versus matched placebo for onset of type 2 diabetes"
          },
          {
            "key": "M3",
            "slug": "pioglitazone_igt_prevention",
            "name": "Pioglitazone (IGT)",
            "measure": "HR",
            "estimate": 0.28,
            "lower": 0.16,
            "upper": 0.49,
            "confidence": "LOW",
            "contrast": "pioglitazone versus placebo for conversion to type 2 diabetes"
          },
          {
            "key": "M4",
            "slug": "dpp_lifestyle",
            "name": "DPP lifestyle program",
            "measure": "RRR",
            "estimate": 58.0,
            "lower": 48.0,
            "upper": 66.0,
            "confidence": "MODERATE",
            "contrast": "intensive lifestyle intervention versus placebo for diabetes incidence"
          },
          {
            "key": "M5",
            "slug": "orlistat_t2dm_prevention",
            "name": "Orlistat",
            "measure": "HR",
            "estimate": 0.627,
            "lower": 0.455,
            "upper": 0.863,
            "confidence": "MODERATE",
            "contrast": "orlistat 120 mg orally three times daily plus lifestyle intervention versus matching placebo three times daily plus the same lifestyle intervention for time to first onset of type 2 diabetes"
          },
          {
            "key": "M6",
            "slug": "metformin_prevention",
            "name": "Metformin",
            "measure": "RRR",
            "estimate": 31.0,
            "lower": 17.0,
            "upper": 43.0,
            "confidence": "MODERATE",
            "contrast": "metformin versus placebo for diabetes incidence"
          },
          {
            "key": "M7",
            "slug": "acarbose_t2dm_prevention",
            "name": "Acarbose",
            "measure": "HR",
            "estimate": 0.75,
            "lower": 0.63,
            "upper": 0.9,
            "confidence": "MODERATE",
            "contrast": "acarbose versus placebo for development of type 2 diabetes"
          }
        ]
      },
      {
        "label": "Stage-3 type 1 diabetes",
        "blurb": "One production-ready action. Delay of stage-3 diagnosis in at-risk individuals.",
        "actions": [
          {
            "key": "M8",
            "slug": "teplizumab_t1d_delay",
            "name": "Teplizumab",
            "measure": "HR",
            "estimate": 0.41,
            "lower": 0.22,
            "upper": 0.78,
            "confidence": "LOW",
            "contrast": "teplizumab versus placebo for clinical type 1 diabetes diagnosis"
          }
        ]
      },
      {
        "label": "Serious perinatal composite",
        "blurb": "One production-ready action. Treatment of gestational diabetes versus no treatment.",
        "actions": [
          {
            "key": "M9",
            "slug": "gdm_treatment_perinatal",
            "name": "GDM treatment",
            "measure": "ADJUSTED_RR",
            "estimate": 0.33,
            "lower": 0.14,
            "upper": 0.75,
            "confidence": "MODERATE",
            "contrast": "gestational-diabetes treatment versus routine antenatal care for serious perinatal complications"
          }
        ]
      },
      {
        "label": "All-cause mortality",
        "blurb": "One production-ready action. Multifactorial intensive therapy in established T2DM.",
        "actions": [
          {
            "key": "M10",
            "slug": "multifactorial_intensive_t2dm",
            "name": "Multifactorial intensive therapy",
            "measure": "HR",
            "estimate": 0.55,
            "lower": 0.36,
            "upper": 0.83,
            "confidence": "LOW",
            "contrast": "original intensive-therapy assignment versus original conventional-therapy assignment for all-cause mortality"
          }
        ]
      }
    ],
    "tray": [
      [
        "Weight remission program (DiRECT) · OR 19.7 [7.8, 49.8]",
        "Positive-outcome odds ratio. Shown here rather than rescaled onto the benefit axis.",
        "LOW"
      ],
      [
        "Semaglutide 2.4 mg weight management",
        "Not production ready (continuous endpoint, non-ARR)."
      ]
    ]
  },
  {
    "id": "kidney",
    "modelId": "kidney_ckd_representative",
    "runtimeIds": ["kidney_ckd_representative", "kidney", "renal", "ckd"],
    "title": "Kidney",
    "ready": 5,
    "total": 6,
    "modelHead": "Baseline risk",
    "modelRows": [
      [
        "Model",
        "CKD-PC incident-CKD / KFRE two-stage (spec v4.0)"
      ],
      [
        "State",
        "Not emitted"
      ],
      [
        "Role",
        "Baseline risk multiplies native RRR to absolute risk reduction; not yet available"
      ]
    ],
    "lanes": [
      {
        "label": "Kidney disease progression",
        "blurb": "Two production-ready actions. First kidney-progression event.",
        "actions": [
          {
            "key": "K1",
            "slug": "act_sglt2i_ckd",
            "name": "SGLT2 inhibitor (CKD)",
            "measure": "RR",
            "estimate": 0.63,
            "lower": 0.58,
            "upper": 0.69,
            "confidence": "MODERATE",
            "contrast": "SGLT2 inhibitor class versus placebo for harmonized kidney disease progression"
          },
          {
            "key": "K2",
            "slug": "act_finerenone",
            "name": "Finerenone",
            "measure": "HR",
            "estimate": 0.77,
            "lower": 0.67,
            "upper": 0.88,
            "confidence": "MODERATE",
            "contrast": "finerenone versus placebo for the composite kidney outcome"
          }
        ]
      },
      {
        "label": "Kidney or CV death composite",
        "blurb": "One production-ready action. Mixed kidney and cardiovascular death endpoint.",
        "actions": [
          {
            "key": "K3",
            "slug": "act_glp1_ckd",
            "name": "GLP-1 receptor agonist (CKD)",
            "measure": "HR",
            "estimate": 0.76,
            "lower": 0.66,
            "upper": 0.88,
            "confidence": "MODERATE",
            "contrast": "semaglutide versus placebo for the primary major-kidney-disease-event composite"
          }
        ]
      },
      {
        "label": "ASCVD events in CKD",
        "blurb": "One production-ready action. SHARP population.",
        "actions": [
          {
            "key": "K4",
            "slug": "act_statin_ezetimibe_ckd",
            "name": "Statin + ezetimibe (SHARP)",
            "measure": "RR",
            "estimate": 0.83,
            "lower": 0.74,
            "upper": 0.94,
            "confidence": "LOW",
            "contrast": "simvastatin 20 mg plus ezetimibe 10 mg daily versus placebo for first major atherosclerotic event"
          }
        ]
      },
      {
        "label": "All-cause mortality",
        "blurb": "One production-ready action. Antihypertensive therapy in CKD.",
        "actions": [
          {
            "key": "K5",
            "slug": "antihypertensive_rx",
            "name": "Antihypertensive therapy",
            "measure": "HR",
            "estimate": 0.72,
            "lower": 0.53,
            "upper": 0.99,
            "confidence": "MODERATE",
            "contrast": "protocol-directed systolic-BP target below 120 mm Hg versus protocol-directed target below 140 mm Hg for all-cause mortality in participants with baseline CKD"
          }
        ]
      }
    ],
    "tray": [
      [
        "Metabolic surgery",
        "Not production ready (packet incomplete)."
      ]
    ]
  },
  {
    "id": "neurologic",
    "modelId": "neuro_cogdrisk_representative",
    "runtimeIds": ["neuro_cogdrisk_representative", "neurologic", "neuro"],
    "title": "Neurologic",
    "ready": 6,
    "total": 15,
    "modelHead": "Baseline risk",
    "modelRows": [
      [
        "Model",
        "CogDrisk-ML (spec v4.0)"
      ],
      [
        "Output",
        "Directional stratification score"
      ],
      [
        "Note",
        "No fixed-horizon probability by design; absolute risk not emitted"
      ]
    ],
    "lanes": [
      {
        "label": "Stroke and ASCVD events",
        "blurb": "Five production-ready actions. Secondary stroke prevention and first-stroke reduction.",
        "actions": [
          {
            "key": "N1",
            "slug": "act_cea_symptomatic_severe_stenosis",
            "name": "Carotid endarterectomy",
            "measure": "RR",
            "estimate": 0.47,
            "lower": 0.25,
            "upper": 0.88,
            "confidence": "LOW",
            "contrast": "carotid endarterectomy plus historical medical therapy versus historical medical therapy alone for ipsilateral ischemic stroke or operative stroke/death"
          },
          {
            "key": "N2",
            "slug": "act_chance_short_course_dapt",
            "name": "Short-course DAPT (CHANCE)",
            "measure": "HR",
            "estimate": 0.68,
            "lower": 0.57,
            "upper": 0.81,
            "confidence": "LOW",
            "contrast": "CHANCE clopidogrel-plus-aspirin strategy versus aspirin alone for stroke by 90 days"
          },
          {
            "key": "N3",
            "slug": "act_progress_bp_strategy_recurrent_stroke",
            "name": "BP strategy (PROGRESS)",
            "measure": "RRR",
            "estimate": 28.0,
            "lower": 17.0,
            "upper": 38.0,
            "confidence": "LOW",
            "contrast": "PROGRESS flexible perindopril-based regimen versus matching placebo regimen for total recurrent stroke"
          },
          {
            "key": "N4",
            "slug": "act_enalapril_folic_acid_first_stroke",
            "name": "Enalapril + folic acid",
            "measure": "HR",
            "estimate": 0.79,
            "lower": 0.68,
            "upper": 0.93,
            "confidence": "LOW",
            "contrast": "enalapril 10 mg plus folic acid 0.8 mg versus enalapril 10 mg alone for first stroke"
          },
          {
            "key": "N5",
            "slug": "act_atorvastatin_80mg_post_stroke",
            "name": "Atorvastatin 80 mg (SPARCL)",
            "measure": "HR",
            "estimate": 0.84,
            "lower": 0.71,
            "upper": 0.99,
            "confidence": "LOW",
            "contrast": "atorvastatin 80 mg daily versus placebo for first fatal or nonfatal stroke"
          }
        ]
      },
      {
        "label": "Dementia incidence",
        "blurb": "One production-ready action. Cognitive speed training (ACTIVE).",
        "actions": [
          {
            "key": "N6",
            "slug": "act_cognitive_speed_training",
            "name": "Cognitive speed training",
            "measure": "HR",
            "estimate": 0.71,
            "lower": 0.5,
            "upper": 0.998,
            "confidence": "MODERATE",
            "contrast": "speed-of-processing training versus no-contact control for incident all-cause dementia"
          }
        ]
      }
    ],
    "tray": [
      [
        "BP control for dementia prevention",
        "Not production ready (packet incomplete)"
      ],
      [
        "Cataract surgery",
        "Not production ready (association only)"
      ],
      [
        "Hearing intervention (ACHIEVE)",
        "Not production ready (source native non arr)"
      ],
      [
        "Marine omega-3",
        "Not production ready (source native non arr)"
      ],
      [
        "MIND diet",
        "Not production ready (source native non arr)"
      ],
      [
        "Multidomain intervention (FINGER)",
        "Not production ready (packet incomplete)"
      ],
      [
        "Physical activity",
        "Not production ready (association only)"
      ],
      [
        "Vitamin D3",
        "Not production ready (source native non arr)"
      ],
      [
        "Zoster vaccine",
        "Not production ready (packet incomplete)"
      ]
    ]
  },
  {
    "id": "cancer",
    "modelId": "cancer_site_engines_representative",
    "runtimeIds": ["cancer_site_engines_representative", "cancer"],
    "title": "Cancer",
    "ready": 6,
    "total": 6,
    "modelHead": "Baseline risk",
    "modelRows": [
      [
        "Breast",
        "Tyrer-Cuzick / IBIS"
      ],
      [
        "Lung",
        "PLCOm2012"
      ],
      [
        "Colorectal",
        "Aleron placeholder · pre-production (not QCancer)"
      ],
      [
        "Prostate",
        "PBCG"
      ],
      [
        "State",
        "Not emitted. No composite cancer score exists by design"
      ]
    ],
    "lanes": [
      {
        "label": "Breast cancer incidence",
        "blurb": "Three production-ready actions. Primary-prevention endocrine therapy in elevated-risk patients.",
        "actions": [
          {
            "key": "C1",
            "slug": "breast_exemestane_map3_invasive_incidence",
            "name": "Exemestane (MAP.3)",
            "measure": "HR",
            "estimate": 0.35,
            "lower": 0.18,
            "upper": 0.7,
            "confidence": "MODERATE",
            "contrast": "exemestane 25 mg orally once daily versus matching placebo for invasive breast-cancer incidence"
          },
          {
            "key": "C2",
            "slug": "breast_anastrozole_ibis_ii_incidence",
            "name": "Anastrozole (IBIS-II)",
            "measure": "HR",
            "estimate": 0.47,
            "lower": 0.32,
            "upper": 0.68,
            "confidence": "MODERATE",
            "contrast": "anastrozole 1 mg orally daily versus matching placebo for invasive breast cancer or DCIS"
          },
          {
            "key": "C3",
            "slug": "breast_tamoxifen_nsabp_p1_invasive_incidence",
            "name": "Tamoxifen (NSABP P-1)",
            "measure": "RR",
            "estimate": 0.51,
            "lower": 0.39,
            "upper": 0.66,
            "confidence": "MODERATE",
            "contrast": "tamoxifen 20 mg/day versus placebo for invasive breast-cancer incidence"
          }
        ]
      },
      {
        "label": "Colorectal cancer incidence",
        "blurb": "Two production-ready actions. Screening invitation versus no screening.",
        "actions": [
          {
            "key": "C4",
            "slug": "crc_flex_sig_uk_incidence",
            "name": "Flexible sigmoidoscopy (UK)",
            "measure": "HR",
            "estimate": 0.77,
            "lower": 0.7,
            "upper": 0.84,
            "confidence": "MODERATE",
            "contrast": "intention-to-treat invitation to once-only flexible sigmoidoscopy policy versus control not contacted for colorectal-cancer incidence"
          },
          {
            "key": "C5",
            "slug": "crc_colonoscopy_nordicc_invitation_incidence",
            "name": "Colonoscopy invitation (NordICC)",
            "measure": "RR",
            "estimate": 0.82,
            "lower": 0.7,
            "upper": 0.93,
            "confidence": "MODERATE",
            "contrast": "intention-to-screen invitation to a single colonoscopy policy versus no invitation and no screening for colorectal-cancer incidence"
          }
        ]
      },
      {
        "label": "Colorectal cancer mortality",
        "blurb": "One production-ready action. Flexible sigmoidoscopy versus no screening.",
        "actions": [
          {
            "key": "C6",
            "slug": "crc_flex_sig_uk_mortality",
            "name": "Flexible sigmoidoscopy (UK)",
            "measure": "HR",
            "estimate": 0.69,
            "lower": 0.59,
            "upper": 0.82,
            "confidence": "MODERATE",
            "contrast": "intention-to-treat invitation to once-only flexible sigmoidoscopy policy versus control not contacted for colorectal-cancer mortality"
          }
        ]
      }
    ],
    "tray": []
  }
];
