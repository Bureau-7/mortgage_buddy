# The Mortgage Report

An **editorial data-viz** mortgage calculator, a Node.js port of the original
[Streamlit *Mortgage Buddy*](https://github.com/Vadoid/mortgage_buddy). Same rich
financial logic (verbatim math), rebuilt as a lightweight Fastify server plus a
no-build vanilla SPA, styled like a newspaper/Bloomberg terminal: serif headers,
fine hairline rules, ruled ledgers, a muted ink palette and a single accent.

## What it does

Three sections, mirroring the original app's pages:

1. **Mortgage Details**, monthly amortization schedule for a given rate, term and
   balance. Live Loan-to-Value readout, payment-composition chart, principal-vs-interest
   donut, and a ruled repayment ledger.
2. **Simulation & Analysis**, re-runs the schedule with an **additional monthly
   repayment**, a **one-time lump sum**, and/or a **mid-term rate change**, then
   overlays the remaining-balance curves and prints the original 7-branch summary
   sentence (interest saved, months saved, payoff date).
3. **Savings**, yearly compound-interest projection with an inflation toggle
   (real monetary value). Prefills the savings period from the mortgage term and
   shows a Mortgage Summary card carried over from the simulation.

### Beyond the original

Live LTV · payoff-date + months-saved callouts · interest/principal donut ·
CSV export of the schedule · print/PDF "report" view · currency selector (£/$/€).

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
