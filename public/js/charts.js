// ECharts wiring — fine-line editorial styling, responsive.
/* global echarts */

const INK = '#16140f';
const FAINT = '#6b675c';
const RULE = '#c9c2af';
const ACCENT = '#9c2b1b';
const ACCENT_SOFT = '#c66a52';
const GOOD = '#2e5d3b';
const PAPER = 'transparent';

const instances = new Map();

function chart(el) {
  if (!el) return null;
  let inst = instances.get(el);
  if (!inst) {
    inst = echarts.init(el, null, { renderer: 'svg' });
    instances.set(el, inst);
  }
  return inst;
}

const baseGrid = { left: 64, right: 18, top: 30, bottom: 40 };

const axisCommon = {
  axisLine: { lineStyle: { color: INK } },
  axisTick: { lineStyle: { color: RULE } },
  axisLabel: { color: FAINT, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10 },
  splitLine: { lineStyle: { color: RULE, type: 'dashed', opacity: 0.6 } },
};

function tooltip(symbol) {
  return {
    trigger: 'axis',
    backgroundColor: '#16140f',
    borderColor: '#16140f',
    textStyle: { color: '#f4f0e6', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
    valueFormatter: (v) => (v == null ? '' : symbol + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })),
  };
}

const legend = {
  textStyle: { color: INK, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
  itemWidth: 18,
  itemHeight: 2,
  top: 0,
};

// Down-sample a long monthly series to ~one point per quarter for clarity.
function sample(arr, step) {
  if (arr.length <= 180) return arr.map((_, i) => i);
  const idx = [];
  for (let i = 0; i < arr.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== arr.length - 1) idx.push(arr.length - 1);
  return idx;
}

/** Fig 1 — principal / interest / total over time. */
export function amortChart(el, schedule, symbol) {
  const c = chart(el);
  if (!c) return;
  const idx = sample(schedule, 3);
  const dates = idx.map((i) => schedule[i].Date);
  const principal = idx.map((i) => schedule[i]['Principal Payment']);
  const interest = idx.map((i) => schedule[i]['Interest Payment']);
  const total = idx.map((i) => schedule[i]['Total Payment']);

  c.setOption({
    backgroundColor: PAPER,
    grid: baseGrid,
    legend: { ...legend, data: ['Principal', 'Interest', 'Total'] },
    tooltip: tooltip(symbol),
    xAxis: { type: 'category', data: dates, ...axisCommon },
    yAxis: { type: 'value', ...axisCommon },
    series: [
      { name: 'Principal', type: 'line', data: principal, showSymbol: false, lineStyle: { width: 1.5, color: INK } },
      { name: 'Interest', type: 'line', data: interest, showSymbol: false, lineStyle: { width: 1.5, color: ACCENT } },
      { name: 'Total', type: 'line', data: total, showSymbol: false, lineStyle: { width: 1, color: FAINT, type: 'dashed' } },
    ],
  }, true);
}

/** Fig 2 — principal vs interest donut. */
export function splitDonut(el, principal, interest, symbol) {
  const c = chart(el);
  if (!c) return;
  c.setOption({
    backgroundColor: PAPER,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#16140f',
      textStyle: { color: '#f4f0e6', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
      valueFormatter: (v) => symbol + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    legend: {
      bottom: 0, top: 'auto',
      icon: 'roundRect', itemWidth: 13, itemHeight: 13, itemGap: 18,
      textStyle: { color: INK, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
      data: [
        { name: 'Principal', itemStyle: { color: INK } },
        { name: 'Interest', itemStyle: { color: ACCENT } },
      ],
    },
    series: [{
      type: 'pie',
      radius: ['52%', '76%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: '#fffdf7', borderWidth: 2 },
      label: { show: true, formatter: '{d}%', color: INK, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
      data: [
        { value: principal, name: 'Principal', itemStyle: { color: INK } },
        { value: interest, name: 'Interest', itemStyle: { color: ACCENT } },
      ],
    }],
  }, true);
}

/** Fig 3 — remaining balance, baseline vs new. */
export function overlayChart(el, baseSched, newSched, symbol) {
  const c = chart(el);
  if (!c) return;
  const idx = sample(baseSched, 3);
  const dates = idx.map((i) => baseSched[i].Date);
  const oldBal = idx.map((i) => baseSched[i]['Remaining Balance']);
  const newBal = idx.map((i) => (newSched[i] ? newSched[i]['Remaining Balance'] : 0));

  c.setOption({
    backgroundColor: PAPER,
    grid: baseGrid,
    legend: { ...legend, data: ['Old Parameters', 'New Parameters'] },
    tooltip: tooltip(symbol),
    xAxis: { type: 'category', data: dates, ...axisCommon },
    yAxis: { type: 'value', ...axisCommon },
    series: [
      { name: 'Old Parameters', type: 'line', data: oldBal, showSymbol: false, lineStyle: { width: 1.2, color: FAINT, type: 'dashed' } },
      {
        name: 'New Parameters', type: 'line', data: newBal, showSymbol: false,
        lineStyle: { width: 2, color: ACCENT },
        areaStyle: { color: 'rgba(156,43,27,0.07)' },
      },
    ],
  }, true);
}

/** Fig 4 — savings growth bars + balance line. */
export function savingsChart(el, rows, symbol) {
  const c = chart(el);
  if (!c) return;
  const years = rows.map((r) => 'Y' + r.Year);
  const balance = rows.map((r) => r['Running Balance']);
  const interest = rows.map((r) => r['Interest Accrued']);

  c.setOption({
    backgroundColor: PAPER,
    grid: baseGrid,
    legend: { ...legend, data: ['Running Balance', 'Interest Accrued'] },
    tooltip: tooltip(symbol),
    xAxis: { type: 'category', data: years, ...axisCommon },
    yAxis: { type: 'value', ...axisCommon },
    series: [
      { name: 'Running Balance', type: 'bar', data: balance, itemStyle: { color: INK }, barWidth: '55%' },
      { name: 'Interest Accrued', type: 'line', data: interest, showSymbol: false, lineStyle: { width: 1.5, color: ACCENT } },
    ],
  }, true);
}

/** Resize all live charts (call on window resize / step change). */
export function resizeAll() {
  for (const inst of instances.values()) inst.resize();
}

/** Dispose every chart instance — call before re-assembling the report DOM. */
export function disposeAll() {
  for (const inst of instances.values()) inst.dispose();
  instances.clear();
}

window.addEventListener('resize', resizeAll);
// Re-fit charts for the print/PDF page geometry, then restore.
window.addEventListener('beforeprint', resizeAll);
window.addEventListener('afterprint', resizeAll);
