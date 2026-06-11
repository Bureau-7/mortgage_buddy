# The Mortgage Report

An **editorial data-viz** mortgage calculator, a Node.js port of the original
[Streamlit *Mortgage Buddy*](https://github.com/Vadoid/mortgage_buddy). Same rich
financial logic (verbatim math), rebuilt as a lightweight Fastify server plus a
no-build vanilla SPA, styled like a newspaper/Bloomberg terminal: serif headers,
fine hairline rules, ruled ledgers, a muted ink palette and a single accent.

## What it does

A guided 4-step flow that ends in one consolidated, printable report (PDF via the
browser's print dialog):

1. **Mortgage** (required), rate, term, balance, optional property value (live
   Loan-to-Value) and start date. Anchors the whole report.
2. **Simulation** (optional), overpay monthly, drop a **one-time lump sum**, and/or
   model a **mid-term rate change**. Skippable.
3. **Savings** (optional), yearly compound-interest projection with an inflation
   toggle (real monetary value); the period prefills from the mortgage term. Skippable.
4. **Report**, assembles everything into an editorial brief: dateline + parameter
   strip, **I · Repayment Overview** (stat row, payment-composition chart,
   principal-vs-interest donut, repayment ledger), **II · Scenario Analysis** (the
   original 7-branch summary sentence, interest/months saved, baseline-vs-scenario
   overlay + comparison table), and **III · Savings Outlook** (growth chart + table).
   Optional sections are omitted if their step was skipped.

State carries across the whole flow (balance into simulation, term into savings period).

### Beyond the original

Guided wizard with a progress stepper · single assembled report · **Download PDF**
(print stylesheet, page breaks, zero deps) · live LTV · payoff-date + months-saved
callouts · interest/principal donut · CSV export of the schedule · currency selector
(£/$/€).

## Run it

```bash
npm install
npm start        # http://localhost:3000
```

Other scripts:

```bash
npm run dev      # node --watch
npm test         # calc parity tests (node:test, no extra deps)
```

Docker:

```bash
docker build -t mortgage-report .
docker run -p 3000:3000 mortgage-report
```

## Architecture

```
src/lib/calculations.js   pure isomorphic math (amortization, compound interest)
src/lib/summary.js        7-branch simulation summary, formatDate, ltv
src/lib/format.js         Intl.NumberFormat currency helpers
src/server.js             Fastify: POST /api/mortgage, /api/simulate, /api/savings
public/                   no-build SPA (index.html, css, js, ECharts from /vendor)
test/calc.test.js         parity tests vs hand-computed values
```

## Parity note

`calculateMortgagePayments` and `calculateCompoundInterest` are ported line-for-line
from the Python originals: monthly amortization, lump sum applied up-front, payment
recomputed when the new rate kicks in at its effective date, final payment clamped so
the balance lands exactly on zero, and the inflation adjustment toggled on/off. The
7-branch simulation summary text matches the Streamlit wording. Figures are estimates,
not financial advice.
