// The Mortgage Report — guided wizard + assembled, printable report.
import { amortChart, splitDonut, overlayChart, savingsChart, resizeAll, disposeAll } from './charts.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---- Accumulated state across the whole flow ----
const state = {
  currency: 'GBP',
  mortgage: null, // { inputs, data }
  sim: null,      // { inputs, data } or null if skipped
  savings: null,  // { inputs, data } or null if skipped
};

const CURRENCY = {
  GBP: { symbol: '£', locale: 'en-GB' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
};
const sym = () => CURRENCY[state.currency].symbol;
function fmtMoney(n) {
  const c = CURRENCY[state.currency];
  return c.symbol + Number(n).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  const c = CURRENCY[state.currency];
  return Number(n).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const parseNum = (s) => parseFloat(String(s).replace(/,/g, ''));

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, currency: state.currency }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showWarn(el, msg) {
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = msg;
}

// ------------------------- Wizard navigation -------------------------
let current = 1;
const MAX_REACHED = { 1: true };

function goTo(step) {
  current = step;
  $$('.step').forEach((s) => s.classList.toggle('is-active', s.id === `step-${step}`));
  $$('.step-dot').forEach((d) => {
    const n = Number(d.dataset.step);
    d.classList.toggle('is-active', n === step);
    d.classList.toggle('is-done', n < step && MAX_REACHED[n]);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (step === 4) buildReport();
  setTimeout(resizeAll, 80);
}

// Stepper dots: jump to any already-reached step.
$$('.step-dot').forEach((d) => d.addEventListener('click', () => {
  const n = Number(d.dataset.step);
  if (MAX_REACHED[n]) goTo(n);
}));
// Back buttons.
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.goto))));

function reach(step) { MAX_REACHED[step] = true; }

// ------------------------- Live LTV (step 1) -------------------------
function updateLtv() {
  const bal = parseNum($('#m-balance').value);
  const val = parseNum($('#m-value').value);
  $('#m-ltv').textContent = val > 0 && bal > 0 ? ((bal / val) * 100).toFixed(2) + '%' : '—';
}
['#m-balance', '#m-value'].forEach((s) => $(s).addEventListener('input', updateLtv));

// ------------------------- Step 1: Mortgage -------------------------
$('#mortgage-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#m-warn');
  const balance = parseNum($('#m-balance').value);
  if (!(balance > 0)) { showWarn(warn, 'Current Mortgage Balance must be greater than 0.'); return; }
  showWarn(warn, '');

  const inputs = {
    interestRate: parseNum($('#m-rate').value),
    yearsLeft: parseInt($('#m-years').value, 10),
    balance,
    startDate: $('#m-start').value || null,
    propertyValue: parseNum($('#m-value').value) || null,
  };

  let data;
  try { data = await api('/api/mortgage', inputs); }
  catch (err) { showWarn(warn, err.message); return; }

  state.mortgage = { inputs, data };
  // Carry values forward.
  $('#s-balance').value = $('#m-balance').value;
  $('#v-years').value = inputs.yearsLeft;

  const res = $('#m-result');
  res.hidden = false;
  res.innerHTML = `Monthly payment <strong>${fmtMoney(data.schedule[0]['Total Payment'])}</strong> · `
    + `paid off <strong>${data.payoffDate}</strong> · total interest <strong>${fmtMoney(data.totalInterestPaid)}</strong>`
    + (data.ltv != null ? ` · LTV <strong>${data.ltv.toFixed(2)}%</strong>` : '');
  $('#m-next').disabled = false;
});
$('#m-next').addEventListener('click', () => { reach(2); goTo(2); });

// ------------------------- Step 2: Simulation -------------------------
$('#sim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#s-warn');
  const balance = parseNum($('#s-balance').value);
  const lump = parseNum($('#s-lump').value) || 0;
  const newRate = parseNum($('#s-newrate').value) || 0;
  const newDate = $('#s-newdate').value || null;
  const extra = parseNum($('#s-extra').value) || 0;

  const pairBad = (newRate > 0 && !newDate) || (newDate && newRate === 0);
  if (!(balance > 0)) { showWarn(warn, 'Balance must be greater than 0.'); return; }
  if (pairBad) { showWarn(warn, 'Both the new mortgage rate and the date it kicks in must be provided together.'); return; }
  showWarn(warn, lump > balance ? 'Note: lump sum exceeds the balance.' : '');

  const inputs = { interestRate: state.mortgage.inputs.interestRate, yearsLeft: state.mortgage.inputs.yearsLeft, startDate: state.mortgage.inputs.startDate, balance, additionalRepayment: extra, lumpSum: lump, newRate, newRateDate: newDate };
  let data;
  try { data = await api('/api/simulate', inputs); }
  catch (err) { showWarn(warn, err.message); return; }

  state.sim = { inputs, data };
  const res = $('#s-result');
  res.hidden = false;
  res.innerHTML = `Interest saved <strong>${fmtMoney(data.interestSavings)}</strong> · `
    + `months saved <strong>${data.monthsSaved}</strong> · new payoff <strong>${data.withNew.endDate}</strong>`;
  $('#s-next').disabled = false;
});
$('#s-skip').addEventListener('click', () => { state.sim = null; $('#s-result').hidden = true; $('#s-next').disabled = true; reach(3); goTo(3); });
$('#s-next').addEventListener('click', () => { reach(3); goTo(3); });

// ------------------------- Step 3: Savings -------------------------
$('#sav-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#v-warn');
  const principal = parseNum($('#v-amount').value);
  if (Number.isNaN(principal)) { showWarn(warn, 'Please enter a valid number for the Amount of Savings.'); return; }
  showWarn(warn, '');

  const inputs = {
    principal,
    annualRate: parseNum($('#v-rate').value),
    inflationRate: parseNum($('#v-infl').value),
    years: parseInt($('#v-years').value, 10),
    includeInflation: $('#v-inflation').checked,
  };
  let data;
  try { data = await api('/api/savings', inputs); }
  catch (err) { showWarn(warn, err.message); return; }

  state.savings = { inputs, data };
  const res = $('#v-result');
  res.hidden = false;
  res.innerHTML = `Final balance <strong>${fmtMoney(data.finalBalance)}</strong> · total interest <strong>${fmtMoney(data.totalInterest)}</strong> over <strong>${data.rows.length}</strong> years`;
  $('#v-next').disabled = false;
});
$('#v-skip').addEventListener('click', () => { state.savings = null; $('#v-result').hidden = true; reach(4); goTo(4); });
$('#v-next').addEventListener('click', () => { reach(4); goTo(4); });

// ------------------------- Report assembly -------------------------
function stat(label, value, cls = '') {
  return `<div class="stat"><span class="stat__label">${label}</span><span class="stat__value ${cls}">${value}</span></div>`;
}

const SCHED_COLS = [
  { key: 'Date', label: 'Date' },
  { key: 'Principal Payment', label: 'Principal', fmt: fmtNum },
  { key: 'Interest Payment', label: 'Interest', fmt: fmtNum },
  { key: 'Total Payment', label: 'Total', fmt: fmtNum },
  { key: 'Remaining Balance', label: 'Remaining', fmt: fmtNum },
];

function ledgerHtml(rows, cols, unit = 'rows') {
  const head = `<thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>`;
  const renderRow = (r) => `<tr>${cols.map((c) => `<td>${c.fmt ? c.fmt(r[c.key]) : r[c.key]}</td>`).join('')}</tr>`;
  let body;
  if (rows.length > 26) {
    body = rows.slice(0, 12).map(renderRow).join('')
      + `<tr class="gap"><td colspan="${cols.length}">⋯ ${rows.length - 24} ${unit} ⋯</td></tr>`
      + rows.slice(-12).map(renderRow).join('');
  } else {
    body = rows.map(renderRow).join('');
  }
  return `<div class="table-wrap"><table class="ledger">${head}<tbody>${body}</tbody></table></div>`;
}

function mdToHtml(md) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split('\n\n').map((p) => '<p>' + p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>').join('');
}

function csvDownload(filename, rows, cols) {
  const header = cols.map((c) => c.label).join(',');
  const lines = rows.map((r) => cols.map((c) => r[c.key]).join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildReport() {
  if (!state.mortgage) { goTo(1); return; }
  disposeAll();

  const m = state.mortgage;
  const i = m.inputs;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sched = m.data.schedule;

  // --- Parameters strip ---
  const params = [
    ['Rate', i.interestRate.toFixed(2) + '%'],
    ['Term', i.yearsLeft + ' yrs'],
    ['Balance', fmtMoney(i.balance)],
    i.propertyValue ? ['Property', fmtMoney(i.propertyValue)] : null,
    m.data.ltv != null ? ['LTV', m.data.ltv.toFixed(2) + '%'] : null,
    ['Currency', state.currency],
  ].filter(Boolean);

  // --- Section I: Repayment ---
  let html = `
    <header class="report__masthead">
      <div class="masthead__rule masthead__rule--top"></div>
      <h1 class="report__title">The Mortgage Report</h1>
      <p class="report__dateline">Prepared ${today} · An editorial repayment &amp; savings brief</p>
      <div class="masthead__rule masthead__rule--bottom"></div>
    </header>

    <div class="param-strip">
      ${params.map(([k, v]) => `<span class="param"><span class="param__k">${k}</span><span class="param__v">${v}</span></span>`).join('')}
    </div>

    <section class="report__section">
      <h2 class="report__h">I · Repayment Overview</h2>
      <div class="stat-row">
        ${stat('Monthly Payment', fmtMoney(sched[0]['Total Payment']))}
        ${stat('Total Interest', fmtMoney(m.data.totalInterestPaid), 'accent')}
        ${stat('Total Principal', fmtMoney(m.data.totalPrincipalPaid))}
        ${stat('Payoff', m.data.payoffDate)}
      </div>
      <div class="report__figs">
        <figure class="fig fig--wide">
          <figcaption>Fig. 1 — Monthly payment composition</figcaption>
          <div class="chart" id="rep-amort"></div>
        </figure>
        <figure class="fig fig--narrow">
          <figcaption>Fig. 2 — Principal vs interest</figcaption>
          <div class="chart chart--donut" id="rep-donut"></div>
        </figure>
      </div>
      <h3 class="report__h3">Repayment schedule <button type="button" class="link-btn no-print" id="rep-csv">Export CSV</button></h3>
      ${ledgerHtml(sched, SCHED_COLS, 'months')}
    </section>`;

  // --- Section II: Scenario (optional) ---
  if (state.sim) {
    const s = state.sim.data;
    html += `
      <section class="report__section page-break">
        <h2 class="report__h">II · Scenario Analysis</h2>
        <div class="dropcap-body">${mdToHtml(s.summary)}</div>
        <div class="stat-row">
          ${stat('Interest Saved', fmtMoney(s.interestSavings), s.interestSavings >= 0 ? 'good' : 'accent')}
          ${stat('Months Saved', String(s.monthsSaved), s.monthsSaved > 0 ? 'good' : '')}
          ${stat('New Total Interest', fmtMoney(s.withNew.totalInterestPaid))}
          ${stat('New Payoff', s.withNew.endDate)}
        </div>
        <figure class="fig fig--full">
          <figcaption>Fig. 3 — Remaining balance: baseline vs scenario</figcaption>
          <div class="chart" id="rep-overlay"></div>
        </figure>
        <h3 class="report__h3">Baseline vs scenario</h3>
        ${ledgerHtml([
          { Item: 'Total principal', Baseline: s.baseline.totalPrincipalPaid, Scenario: s.withNew.totalPrincipalPaid },
          { Item: 'Total interest', Baseline: s.baseline.totalInterestPaid, Scenario: s.withNew.totalInterestPaid },
          { Item: 'Total repaid', Baseline: s.baseline.totalPrincipalPaid + s.baseline.totalInterestPaid, Scenario: s.withNew.totalPrincipalPaid + s.withNew.totalInterestPaid },
          { Item: 'Payoff date', Baseline: s.baseline.endDate, Scenario: s.withNew.endDate },
        ], [
          { key: 'Item', label: 'Item' },
          { key: 'Baseline', label: 'Baseline', fmt: (v) => (typeof v === 'number' ? fmtNum(v) : v) },
          { key: 'Scenario', label: 'Scenario', fmt: (v) => (typeof v === 'number' ? fmtNum(v) : v) },
        ])}
      </section>`;
  }

  // --- Section III: Savings (optional) ---
  if (state.savings) {
    const v = state.savings.data;
    const SAV_COLS = [
      { key: 'Year', label: 'Year' },
      { key: 'Interest Accrued', label: 'Interest', fmt: fmtNum },
      { key: 'Inflation Adjustment', label: 'Inflation Adj.', fmt: fmtNum },
      { key: 'Running Balance', label: 'Balance', fmt: fmtNum },
    ];
    html += `
      <section class="report__section page-break">
        <h2 class="report__h">III · Savings Outlook</h2>
        <p class="report__note">${state.savings.inputs.includeInflation ? 'Shown in <em>real</em> terms (inflation-adjusted).' : 'Nominal terms (inflation not applied).'}</p>
        <div class="stat-row">
          ${stat('Total Interest', fmtMoney(v.totalInterest), 'good')}
          ${stat('Final Balance', fmtMoney(v.finalBalance))}
          ${stat('Years', String(v.rows.length))}
        </div>
        <figure class="fig fig--full">
          <figcaption>Fig. 4 — Projected balance by year</figcaption>
          <div class="chart" id="rep-savings"></div>
        </figure>
        ${ledgerHtml(v.rows, SAV_COLS, 'years')}
      </section>`;
  }

  html += `
    <footer class="report__footer">
      <div class="masthead__rule"></div>
      <p>The Mortgage Report — generated ${today}. Figures are estimates produced by amortization and compound-interest models, not financial advice. Verify with your lender before acting.</p>
    </footer>`;

  $('#report').innerHTML = html;

  // Init charts on the freshly-built DOM.
  amortChart($('#rep-amort'), sched, sym());
  splitDonut($('#rep-donut'), m.data.totalPrincipalPaid, m.data.totalInterestPaid, sym());
  if (state.sim) overlayChart($('#rep-overlay'), state.sim.data.baseline.schedule, state.sim.data.withNew.schedule, sym());
  if (state.savings) savingsChart($('#rep-savings'), state.savings.data.rows, sym());

  const csv = $('#rep-csv');
  if (csv) csv.onclick = () => csvDownload('mortgage-schedule.csv', sched, SCHED_COLS);
  setTimeout(resizeAll, 60);
}

// ------------------------- Report toolbar -------------------------
$('#r-pdf').addEventListener('click', () => window.print());
$('#r-restart').addEventListener('click', () => {
  state.mortgage = state.sim = state.savings = null;
  Object.keys(MAX_REACHED).forEach((k) => { if (k !== '1') delete MAX_REACHED[k]; });
  ['#m-result', '#s-result', '#v-result'].forEach((s) => { $(s).hidden = true; });
  ['#m-next', '#s-next', '#v-next'].forEach((s) => { $(s).disabled = true; });
  goTo(1);
});

// ------------------------- Currency -------------------------
$('#currency-select').addEventListener('change', (e) => {
  state.currency = e.target.value;
  if (current === 4) buildReport();
});

// ------------------------- Boot -------------------------
(function stampDate() {
  const d = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  $('#masthead-date').textContent = d.toUpperCase();
})();
updateLtv();
