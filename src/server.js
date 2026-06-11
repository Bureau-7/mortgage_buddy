import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculateMortgagePayments, calculateCompoundInterest } from './lib/calculations.js';
import { mortgageInsights, rateShock, overpaymentLadder, overpayVsInvest } from './lib/insights.js';
import { buildSimulationSummary, formatDate, ltv } from './lib/summary.js';
import { makeFormatters } from './lib/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const fastify = Fastify({ logger: false });

// Static: SPA from public/, ECharts dist mounted at /vendor/echarts.
await fastify.register(fastifyStatic, {
  root: join(ROOT, 'public'),
  prefix: '/',
});
await fastify.register(fastifyStatic, {
  root: join(ROOT, 'node_modules', 'echarts', 'dist'),
  prefix: '/vendor/echarts/',
  decorateReply: false,
});

const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')));

// POST /api/mortgage — amortization schedule + totals.
fastify.post('/api/mortgage', async (req, reply) => {
  const b = req.body || {};
  const warnings = [];
  const balance = num(b.balance);
  const interestRate = num(b.interestRate);
  const yearsLeft = parseInt(b.yearsLeft, 10);
  const startDate = b.startDate || null;
  const propertyValue = b.propertyValue ? num(b.propertyValue) : null;

  if (!(balance > 0)) {
    return reply.code(400).send({ error: 'Current Mortgage Balance must be greater than 0.' });
  }

  const result = calculateMortgagePayments({ interestRate, yearsLeft, balance, startDate });
  const fmt = makeFormatters(b.currency);

  // Insights derived from step-1 inputs alone, so the report and inline hints
  // have them whether or not the optional steps run.
  const insights = mortgageInsights({
    schedule: result.schedule,
    totalInterestPaid: result.totalInterestPaid,
    balance,
    yearsLeft,
  });
  const shock = rateShock({
    interestRate,
    yearsLeft,
    balance,
    startDate,
    baselineTotalInterest: result.totalInterestPaid,
  });
  const ladder = overpaymentLadder({
    interestRate,
    yearsLeft,
    balance,
    startDate,
    baseline: { scheduleLength: result.schedule.length, totalInterestPaid: result.totalInterestPaid },
  });

  return {
    ...result,
    ltv: propertyValue ? ltv(balance, propertyValue) : null,
    payoffDate: result.schedule.length ? result.schedule[result.schedule.length - 1].Date : null,
    insights,
    rateShock: shock,
    ladder,
    currency: fmt.code,
    warnings,
  };
});

// POST /api/compare — overpay vs invest the same monthly amount (D).
fastify.post('/api/compare', async (req, reply) => {
  const b = req.body || {};
  const balance = num(b.balance);
  const interestRate = num(b.interestRate ?? 3.5);
  const yearsLeft = parseInt(b.yearsLeft ?? 30, 10);
  const startDate = b.startDate || null;
  const monthlyOverpay = num(b.monthlyOverpay) > 0 ? num(b.monthlyOverpay) : 200;
  const annualRate = num(b.annualRate) >= 0 && !Number.isNaN(num(b.annualRate)) ? num(b.annualRate) : 5;

  if (!(balance > 0)) {
    return reply.code(400).send({ error: 'Current Mortgage Balance must be greater than 0.' });
  }

  const baseline = calculateMortgagePayments({ interestRate, yearsLeft, balance, startDate });
  const result = overpayVsInvest({
    interestRate,
    yearsLeft,
    balance,
    startDate,
    baseline: { scheduleLength: baseline.schedule.length, totalInterestPaid: baseline.totalInterestPaid },
    monthly: monthlyOverpay,
    annualRate,
  });
  const fmt = makeFormatters(b.currency);

  return { ...result, currency: fmt.code };
});

// POST /api/simulate — baseline vs new, summary text, savings deltas.
fastify.post('/api/simulate', async (req, reply) => {
  const b = req.body || {};
  const warnings = [];

  const balance = num(b.balance);
  const interestRate = num(b.interestRate ?? 3.5);
  const yearsLeft = parseInt(b.yearsLeft ?? 30, 10);
  const startDate = b.startDate || null;
  const additionalRepayment = num(b.additionalRepayment) || 0;
  const lumpSum = num(b.lumpSum) || 0;
  const rawNewRate = num(b.newRate) || 0;
  const newRateDate = b.newRateDate || null;

  if (lumpSum > balance) warnings.push('Lump sum payment exceeds the mortgage balance.');
  if ((rawNewRate > 0 && !newRateDate) || (newRateDate && rawNewRate === 0)) {
    warnings.push('Both the new mortgage rate and the date it kicks in must be provided together.');
  }

  if (!(balance > 0)) {
    return reply.code(400).send({ error: 'Current Mortgage Balance must be greater than 0.', warnings });
  }
  if ((rawNewRate > 0 && !newRateDate) || (newRateDate && rawNewRate === 0)) {
    return reply.code(400).send({ error: warnings[warnings.length - 1], warnings });
  }

  let baseline, withNew;
  try {
    baseline = calculateMortgagePayments({ interestRate, yearsLeft, balance, startDate });
    withNew = calculateMortgagePayments({
      interestRate,
      yearsLeft,
      balance,
      additionalRepayment,
      lumpSum,
      startDate,
      newRate: rawNewRate > 0 ? rawNewRate : null,
      newRateDate: newRateDate || null,
    });
  } catch (err) {
    return reply.code(400).send({ error: err.message, warnings });
  }

  const fmt = makeFormatters(b.currency);
  const endOld = baseline.schedule[baseline.schedule.length - 1].Date;
  const endNew = withNew.schedule[withNew.schedule.length - 1].Date;

  const summary = buildSimulationSummary(
    {
      newRate: rawNewRate,
      additionalRepayment,
      lumpSum,
      newRateDate: formatDate(newRateDate),
      endDateWithAdditional: formatDate(endNew),
      endDateWithoutAdditional: formatDate(endOld),
      totalMonthlyPaymentWithAdditional: withNew.finalMonthlyPayment,
      totalPrincipalPaidWithAdditional: withNew.totalPrincipalPaid,
      totalInterestPaidWithAdditional: withNew.totalInterestPaid,
      totalPrincipalPaidWithoutAdditional: baseline.totalPrincipalPaid,
      totalInterestPaidWithoutAdditional: baseline.totalInterestPaid,
    },
    fmt.number,
  );

  const interestSavings = baseline.totalInterestPaid - withNew.totalInterestPaid;
  const monthsSaved = baseline.schedule.length - withNew.schedule.length;

  return {
    baseline: {
      schedule: baseline.schedule,
      totalPrincipalPaid: baseline.totalPrincipalPaid,
      totalInterestPaid: baseline.totalInterestPaid,
      endDate: endOld,
    },
    withNew: {
      schedule: withNew.schedule,
      totalPrincipalPaid: withNew.totalPrincipalPaid,
      totalInterestPaid: withNew.totalInterestPaid,
      finalMonthlyPayment: withNew.finalMonthlyPayment,
      endDate: endNew,
    },
    summary,
    interestSavings,
    monthsSaved,
    currency: fmt.code,
    warnings,
  };
});

// POST /api/savings — yearly compound-interest projection.
fastify.post('/api/savings', async (req, reply) => {
  const b = req.body || {};
  const principal = num(b.principal);
  const annualRate = num(b.annualRate);
  const inflationRate = num(b.inflationRate);
  const years = parseInt(b.years, 10);
  const includeInflation = !!b.includeInflation;

  if (!(principal >= 0) || Number.isNaN(principal)) {
    return reply.code(400).send({ error: 'Please enter a valid number for the Amount of Savings.' });
  }
  if (!(years >= 1)) {
    return reply.code(400).send({ error: 'Period of Savings must be at least 1 year.' });
  }

  const result = calculateCompoundInterest({ principal, annualRate, inflationRate, years, includeInflation });
  const fmt = makeFormatters(b.currency);

  return { ...result, currency: fmt.code };
});

const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

fastify
  .listen({ port, host })
  .then(() => {
    console.log(`The Mortgage Report running at http://localhost:${port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
