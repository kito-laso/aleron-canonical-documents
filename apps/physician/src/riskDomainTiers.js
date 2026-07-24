// GENERATED FILE — do not edit by hand.
// Source: data/methods/risk_domain_risk_tiers.v1.json sha256:affd756868d045110796ba505920deb7f6fc7f036ae53cfefeb59a89f59f7533
// Regenerate: python3 apps/physician/tools/generate_risk_domain_tiers.py
export const RISK_DOMAIN_TIERS = {
  "cardiovascular": {
    "engine": "PREVENT ASCVD 10-year",
    "target_id": "PREVENT_ASCVD_FIRST_EVENT",
    "horizon_years": 10,
    "tiers": [
      {
        "label": "Low",
        "lt": 0.05
      },
      {
        "label": "Borderline",
        "gte": 0.05,
        "lt": 0.075
      },
      {
        "label": "Intermediate",
        "gte": 0.075,
        "lt": 0.2
      },
      {
        "label": "High",
        "gte": 0.2
      }
    ],
    "source": "2019 ACC/AHA Guideline on the Primary Prevention of Cardiovascular Disease (Arnett DK, et al. Circulation. 2019;140:e596-e646. doi:10.1161/CIR.0000000000000678): low <5%, borderline 5% to <7.5%, intermediate 7.5% to <20%, high >=20% 10-year ASCVD risk."
  },
  "metabolic": {
    "engine": "QDiabetes 10-year",
    "target_id": "INCIDENT_T2DM",
    "horizon_years": 10,
    "tiers": [
      {
        "label": "Below high-risk threshold",
        "lt": 0.056
      },
      {
        "label": "High",
        "gte": 0.056
      }
    ],
    "source": "NHS Health Check best practice guidance (2017), operationalizing NICE PH38: QDiabetes 10-year risk >=5.6% identifies high risk of type 2 diabetes and triggers blood testing plus intensive lifestyle programme referral. No governed sub-threshold stratification exists; values below the cutoff are reported as below threshold, not graded."
  },
  "kidney": {
    "engine": "CKD / KFRE",
    "target_id": "KIDNEY_FAILURE_KRT_FIRST_EVENT",
    "horizon_years": 5,
    "tiers": [
      {
        "label": "Below referral range",
        "lt": 0.03
      },
      {
        "label": "Within referral range",
        "gte": 0.03,
        "lt": 0.05
      },
      {
        "label": "Above referral range",
        "gte": 0.05
      }
    ],
    "source": "KDIGO 2024 CKD Guideline Practice Point 5.1.1: a 5-year kidney failure risk of 3% to 5% can be used to determine need for nephrology referral in addition to eGFR, ACR, and other clinical considerations. Labels report position relative to that published referral range; they are not invented low/moderate/high risk categories."
  },
  "neurologic": {
    "engine": "Aleron dementia 10-year placeholder",
    "target_id": "DEMENTIA_INCIDENCE",
    "horizon_years": 10,
    "tiers": [
      {
        "label": "Low",
        "lt": 0.01
      },
      {
        "label": "Moderate",
        "gte": 0.01,
        "lt": 0.03
      },
      {
        "label": "Elevated",
        "gte": 0.03,
        "lt": 0.05
      },
      {
        "label": "High",
        "gte": 0.05
      }
    ],
    "source": "PRODUCT_PLACEHOLDER_UI_RULE, Jason Yim 2026-07-24: treat the authorized placeholder like the future executable model so the representative UX and UI can be completed. These provisional 10-year bands are not CogDrisk-ML thresholds, are not clinically validated, and apply only to the exact clinical-use-prohibited placeholder identity."
  },
  "cancer": {
    "engine": "Site-specific engines (BCRAT, PLCO, PBCG)",
    "target_id": null,
    "horizon_years": null,
    "tiers": null,
    "source": "Thresholds are site-specific (e.g., Gail 5-year >=1.67% breast chemoprevention; PLCOm2012 6-year >=1.51% lung screening) and cannot be collapsed into one honest domain tier."
  }
};
