import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateMortgagePayments, calculateCompoundInterest } from '../src/lib/calculations.js';
import { buildSimulationSummary, formatDate, ltv } from '../src/lib/summary.js';

const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test('mortgage: 250k / 3.5% / 30y baseline', () => {
  const r = calculateMortgagePayments({
    interestRate: 3.5,
    yearsLeft: 30,
    balance: 250000,
    startDate: '2024-01-01',
  });

  assert.equal(r.schedule.length, 360); // 30 years * 12 months

  // First row, hand-computed: interest = 250000 * (3.5/100/12) = 729.1667
  const first = r.schedule[0];
  assert.equal(first.Date, '2024-01');
  assert.ok(approx(first['Interest Payment'], 729.17));
  assert.ok(approx(first['Total Payment'], 1122.61)); // canonical 30y/3.5%/250k payment
  assert.ok(approx(first['Principal Payment'], 393.45));

  // Final row: balance clamps to exactly zero.
  const last = r.schedule[r.schedule.length - 1];
  assert.equal(last['Remaining Balance'], 0);
  assert.equal(last.Date, '2053-12');

  // Principal repaid over the life equals the original balance.
  assert.ok(approx(r.totalPrincipalPaid, 250000, 0.01));
  assert.ok(approx(r.totalInterestPaid, 154140.22, 0.5));
  assert.ok(approx(r.finalMonthlyPayment, 1122.61));
});

test('mortgage: lump sum reduces interest and is applied up-front', () => {
  const base = calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' });
  const lump = calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 250000, lumpSum: 50000, startDate: '2024-01-01' });
  assert.ok(lump.totalInterestPaid < base.totalInterestPaid);
  // First-month interest is on 200k, not 250k: 200000 * 3.5/100/12 = 583.33
  assert.ok(approx(lump.schedule[0]['Interest Payment'], 583.33));
});

test('mortgage: lump sum exceeding balance throws', () => {
  assert.throws(
    () => calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 100000, lumpSum: 150000 }),
    /exceeds mortgage balance/,
  );
});

test('mortgage: additional repayment shortens the term', () => {
  const base = calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 250000, startDate: '2024-01-01' });
  const extra = calculateMortgagePayments({ interestRate: 3.5, yearsLeft: 30, balance: 250000, additionalRepayment: 300, startDate: '2024-01-01' });
  assert.ok(extra.schedule.length < base.schedule.length);
  assert.ok(extra.totalInterestPaid < base.totalInterestPaid);
});

test('mortgage: zero interest rate amortizes linearly', () => {
  const r = calculateMortgagePayments({ interestRate: 0, yearsLeft: 10, balance: 120000, startDate: '2024-01-01' });
  assert.equal(r.schedule.length, 120);
  assert.ok(approx(r.schedule[0]['Total Payment'], 1000)); // 120000 / 120
  assert.ok(approx(r.totalInterestPaid, 0));
});

test('mortgage: new rate kicks in at its effective date', () => {
  const r = calculateMortgagePayments({
    interestRate: 3.5,
    yearsLeft: 30,
    balance: 250000,
    startDate: '2024-01-01',
    newRate: 6,
    newRateDate: '2025-01-01',
  });
  // After Jan 2025, interest is computed at 6%; payment rises vs 3.5%-only.
  const jan2025 = r.schedule.find((row) => row.Date === '2025-01');
  assert.ok(jan2025['Total Payment'] > 1122.61);
});

test('savings: compound interest without inflation', () => {
  const r = calculateCompoundInterest({ principal: 10000, annualRate: 5, inflationRate: 2, years: 3, includeInflation: false });
  assert.deepEqual(r.rows.map((x) => x['Running Balance']), [10500, 11025, 11576.25]);
  assert.equal(r.totalInterest, 1576.25);
  assert.equal(r.finalBalance, 11576.25);
});

test('savings: compound interest with inflation adjustment', () => {
  const r = calculateCompoundInterest({ principal: 10000, annualRate: 5, inflationRate: 2, years: 2, includeInflation: true });
  assert.deepEqual(r.rows.map((x) => x['Running Balance']), [10300, 10609]);
  // Inflation adjustment is balance * inflation_rate each year.
  assert.equal(r.rows[0]['Inflation Adjustment'], 200);
  assert.equal(r.rows[1]['Inflation Adjustment'], 206);
});

test('helpers: formatDate and ltv', () => {
  assert.equal(formatDate('2025-07'), 'July 2025');
  assert.equal(formatDate(null), 'N/A');
  assert.ok(approx(ltv(200000, 250000), 80));
});

test('summary: 7 branches select the right sentence', () => {
  const fmt = (n) => n.toFixed(2);
  const base = {
    newRateDate: 'July 2025',
    endDateWithAdditional: 'June 2050',
    endDateWithoutAdditional: 'December 2053',
    totalMonthlyPaymentWithAdditional: 1400,
    totalPrincipalPaidWithAdditional: 250000,
    totalInterestPaidWithAdditional: 120000,
    totalPrincipalPaidWithoutAdditional: 250000,
    totalInterestPaidWithoutAdditional: 154000,
  };
  assert.match(buildSimulationSummary({ ...base, newRate: 6, additionalRepayment: 300, lumpSum: 50000 }, fmt), /mitigate the impact of the rate change/);
  assert.match(buildSimulationSummary({ ...base, newRate: 0, additionalRepayment: 300, lumpSum: 50000 }, fmt), /additional monthly repayment.*and a lump sum/s);
  assert.match(buildSimulationSummary({ ...base, newRate: 6, additionalRepayment: 0, lumpSum: 50000 }, fmt), /increased rate.*lump sum payment/s);
  assert.match(buildSimulationSummary({ ...base, newRate: 0, additionalRepayment: 300, lumpSum: 0 }, fmt), /^With an additional monthly repayment/);
  assert.match(buildSimulationSummary({ ...base, newRate: 6, additionalRepayment: 0, lumpSum: 0 }, fmt), /^With the increased rate/);
  assert.match(buildSimulationSummary({ ...base, newRate: 0, additionalRepayment: 0, lumpSum: 50000 }, fmt), /^By making a one-time lump sum/);
  assert.match(buildSimulationSummary({ ...base, newRate: 0, additionalRepayment: 0, lumpSum: 0 }, fmt), /Without any changes/);
});
