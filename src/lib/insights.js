// Pure, isomorphic insights derived from the user's own mortgage numbers.
// All figures are descriptive, not advice. Reuses calculateMortgagePayments.

import { calculateMortgagePayments } from './calculations.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A. By-the-numbers callouts from the baseline schedule + totals.
 *
 * @param {Object} opts
 * @param {Array}  opts.schedule           amortization rows
 * @param {number} opts.totalInterestPaid
 * @param {number} opts.balance            original loan amount
 * @param {number} opts.yearsLeft
 * @returns {{totalCostRatio:number, interestPctOfLoan:number, avgInterestPerDay:number,
 *   crossover:({index:number,date:string}|null), year1InterestShare:number}}
 */
export function mortgageInsights({ schedule, totalInterestPaid, balance, yearsLeft }) {
  const totalCostRatio = round2((balance + totalInterestPaid) / balance);
  const interestPctOfLoan = round2((totalInterestPaid / balance) * 100);
  const avgInterestPerDay = round2(totalInterestPaid / (yearsLeft * 365));

  // First month where principal repayment catches up to interest (front-loading).
  let crossover = null;
  for (let idx = 0; idx < schedule.length; idx++) {
    if (schedule[idx]['Principal Payment'] >= schedule[idx]['Interest Payment']) {
      crossover = { index: idx, date: schedule[idx].Date };
      break;
    }
  }

  // Share of the first year's payments that goes to interest.
  const yr1 = schedule.slice(0, 12);
  const yr1Interest = yr1.reduce((s, r) => s + r['Interest Payment'], 0);
  const yr1Total = yr1.reduce((s, r) => s + r['Total Payment'], 0);
  const year1InterestShare = yr1Total > 0 ? round2((yr1Interest / yr1Total) * 100) : 0;

  return { totalCostRatio, interestPctOfLoan, avgInterestPerDay, crossover, year1InterestShare };
}

/**
 * B. Rate-shock table: re-run amortization at interestRate + delta for a few deltas.
 *
 * @returns {Array<{delta:number, newRate:number, newMonthly:number,
 *   totalInterest:number, extraInterest:number}>}
 */
export function rateShock({ interestRate, yearsLeft, balance, startDate, baselineTotalInterest }) {
  return [1, 2, 3].map((delta) => {
    const newRate = round2(interestRate + delta);
    const r = calculateMortgagePayments({ interestRate: newRate, yearsLeft, balance, startDate });
    const totalInterest = round2(r.totalInterestPaid);
    return {
      delta,
      newRate,
      newMonthly: r.schedule[0]['Total Payment'],
      totalInterest,
      extraInterest: round2(totalInterest - baselineTotalInterest),
    };
  });
}

/**
 * C. Overpayment ladder: re-run with additionalRepayment for a few rungs.
 *
 * @param {Object} opts
 * @param {{scheduleLength:number, totalInterestPaid:number}} opts.baseline
 * @returns {Array<{extra:number, monthsSaved:number, interestSaved:number, newPayoff:string}>}
 */
export function overpaymentLadder({ interestRate, yearsLeft, balance, startDate, baseline }) {
  return [50, 100, 200, 500].map((extra) => {
    const r = calculateMortgagePayments({ interestRate, yearsLeft, balance, additionalRepayment: extra, startDate });
    return {
      extra,
      monthsSaved: baseline.scheduleLength - r.schedule.length,
      interestSaved: round2(baseline.totalInterestPaid - r.totalInterestPaid),
      newPayoff: r.schedule.length ? r.schedule[r.schedule.length - 1].Date : null,
    };
  });
}

/**
 * Future value of an annuity: X contributed monthly for n months at annual rate.
 * FV = X·((1+i)^n − 1)/i, or X·n when i = 0.
 */
export function investmentFutureValue(monthly, annualRatePct, months) {
  const i = annualRatePct / 100 / 12;
  if (i === 0) return round2(monthly * months);
  return round2((monthly * ((1 + i) ** months - 1)) / i);
}

/**
 * D. Overpay vs invest: the same monthly amount, two ways, presented as neutral figures.
 *
 * @param {Object} opts
 * @param {{scheduleLength:number, totalInterestPaid:number}} opts.baseline
 * @param {number} opts.monthly      monthly amount (X)
 * @param {number} opts.annualRate   investment annual return, percent (r)
 * @returns {{monthly:number, annualRate:number, months:number,
 *   invested:{contributions:number, futureValue:number, growth:number},
 *   overpaid:{interestSaved:number, monthsSaved:number, newPayoff:(string|null)}}}
 */
export function overpayVsInvest({ interestRate, yearsLeft, balance, startDate, baseline, monthly, annualRate }) {
  const months = yearsLeft * 12;

  const contributions = round2(monthly * months);
  const futureValue = investmentFutureValue(monthly, annualRate, months);
  const growth = round2(futureValue - contributions);

  const r = calculateMortgagePayments({ interestRate, yearsLeft, balance, additionalRepayment: monthly, startDate });

  return {
    monthly,
    annualRate,
    months,
    invested: { contributions, futureValue, growth },
    overpaid: {
      interestSaved: round2(baseline.totalInterestPaid - r.totalInterestPaid),
      monthsSaved: baseline.scheduleLength - r.schedule.length,
      newPayoff: r.schedule.length ? r.schedule[r.schedule.length - 1].Date : null,
    },
  };
}
