import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateMortgagePayments } from '../src/lib/calculations.js';
import {
  mortgageInsights,
  rateShock,
  overpaymentLadder,
  investmentFutureValue,
  overpayVsInvest,
} from '../src/lib/insights.js';

const approx = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

const baselineFor = (opts) => {
  const r = calculateMortgagePayments(opts);
  return {
    schedule: r.schedule,
    totalInterestPaid: r.totalInterestPaid,
    scheduleLength: r.schedule.length,
  };
};

test('investmentFutureValue: £200/mo, 5%, 360 months annuity', () => {
  // Hand-checked: i = 0.05/12, FV = 200·((1+i)^360 − 1)/i ≈ 166,451.73
  const fv = investmentFutureValue(200, 5, 360);
  assert.ok(approx(fv, 166451.73, 1), `got ${fv}`);
});

test('investmentFutureValue: zero return is linear (X·n)', () => {
  assert.equal(investmentFutureValue(200, 0, 360), 72000);
});

test('overpaymentLadder: every rung saves interest and shortens the term', () => {
  const opts = { interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' };
  const base = baselineFor(opts);
  const rungs = overpaymentLadder({
    interestRate: 3.5,
    yearsLeft: 30,
    balance: 250000,
    startDate: '2024-01-01',
    baseline: { scheduleLength: base.scheduleLength, totalInterestPaid: base.totalInterestPaid },
  });
  assert.equal(rungs.length, 4);
  let prevInterest = 0;
  let prevMonths = 0;
  for (const r of rungs) {
    assert.ok(r.interestSaved > 0, `extra ${r.extra} should save interest`);
    assert.ok(r.monthsSaved > 0, `extra ${r.extra} should shorten the term`);
    // Larger overpayments save more.
    assert.ok(r.interestSaved >= prevInterest);
    assert.ok(r.monthsSaved >= prevMonths);
    prevInterest = r.interestSaved;
    prevMonths = r.monthsSaved;
  }
});

test('rateShock: higher delta increases monthly and total interest monotonically', () => {
  const opts = { interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' };
  const base = calculateMortgagePayments(opts);
  const rows = rateShock({
    interestRate: 3.5,
    yearsLeft: 30,
    balance: 250000,
    startDate: '2024-01-01',
    baselineTotalInterest: base.totalInterestPaid,
  });
  assert.deepEqual(rows.map((r) => r.delta), [1, 2, 3]);
  for (let k = 0; k < rows.length; k++) {
    assert.equal(rows[k].newRate, 3.5 + rows[k].delta);
    assert.ok(rows[k].extraInterest > 0);
    if (k > 0) {
      assert.ok(rows[k].newMonthly > rows[k - 1].newMonthly);
      assert.ok(rows[k].totalInterest > rows[k - 1].totalInterest);
      assert.ok(rows[k].extraInterest > rows[k - 1].extraInterest);
    }
  }
});

test('mortgageInsights: 3.5%/30y/£250k callouts fall in expected ranges', () => {
  const r = calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' });
  const a = mortgageInsights({
    schedule: r.schedule,
    totalInterestPaid: r.totalInterestPaid,
    balance: 250000,
    yearsLeft: 30,
  });
  // Total cost ratio ≈ 1.62 per £1.
  assert.ok(a.totalCostRatio > 1.5 && a.totalCostRatio < 1.7, `ratio ${a.totalCostRatio}`);
  // Interest as % of loan ≈ 61.7%.
  assert.ok(a.interestPctOfLoan > 55 && a.interestPctOfLoan < 70);
  // Crossover is years in, not month 1, for a typical positive-rate loan.
  assert.ok(a.crossover && a.crossover.index > 12 && a.crossover.index < 360);
  // Year-1 is interest-heavy: well over half goes to interest.
  assert.ok(a.year1InterestShare > 50 && a.year1InterestShare < 75);
  assert.ok(a.avgInterestPerDay > 0);
});

test('mortgageInsights: 0% loan crosses over at month 1', () => {
  const r = calculateMortgagePayments({ interestRate: 0, yearsLeft: 10, balance: 120000, startDate: '2024-01-01' });
  const a = mortgageInsights({
    schedule: r.schedule,
    totalInterestPaid: r.totalInterestPaid,
    balance: 120000,
    yearsLeft: 10,
  });
  assert.equal(a.crossover.index, 0);
  assert.equal(a.totalCostRatio, 1);
  assert.equal(a.interestPctOfLoan, 0);
  assert.equal(a.year1InterestShare, 0);
});

test('overpayVsInvest: returns both figures with defaults', () => {
  const opts = { interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' };
  const base = baselineFor(opts);
  const d = overpayVsInvest({
    interestRate: 3.5,
    yearsLeft: 30,
    balance: 250000,
    startDate: '2024-01-01',
    baseline: { scheduleLength: base.scheduleLength, totalInterestPaid: base.totalInterestPaid },
    monthly: 200,
    annualRate: 5,
  });
  assert.equal(d.months, 360);
  assert.equal(d.invested.contributions, 72000);
  assert.ok(d.invested.futureValue > d.invested.contributions);
  assert.ok(approx(d.invested.growth, d.invested.futureValue - d.invested.contributions, 0.01));
  assert.ok(d.overpaid.interestSaved > 0);
  assert.ok(d.overpaid.monthsSaved > 0);
});
