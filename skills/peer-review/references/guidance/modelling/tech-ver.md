---
id: tech-ver
category: modelling
name: "TECH-VER model verification"
version: "2019"
coverage: "Five-stage workflow and complete Table 2 test bank."
source: "https://doi.org/10.1007/s40273-019-00844-y"
retrieved: "2026-09-06"
---

# TECH-VER model verification

Five-stage workflow and complete Table 2 test bank. Büyükkaramikli NC et al. The test bank is reproduced under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); formatting adapted. Workflow restated from Table 1; examples in the article narrative are not reproduced.

Source: [Official source](https://doi.org/10.1007/s40273-019-00844-y).

Apply to executable economic models, including R. First locate each calculation in code and documentation, assess the rationale and completeness, and check that their descriptions agree. Then use input/output tests, inspect the code, and independently replicate calculations as appropriate. Record inputs, expected outputs, actual outputs and unresolved discrepancies; tailor expectations to the model and justify non-applicability.

| Stage (Table 1) | What to verify |
| --- | --- |
| 1 | Input derivations: probabilities, costs, utilities and time/cycle conversions. |
| 2 | Event/state logic, patient flow and assignment of costs and outcomes. |
| 3 | Undiscounted, discounted, total and incremental outcomes and costs. |
| 4 | Deterministic, probabilistic, scenario and value-of-information calculations. |
| 5 | Whole-model comparisons with clinical inputs, literature, expert knowledge and other models; user interface and documentation. |

## Source test bank (Table 2)

The test bank below retains source wording. Expected results are conditional on the described structure and intervention: justify exceptions, rather than treating every monotonicity statement as a universal mathematical rule. “Validation” requires more than passing these implementation tests.

### Pre-analysis calculations

| Test | Expected result |
| --- | --- |
| Does the technology (drug/device, etc.) acquisition cost increase with higher prices? | Yes |
| Does the drug acquisition cost increase for higher weight or body surface area? | Yes |
| Does the probability of an event, derived from an OR/RR/HR and baseline probability, increase with higher OR/RR/HR? | Yes |
| In a partitioned survival model, does the progression-free survival curve or the time on treatment curve cross the overall survival curve? | No |
| If survival parametric distributions are used in the extrapolations or time-to-event calculations, can the formulae used for the Weibull (generalized gamma) distribution generate the values obtained from the exponential (Weibull or Gamma) distribution(s) after replacing/transforming some of the parameters? | Yes |
| Is the HR calculated from Cox proportional hazards model applied on top of the parametric distribution extrapolation found from the survival regression? | No, it is better if the treatment effect that is applied to the extrapolation comes from the same survival regression in which the extrapolation parameters are estimated |
| For the treatment effect inputs, if the model uses outputs from WINBUGS, are the OR, HR, and RR values all within plausible ranges? (Should all be non-negative and the average of these WINBUGS outputs should give the mean treatment effect) | Yes |

### Event-state calculations

| Test | Expected result |
| --- | --- |
| Calculate the sum of the number of patients at each health state | Should add up to the cohort size |
| Check if all probabilities and number of patients in a state are greater than or equal to 0 | Yes |
| Check if all probabilities are smaller than or equal to 1 | Yes |
| Compare the number of dead (or any absorbing state) patients in a period with the number of dead (or any absorbing state) patients in the previous periods? | Should be larger |
| In case of lifetime horizon, check if all patients are dead at the end of the time horizon | Yes |
| Discrete event simulation specific: Sample one of the ‘time to event’ types used in the simulation from the specified distribution. Plot the samples and compare the mean and the variance from the sample | Sample mean and variance, and the simulation outputs, should reflect the distribution it is sampled from |
| Set all utilities to 1 | The QALYs accumulated at a given time would be the same as the life-years accumulated at that time |
| Set all utilities to 0 | No utilities will be accumulated in the model |
| Decrease all state utilities simultaneously (but keep event-based utility decrements constant) | Lower utilities will be accumulated each time |
| Set all costs to 0 | No costs will be accumulated in the model at any time |
| Put mortality rates to 0 | Patients never die |
| Put mortality rate at extremely high | Patients die in the first few cycles |
| Set the effectiveness-, utility-, and safety-related model inputs for all treatment options equal | Same life-years and QALYs should be accumulated for all treatment at any time |
| In addition to the inputs above, set cost-related model inputs for all treatment options equal | Same costs, life-years, and QALYs should be accumulated for all treatment at any time |
| Change around the effectiveness-, utility- and safety-related model inputs between two treatment options | Accumulated life-years and QALYs in the model at any time should also be reversed |
| Check if the number of alive patients estimated at any cycle is in line with general population life-table statistics | At any given age, the percentage alive should be lower or equal in comparison with the general population estimate |
| Check if the QALY estimate at any cycle is in line with general population utility estimates | At any given age, the utility assigned in the model should be lower or equal in comparison with the general population utility estimate |
| Set the inflation rate for the previous year higher | The costs (which are based on a reference from previous years) assigned at each time will be higher |
| Calculate the sum of all ingoing and outgoing transition probabilities of a state in a given cycle | Difference of ingoing and outgoing probabilities at a cycle in a state times the cohort size will yield the change in the number of patients at that state in that cycle |
| Calculate the number of patients entering and leaving a tunnel state throughout the time horizon | Numbers entering = numbers leaving |
| Check if the time conversions for probabilities were conducted correctly. | Yes |
| Decision tree specific: Calculate the sum of the expected probabilities of the terminal nodes | Should sum up to 1 |
| Patient-level model specific: Check if common random numbers are maintained for sampling for the treatment arms | Yes |
| Patient-level model specific: Check if correlation in patient characteristics is taken into account when determining starting population | Yes |
| Increase the treatment acquisition cost | Costs accumulated at a given time will increase during the period when the treatment is administered |
| Population model specific: Set the mortality and incidence rates to 0 | Prevalence should be constant in time |

### Result calculations

| Test | Expected result |
| --- | --- |
| Check the incremental life-years and QALYs gained results. Are they in line with the comparative clinical effectiveness evidence of the treatments involved? | If a treatment is more effective, it generally results in positive incremental LYs and QALYs in comparison with the less-effective treatments |
| Check the incremental cost results. Are they in line with the treatment costs? | If a treatment is more expensive, and if it does not have much effect on other costs, it generally results in positive incremental costs |
| Total life years greater than the total QALYs | Yes |
| Undiscounted results greater than the discounted results | Yes |
| Divide undiscounted total QALYs by undiscounted life years | This value should be within the outer ranges (maximum and minimum) of all the utility value inputs |
| Subgroup analysis results: How do the outcomes change if the characteristics of the baseline change? | Better outcomes for better baseline health conditions, and worse outcomes for worse health conditions, are expected |
| Could you generate all the results in the report from the model (including the uncertainty analysis results)? | Yes |
| Do the total life-years, QALYs, and costs decrease if a shorter time horizon is selected? | Yes |
| Is the reporting and contextualization of the incremental results correct? | The use of terms such as ‘dominant’/‘dominated’/‘extendedly dominated’/‘cost effective’. etc.. should be in line with the results<br>In the incremental analysis table involving multiple treatments, ICERs should be calculated against the next non-dominated treatment |
| Are the reported ICERs in the fully incremental analysis non-decreasing? | Yes |
| If disentangled results are presented, do they sum up to the total results (e.g. different cost types sum up to the total costs estimate)? | Yes |
| Check if half-cycle correction is implemented correctly (total life-years with half-cycle correction should be lower than without) | The half-cycle correction implementation should be error-free. Also check if it should be applied for all costs, for instance if a treatment is administered at the start of a cycle, half-cycle correction might be unnecessary |
| Check the discounted value of costs/QALYs after 2 years | Discounted value = undiscounted/(1 + r)^2 |
| Set discount rates to 0 | The discounted and undiscounted results should be the same |
| Set mortality rate to 0 | The undiscounted total life-years per patient should be equal to the length of the time horizon |
| Put the consequence of adverse event/discontinuation to 0 (0 costs and 0 mortality/utility decrements) | The results would be the same as the results when the AE rate is set to 0 |
| Divide total undiscounted treatment acquisition costs by the average duration on treatment | This should be similar to treatment-related unit acquisition costs |
| Set discount rates to a higher value | Total discounted results should decrease |
| Set discount rates of costs/effects to an extremely high value | Total discounted results should be more or less the same as the discounted results accrued in the first cycles |
| Put adverse event/discontinuation rates to 0 and then to an extremely high level | Less costs and higher QALYS/LYs when adverse event rates are 0, higher costs and lower QALYS/LYs when AE rates are extreme |
| Double the difference in efficacy and safety between the new intervention and comparator, and report the incremental results | Approximately twice the incremental effect results of the base case. If this is not the case, report and explain the underlying reason/mechanism |
| Do the same for a scenario in which the difference in efficacy and safety is halved | Approximately halve of the incremental effect results of the base case. If this is not the case, report and explain the underlying reason/mechanism |

### Uncertainty analysis calculations

| Test | Expected result |
| --- | --- |
| Are all necessary parameters subject to uncertainty included in the OWSA? | Yes |
| Check if the OWSA includes any parameters associated with joint uncertainty (e.g. parts of a utility regression equation, survival curves with multiple parameters) | No |
| Are the upper and lower bounds used in the one-way sensitivity analysis using confidence intervals based on the statistical distribution assumed for that parameter? | Yes |
| Are the resulting ICER, incremental costs/QALYs with upper and lower bound of a parameter plausible and in line with a priori expectations? | Yes |
| Check that all parameters used in the sensitivity analysis have appropriate associated distributions – upper and lower bounds should surround the deterministic value (i.e. upper bound ≥ mean ≥ lower bound) | Yes |
| Standard error and not standard deviation used in sampling | Yes |
| Lognormal/gamma distribution for HRs and costs/resource use | Yes |
| Beta for utilities and proportions/probabilities | Yes |
| Dirichlet for multinomial | Yes |
| Multivariate normal for correlated inputs (e.g. survival curve or regression parameters) | Yes |
| Normal for other variables as long as samples do not violate the requirement to remain positive when appropriate | Yes |
| Check PSA output mean costs, QALYs, and ICER compared with the deterministic results. Is there a large discrepancy? | No (in general) |
| If you take new PSA runs from the Microsoft Excel model do you get similar results? | Yes |
| Is(are) the CEAC line(s) in line with the CE scatter plots and the efficient frontier? | Yes |
| Does the PSA cloud demonstrate an unexpected behavior or have an unusual shape? | No |
| Is the sum of all CEAC lines equal to 1 for all WTP values? | Yes |
| Do the explored scenario analyses provide a balanced view on the structural uncertainty (i.e. not always looking at more optimistic scenarios)? | Yes |
| Are the scenario analysis results plausible and in line with a priori expectations? | Yes |
| Check the correlation between two PSA results (i.e. costs/QALYs under the SoC and costs/QALYs under the comparator) | Should be very low (very high) if different (same) random streams are used for different arms |
| If a certain seed is used for random number generation (or previously generated random numbers are used), check if they are scattered evenly between 0 and 1 when they are plotted | Yes |
| Compare the mean of the parameter samples generated by the model against the point estimate for that parameter; use graphical methods to examine distributions, functions | The sample means and the point estimates will overlap, the graphs will be similar to the corresponding distribution functions (e.g. normal, gamma, etc.) |
| Check if sensitivity analyses include any parameters associated with methodological/structural uncertainty (e.g. annual discount rates, time horizon) | No |
| Value of information analysis if applicable: Was this implemented correctly? | Yes |
| Which types of analysis? Were aggregated parameters used? Which parameters are grouped together? Does it match the write-up’s suggestions? | Yes |
| Is EVPI larger than all individual EVPPIs? | Yes |
| Is EVPPI for a (group of) parameters larger than the EVSI of that (group) of parameter(s)? | Yes |
| Are the results from EVPPI in line with OWSA or other parameter importance analysis (e.g. ANCOVA)? | Yes |
| Did the electronic model pass the black-box tests of the previous verification stages in all PSA iterations and in all scenario analysis settings? (Additional macro can be embedded to the PSA code, which stops the PSA when an error such as negative transition probability is detected) | Yes |
| Check if all sampled input parameters in the PSA are correctly linked to the corresponding event/state calculations | Yes |
