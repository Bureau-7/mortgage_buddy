// The Mortgage Report — SPA controller.
import { amortChart, splitDonut, overlayChart, savingsChart, resizeAll } from './charts.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---- Shared client state (mirrors Streamlit session_state) ----
const state = {
  currency: 'GBP',
  interestRate: 3.5,
  yearsLeft: 30,
  startDate: null,
  balance: 250000,
  lastMortgage: null,
  simulation: null, // populated after Run Simulation, feeds the Savings summary card
};

const CURRENCY = {
  GBP: { symbol: '£', locale: 'en-GB' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
};

function fmtMoney(n) {
  const c = CURRENCY[state.currency];
  return c.symbol + Number(n).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  const c = CURRENCY[state.currency];
  return Number(n).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseNum(str) {
  return parseFloat(String(str).replace(/,/g, ''));
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, currency: state.currency }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { warnings: data.warnings });
  return data;
}

function showWarn(el, msg) {
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = msg;
}

// ---------------- Tab routing ----------------
function setTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  if (name === 'savings') renderMortgageCard();
  setTimeout(resizeAll, 60);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

// ---------------- Stat helpers ----------------
function stat(label, value, cls = '') {
  return `<div class="stat"><span class="stat__label">${label}</span><span class="stat__value ${cls}">${value}</span></div>`;
}

// Render a schedule table: first 12 + last 12 rows with an ellipsis gap.
function ledger(table, rows, cols, unit = 'rows') {
  const head = `<thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>`;
  const renderRow = (r) => `<tr>${cols.map((c) => `<td>${c.fmt ? c.fmt(r[c.key]) : r[c.key]}</td>`).join('')}</tr>`;
  let bodyRows;
  if (rows.length > 26) {
    const head12 = rows.slice(0, 12).map(renderRow).join('');
    const tail12 = rows.slice(-12).map(renderRow).join('');
    bodyRows = head12 + `<tr class="gap"><td colspan="${cols.length}">⋯ ${rows.length - 24} ${unit} ⋯</td></tr>` + tail12;
  } else {
    bodyRows = rows.map(renderRow).join('');
  }
  table.innerHTML = head + `<tbody>${bodyRows}</tbody>`;
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

const SCHED_COLS = [
  { key: 'Date', label: 'Date' },
  { key: 'Principal Payment', label: 'Principal', fmt: fmtNum },
  { key: 'Interest Payment', label: 'Interest', fmt: fmtNum },
  { key: 'Total Payment', label: 'Total', fmt: fmtNum },
  { key: 'Remaining Balance', label: 'Remaining', fmt: fmtNum },
];

// ---------------- Live LTV ----------------
function updateLtv() {
  const bal = parseNum($('#m-balance').value);
  const val = parseNum($('#m-value').value);
  const out = $('#m-ltv').querySelector('strong');
  if (val > 0 && bal > 0) {
    out.textContent = ((bal / val) * 100).toFixed(2) + '%';
  } else {
    out.textContent = '—';
  }
}
['#m-balance', '#m-value'].forEach((s) => $(s).addEventListener('input', updateLtv));

// ---------------- Tab I: Mortgage ----------------
$('#mortgage-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#m-warn');
  const balance = parseNum($('#m-balance').value);
  if (!(balance > 0)) { showWarn(warn, 'Current Mortgage Balance must be greater than 0.'); return; }
  showWarn(warn, '');

  state.interestRate = parseNum($('#m-rate').value);
  state.yearsLeft = parseInt($('#m-years').value, 10);
  state.startDate = $('#m-start').value || null;
  state.balance = balance;

  let data;
  try {
    data = await api('/api/mortgage', {
      interestRate: state.interestRate,
      yearsLeft: state.yearsLeft,
      balance,
      startDate: state.startDate,
      propertyValue: parseNum($('#m-value').value) || null,
    });
  } catch (err) { showWarn(warn, err.message); return; }

  state.lastMortgage = data;
  $('#m-placeholder').hidden = true;
  $('#m-results').hidden = false;

  const sym = CURRENCY[state.currency].symbol;
  const sched = data.schedule;
  $('#m-stats').innerHTML =
    stat('Monthly Payment', fmtMoney(sched[0]['Total Payment'])) +
    stat('Total Interest', fmtMoney(data.totalInterestPaid), 'accent') +
    stat('Total Principal', fmtMoney(data.totalPrincipalPaid)) +
    stat('Payoff', data.payoffDate) +
    (data.ltv != null ? stat('LTV', data.ltv.toFixed(2) + '%') : '');

  amortChart($('#chart-amort'), sched, sym);
  splitDonut($('#chart-split'), data.totalPrincipalPaid, data.totalInterestPaid, sym);
  ledger($('#m-table'), sched, SCHED_COLS, 'months');

  $('#m-csv').onclick = () => csvDownload('mortgage-schedule.csv', sched, SCHED_COLS);
  $('#m-print').onclick = () => window.print();
  setTimeout(resizeAll, 40);
});

// ---------------- Tab II: Simulation ----------------
$('#sim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#s-warn');
  const balance = parseNum($('#s-balance').value);
  const lump = parseNum($('#s-lump').value) || 0;
  const newRate = parseNum($('#s-newrate').value) || 0;
  const newDate = $('#s-newdate').value || null;

  const msgs = [];
  if (lump > balance) msgs.push('Lump sum payment exceeds the mortgage balance.');
  if ((newRate > 0 && !newDate) || (newDate && newRate === 0)) {
    msgs.push('Both the new mortgage rate and the date it kicks in must be provided together.');
  }
  if (!(balance > 0)) { showWarn(warn, 'Current Mortgage Balance must be greater than 0.'); return; }
  if ((newRate > 0 && !newDate) || (newDate && newRate === 0)) { showWarn(warn, msgs.join(' ')); return; }
  showWarn(warn, msgs.join(' '));

  let data;
  try {
    data = await api('/api/simulate', {
      interestRate: state.interestRate,
      yearsLeft: state.yearsLeft,
      startDate: state.startDate,
      balance,
      additionalRepayment: parseNum($('#s-extra').value) || 0,
      lumpSum: lump,
      newRate,
      newRateDate: newDate,
    });
  } catch (err) { showWarn(warn, err.message); return; }

  state.simulation = {
    ...data,
    additionalRepayment: parseNum($('#s-extra').value) || 0,
    lumpSum: lump,
    newRate,
    newRateDate: newDate,
  };
  state.yearsLeft = state.yearsLeft; // carried

  $('#s-placeholder').hidden = true;
  $('#s-results').hidden = false;

  $('#s-summary').innerHTML = mdToHtml(data.summary);
  $('#s-stats').innerHTML =
    stat('Interest Saved', fmtMoney(data.interestSavings), data.interestSavings >= 0 ? 'good' : 'accent') +
    stat('Months Saved', String(data.monthsSaved), data.monthsSaved > 0 ? 'good' : '') +
    stat('New Total Interest', fmtMoney(data.withNew.totalInterestPaid)) +
    stat('New Payoff', data.withNew.endDate);

  overlayChart($('#chart-overlay'), data.baseline.schedule, data.withNew.schedule, CURRENCY[state.currency].symbol);
  setTimeout(resizeAll, 40);
});

// ---------------- Tab III: Savings ----------------
$('#sav-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const warn = $('#v-warn');
  const principal = parseNum($('#v-amount').value);
  if (Number.isNaN(principal)) { showWarn(warn, 'Please enter a valid number for the Amount of Savings.'); return; }
  showWarn(warn, '');

  let data;
  try {
    data = await api('/api/savings', {
      principal,
      annualRate: parseNum($('#v-rate').value),
      inflationRate: parseNum($('#v-infl').value),
      years: parseInt($('#v-years').value, 10),
      includeInflation: $('#v-inflation').checked,
    });
  } catch (err) { showWarn(warn, err.message); return; }

  $('#v-placeholder').hidden = true;
  $('#v-results').hidden = false;

  $('#v-stats').innerHTML =
    stat('Total Interest', fmtMoney(data.totalInterest), 'good') +
    stat('Final Balance', fmtMoney(data.finalBalance)) +
    stat('Years', String(data.rows.length));

  savingsChart($('#chart-savings'), data.rows, CURRENCY[state.currency].symbol);
  ledger($('#v-table'), data.rows, [
    { key: 'Year', label: 'Year' },
    { key: 'Interest Accrued', label: 'Interest', fmt: fmtNum },
    { key: 'Inflation Adjustment', label: 'Inflation Adj.', fmt: fmtNum },
    { key: 'Running Balance', label: 'Balance', fmt: fmtNum },
  ], 'years');
  setTimeout(resizeAll, 40);
});

// Prefill savings period from years_left when entering the tab.
function renderMortgageCard() {
  $('#v-years').value = state.yearsLeft;
  const dl = $('#mortgage-summary-dl');
  const s = state.simulation;
  if (!s) {
    dl.innerHTML = '<p class="muted">Run a simulation to populate this panel.</p>';
    return;
  }
  const row = (k, v) => `<div class="row"><dt>${k}</dt><dd>${v}</dd></div>`;
  dl.innerHTML =
    row('Total Principal (Old)', fmtMoney(s.baseline.totalPrincipalPaid)) +
    row('Total Interest (Old)', fmtMoney(s.baseline.totalInterestPaid)) +
    row('Total Principal (New)', fmtMoney(s.withNew.totalPrincipalPaid)) +
    row('Total Interest (New)', fmtMoney(s.withNew.totalInterestPaid)) +
    row('Additional Repayment', fmtMoney(s.additionalRepayment)) +
    row('New Rate', s.newRate.toFixed(2) + '%') +
    row('New Rate Date', s.newRateDate || 'N/A') +
    row('End Date (Old)', s.baseline.endDate) +
    row('End Date (New)', s.withNew.endDate) +
    row('Monthly Payment (New)', fmtMoney(s.withNew.finalMonthlyPayment)) +
    row('Lump Sum', fmtMoney(s.lumpSum));
}

// Minimal markdown: **bold** + paragraph breaks.
function mdToHtml(md) {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split('\n\n')
    .map((p) => '<p>' + p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>')
    .join('');
}

// ---------------- Currency ----------------
$('#currency-select').addEventListener('change', (e) => {
  state.currency = e.target.value;
  // Re-render whatever is visible by re-submitting active forms silently.
  if (state.lastMortgage) $('#mortgage-form').requestSubmit();
  if (state.simulation) $('#sim-form').requestSubmit();
  renderMortgageCard();
});

// Masthead date stamp.
(function stampDate() {
  const d = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  $('#masthead-date').textContent = d.toLocaleDateString('en-GB', opts).toUpperCase();
})();

updateLtv();
