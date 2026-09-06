---
id: tripod-ai
category: reporting-standards
name: "TRIPOD+AI 2024 checklist"
applies_to: "Prediction model development and evaluation using regression or machine learning"
doi: "10.1136/bmj-2023-078378"
source: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11019967/fullTextXML"
kind: "reporting checklist"
license: "CC BY 4.0"
retrieved: "2026-09-06"
---

# TRIPOD+AI 2024 checklist

Prediction model development and evaluation using regression or machine learning. Official checklist wording; original item numbers retained. Match applicable items to manuscript evidence; reporting omissions do not establish poor study conduct.

Source: Collins Gary S et al., *TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods*. [TRIPOD+AI 2024 checklist](https://doi.org/10.1136/bmj-2023-078378) · [Checklist source](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11019967/fullTextXML). Reproduced under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); table layout and whitespace adapted.

## Title

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Title | 1 | D;E | Identify the study as developing or evaluating the performance of a multivariable prediction model, the target population, and the outcome to be predicted |

## Abstract

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Abstract | 2 | D;E | See TRIPOD+AI for Abstracts checklist |

## Introduction

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Background | 3a | D;E | Explain the healthcare context (including whether diagnostic or prognostic) and rationale for developing or evaluating the prediction model, including references to existing models |
| Background | 3b | D;E | Describe the target population and the intended purpose of the prediction model in the context of the care pathway, including its intended users (eg, healthcare professionals, patients, public) |
| Background | 3c | D;E | Describe any known health inequalities between sociodemographic groups |
| Objectives | 4 | D;E | Specify the study objectives, including whether the study describes the development or validation of a prediction model (or both) |

## Methods

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Data | 5a | D;E | Describe the sources of data separately for the development and evaluation datasets (eg, randomised trial, cohort, routine care or registry data), the rationale for using these data, and representativeness of the data |
| Data | 5b | D;E | Specify the dates of the collected participant data, including start and end of participant accrual; and, if applicable, end of follow-up |
| Participants | 6a | D;E | Specify key elements of the study setting (eg, primary care, secondary care, general population) including the number and location of centres |
| Participants | 6b | D;E | Describe the eligibility criteria for study participants |
| Participants | 6c | D;E | Give details of any treatments received, and how they were handled during model development or evaluation, if relevant |
| Data preparation | 7 | D;E | Describe any data pre-processing and quality checking, including whether this was similar across relevant sociodemographic groups |
| Outcome | 8a | D;E | Clearly define the outcome that is being predicted and the time horizon, including how and when assessed, the rationale for choosing this outcome, and whether the method of outcome assessment is consistent across sociodemographic groups |
| Outcome | 8b | D;E | If outcome assessment requires subjective interpretation, describe the qualifications and demographic characteristics of the outcome assessors |
| Outcome | 8c | D;E | Report any actions to blind assessment of the outcome to be predicted |
| Predictors | 9a | D | Describe the choice of initial predictors (eg, literature, previous models, all available predictors) and any pre-selection of predictors before model building |
| Predictors | 9b | D;E | Clearly define all predictors, including how and when they were measured (and any actions to blind assessment of predictors for the outcome and other predictors) |
| Predictors | 9c | D;E | If predictor measurement requires subjective interpretation, describe the qualifications and demographic characteristics of the predictor assessors |
| Sample size | 10 | D;E | Explain how the study size was arrived at (separately for development and evaluation), and justify that the study size was sufficient to answer the research question. Include details of any sample size calculation |
| Missing data | 11 | D;E | Describe how missing data were handled. Provide reasons for omitting any data |
| Analytical methods | 12a | D | Describe how the data were used (eg, for development and evaluation of model performance) in the analysis, including whether the data were partitioned, considering any sample size requirements |
| Analytical methods | 12b | D | Depending on the type of model, describe how predictors were handled in the analyses (functional form, rescaling, transformation, or any standardisation) |
| Analytical methods | 12c | D | Specify the type of model, rationale†, all model building steps, including any hyperparameter tuning, and method for internal validation |
| Analytical methods | 12d | D;E | Describe if and how any heterogeneity in estimates of model parameter values and model performance was handled and quantified across clusters (eg, hospitals, countries). See TRIPOD-Cluster for additional considerations‡ |
| Analytical methods | 12e | D;E | Specify all measures and plots used (and their rationale) to evaluate model performance (eg, discrimination, calibration, clinical utility) and, if relevant, to compare multiple models |
| Analytical methods | 12f | E | Describe any model updating (eg, recalibration) arising from the model evaluation, either overall or for particular sociodemographic groups or settings |
| Analytical methods | 12g | E | For model evaluation, describe how the model predictions were calculated (eg, formula, code, object, application programming interface) |
| Class imbalance | 13 | D;E | If class imbalance methods were used, state why and how this was done, and any subsequent methods to recalibrate the model or the model predictions |
| Fairness | 14 | D;E | Describe any approaches that were used to address model fairness and their rationale |
| Model output | 15 | D | Specify the output of the prediction model (eg, probabilities, classification). Provide details and rationale for any classification and how the thresholds were identified |
| Training versus evaluation | 16 | D;E | Identify any differences between the development and evaluation data in healthcare setting, eligibility criteria, outcome, and predictors |
| Ethical approval | 17 | D;E | Name the institutional research board or ethics committee that approved the study and describe the participant informed consent or the ethics committee waiver of informed consent |

## Open science

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Funding | 18a | D;E | Give the source of funding and the role of the funders for the present study |
| Conflicts of interest | 18b | D;E | Declare any conflicts of interest and financial disclosures for all authors |
| Protocol | 18c | D;E | Indicate where the study protocol can be accessed or state that a protocol was not prepared |
| Registration | 18d | D;E | Provide registration information for the study, including register name and registration number, or state that the study was not registered |
| Data sharing | 18e | D;E | Provide details of the availability of the study data |
| Code sharing | 18f | D;E | Provide details of the availability of the analytical code§ |

## Patient and public involvement

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Patient and public involvement | 19 | D;E | Provide details of any patient and public involvement during the design, conduct, reporting, interpretation, or dissemination of the study or state no involvement |

## Result

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Participants | 20a | D;E | Describe the flow of participants through the study, including the number of participants with and without the outcome and, if applicable, a summary of the follow-up time. A diagram may be helpful |
| Participants | 20b | D;E | Report the characteristics overall and, where applicable, for each data source or setting, including the key dates, key predictors (including demographics), treatments received, sample size, number of outcome events, follow-up time, and amount of missing data. A table may be helpful. Report any differences across key demographic groups |
| Participants | 20c | E | For model evaluation, show a comparison with the development data of the distribution of important predictors (demographics, predictors, and outcome) |
| Model development | 21 | D;E | Specify the number of participants and outcome events in each analysis (eg, for model development, hyperparameter tuning, model evaluation) |
| Model specification | 22 | D | Provide details of the full prediction model (eg, formula, code, object, application programming interface) to allow predictions in new individuals and to enable third party evaluation and implementation, including any restrictions to access or reuse (eg, freely available, proprietary)¶ |
| Model performance | 23a | D;E | Report model performance estimates with confidence intervals, including for any key subgroups (eg, sociodemographic). Consider plots to aid presentation |
| Model performance | 23b | D;E | If examined, report results of any heterogeneity in model performance across clusters. See TRIPOD-Cluster for additional details‡ |
| Model updating | 24 | E | Report the results from any model updating, including the updated model and subsequent performance |

## Discussion

| Topic | Item | Applies to | Requirement |
| --- | --- | --- | --- |
| Interpretation | 25 | D;E | Give an overall interpretation of the main results, including issues of fairness in the context of the objectives and previous studies |
| Limitations | 26 | D;E | Discuss any limitations of the study (such as a non-representative sample, sample size, overfitting, missing data) and their effects on any biases, statistical uncertainty, and generalisability |
| Usability of the model in the context of current care | 27a | D | Describe how poor quality or unavailable input data (eg, predictor values) should be assessed and handled when implementing the prediction model |
| Usability of the model in the context of current care | 27b | D | Specify whether users will be required to interact in the handling of the input data or use of the model, and what level of expertise is required of users |
| Usability of the model in the context of current care | 27c | D;E | Discuss any next steps for future research, with a specific view to applicability and generalisability of the model |

## Checklist notes

TRIPOD=Transparent Reporting of a multivariable prediction model for Individual Prognosis Or Diagnosis; AI=artificial intelligence.*<br>D=items relevant only to the development of a prediction model; E=items relating solely to the evaluation of a prediction model; D;E=items applicable to both the development and evaluation of a prediction model.†<br>Separately for all model building approaches.‡<br>TRIPOD-Cluster is a checklist of reporting recommendations for studies developing or validating models that explicitly account for clustering or explore heterogeneity in model performance (eg, at different hospitals or centres).19 20§<br>Relates to the analysis code, for example, any data cleaning, feature engineering, model building, and evaluation.¶<br>Relates to the code to implement the model to get estimates of risk for a new individual.

## Abstract checklist

| Item | Requirement |
| --- | --- |
| 1 | Identify the study as developing or evaluating the performance of a multivariable prediction model, the target population, and the outcome to be predicted |
| 2 | Provide a brief explanation of the healthcare context and rationale for developing or evaluating the performance of all models |
| 3 | Specify the study objectives, including whether the study describes model development, evaluation, or both |
| 4 | Describe the sources of data |
| 5 | Describe the eligibility criteria and setting where the data were collected |
| 6 | Specify the outcome to be predicted by the model, including time horizon of predictions in case of prognostic models |
| 7 | Specify the type of model, a summary of the model-building steps, and the method for internal validation† |
| 8 | Specify the measures used to assess model performance (eg, discrimination, calibration, clinical utility) |
| 9 | Report the number of participants and outcome events |
| 10 | Summarise the predictors in the final model† |
| 11 | Report model performance estimates (with confidence intervals) |
| 12 | Give an overall interpretation of the main results |
| 13 | Give the registration number and name of the registry or repository |

TRIPOD=Transparent Reporting of a multivariable prediction model for Individual Prognosis Or Diagnosis; AI=artificial intelligence.*<br>This checklist is based on the TRIPOD for Abstracts statement published in 2020,17 but has been revised and updated for consistency with the TRIPOD+AI statement.†<br>Relevant only to studies describing the development of a prediction model.

D = model development; E = model evaluation. Apply each row only to the indicated study type. This checklist supersedes TRIPOD 2015.
