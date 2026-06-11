// Simulation summary text + helpers.
// Reproduces the 7-branch summary from simulation_analysis.py and format_date().

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a 'YYYY-MM' or 'YYYY-MM-DD' string as 'Month YYYY'.
 * Returns 'N/A' for null/undefined (mirrors format_date()).
 */
export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const [y, m] = String(dateStr).split('-').map((x) => parseInt(x, 10));
  const month = MONTHS[(m || 1) - 1] || '';
  return `${month} ${y}`;
}

/** Loan-to-value as a percentage: balance / propertyValue * 100. */
export function ltv(balance, propertyValue) {
  if (!propertyValue) return null;
  return (balance / propertyValue) * 100;
}

/**
 * Build the simulation summary sentence.
 *
 * @param {Object} p
 * @param {number} p.newRate
 * @param {number} p.additionalRepayment
 * @param {number} p.lumpSum
 * @param {string} p.newRateDate                 formatted (e.g. 'July 2025') or 'N/A'
 * @param {string} p.endDateWithAdditional       formatted 'Month YYYY'
 * @param {string} p.endDateWithoutAdditional    formatted 'Month YYYY'
 * @param {number} p.totalMonthlyPaymentWithAdditional
 * @param {number} p.totalPrincipalPaidWithAdditional
 * @param {number} p.totalInterestPaidWithAdditional
 * @param {number} p.totalPrincipalPaidWithoutAdditional
 * @param {number} p.totalInterestPaidWithoutAdditional
 * @param {(n:number)=>string} fmt               number formatter (thousands + 2dp)
 * @returns {string} markdown text with **bold** figures
 */
export function buildSimulationSummary(p, fmt) {
  const {
    newRate,
    additionalRepayment,
    lumpSum,
    newRateDate,
    endDateWithAdditional,
    endDateWithoutAdditional,
    totalMonthlyPaymentWithAdditional,
    totalPrincipalPaidWithAdditional,
    totalInterestPaidWithAdditional,
    totalPrincipalPaidWithoutAdditional,
    totalInterestPaidWithoutAdditional,
  } = p;

  const totalSumOld = totalPrincipalPaidWithoutAdditional + totalInterestPaidWithoutAdditional;
  const totalSumNew = totalPrincipalPaidWithAdditional + totalInterestPaidWithAdditional;
  const lumpSumSavings = totalInterestPaidWithoutAdditional - totalInterestPaidWithAdditional;

  const f = fmt;
  const rate = `${newRate.toFixed(2)}%`;

  if (newRate > 0 && additionalRepayment > 0 && lumpSum > 0) {
    return (
      `With the increased rate of **${rate}** from **${newRateDate}**, you will finish your mortgage at **${endDateWithAdditional}** and your average monthly mortgage payment will be **${f(totalMonthlyPaymentWithAdditional)}**, ` +
      `the total mortgage principal during this time would be **${f(totalPrincipalPaidWithAdditional)}** and the interest will be **${f(totalInterestPaidWithAdditional)}**, ` +
      `which would mean the total sum of **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}**.\n\n` +
      `By having an additional repayment of **${f(additionalRepayment)}**, and a lump sum of **${f(lumpSum)}**, you can mitigate the impact of the rate change, making the total interest **${f(totalInterestPaidWithAdditional)}** instead of **${f(totalInterestPaidWithoutAdditional)}** ` +
      `and the total sum repaid would be **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}** instead of **${f(totalPrincipalPaidWithoutAdditional)} + ${f(totalInterestPaidWithoutAdditional)} = ${f(totalSumOld)}**.\n\n` +
      `The lump sum payment of **${f(lumpSum)}** saves you **${f(lumpSumSavings)}** in interest over the period of the mortgage.`
    );
  } else if (additionalRepayment > 0 && lumpSum > 0) {
    return (
      `With an additional monthly repayment of **${f(additionalRepayment)}**, and a lump sum of **${f(lumpSum)}**, the end date would be **${endDateWithAdditional}** instead of **${endDateWithoutAdditional}**, ` +
      `making the total interest **${f(totalInterestPaidWithAdditional)}** instead of **${f(totalInterestPaidWithoutAdditional)}** ` +
      `and the total sum repaid would be **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}** instead of **${f(totalPrincipalPaidWithoutAdditional)} + ${f(totalInterestPaidWithoutAdditional)} = ${f(totalSumOld)}**.\n\n` +
      `The lump sum payment of **${f(lumpSum)}** saves you **${f(lumpSumSavings)}** in interest over the period of the mortgage.`
    );
  } else if (newRate > 0 && lumpSum > 0) {
    return (
      `With the increased rate of **${rate}** from **${newRateDate}**, you will finish your mortgage at **${endDateWithAdditional}** and your average monthly mortgage payment will be **${f(totalMonthlyPaymentWithAdditional)}**, ` +
      `the total mortgage principal during this time would be **${f(totalPrincipalPaidWithAdditional)}** and the interest will be **${f(totalInterestPaidWithAdditional)}**, ` +
      `which would mean the total sum of **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}**.\n\n` +
      `The lump sum payment of **${f(lumpSum)}** saves you **${f(lumpSumSavings)}** in interest over the period of the mortgage.`
    );
  } else if (additionalRepayment > 0) {
    return (
      `With an additional monthly repayment of **${f(additionalRepayment)}**, the end date would be **${endDateWithAdditional}** instead of **${endDateWithoutAdditional}**, ` +
      `making the total interest **${f(totalInterestPaidWithAdditional)}** instead of **${f(totalInterestPaidWithoutAdditional)}** ` +
      `and the total sum repaid would be **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}** instead of **${f(totalPrincipalPaidWithoutAdditional)} + ${f(totalInterestPaidWithoutAdditional)} = ${f(totalSumOld)}**.`
    );
  } else if (newRate > 0) {
    return (
      `With the increased rate of **${rate}** from **${newRateDate}**, you will finish your mortgage at **${endDateWithAdditional}** and your average monthly mortgage payment will be **${f(totalMonthlyPaymentWithAdditional)}**, ` +
      `the total mortgage principal during this time would be **${f(totalPrincipalPaidWithAdditional)}** and the interest will be **${f(totalInterestPaidWithAdditional)}**, ` +
      `which would mean the total sum of **${f(totalPrincipalPaidWithAdditional)} + ${f(totalInterestPaidWithAdditional)} = ${f(totalSumNew)}**.`
    );
  } else if (lumpSum > 0) {
    return (
      `By making a one-time lump sum payment of **${f(lumpSum)}**, the total interest would be **${f(totalInterestPaidWithAdditional)}** instead of **${f(totalInterestPaidWithoutAdditional)}**, ` +
      `saving you **${f(lumpSumSavings)}** in interest over the period of the mortgage.`
    );
  }
  return `Without any changes, you will pay off your mortgage by **${endDateWithoutAdditional}** with no interest savings.`;
}
