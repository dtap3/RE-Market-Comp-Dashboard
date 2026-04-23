// explorer.js — Explorer tab

import { MARKETS, formatValue } from '../dataLoader.js';

let explorerChart = null;

const state = {
  selectedMarkets: new Set(MARKETS.map(m => m.id)),
  category:   'housingOccupancy',
  metric:     null,
  year:       '2024',
  tenure:     'total',
  chartType:  'bar',
};

// ── Category definitions ─────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'housingOccupancy',  label: 'Housing Occupancy',        section: 'HOUSING OCCUPANCY',          src: 'data',   fmt: 'number' },
  { key: 'unitsInStructure',  label: 'Units in Structure',        section: 'UNITS IN STRUCTURE',         src: 'data',   fmt: 'number' },
  { key: 'yearBuilt',         label: 'Year Structure Built',      section: 'YEAR STRUCTURE BUILT',       src: 'data',   fmt: 'number' },
  { key: 'bedrooms',          label: 'Bedrooms',                  section: 'BEDROOMS',                   src: 'data',   fmt: 'number' },
  { key: 'vehicles',          label: 'Vehicles Available',        section: 'VEHICLES AVAILABLE',         src: 'data',   fmt: 'number' },
  { key: 'homeValue',         label: 'Home Value Distribution',   section: 'VALUE',                      src: 'data',   fmt: 'number' },
  { key: 'grossRent',         label: 'Gross Rent Distribution',   section: 'GROSS RENT',                 src: 'data',   fmt: 'number' },
  { key: 'incomeDist',        label: 'Income Distribution',       section: null,                         src: 'income', fmt: 'number', hasTenure: true },
  { key: 'raceEthnicity',     label: 'Race & Ethnicity',          section: 'RACE',                       src: 'pop',    fmt: 'percent' },
  { key: 'sexAge',            label: 'Sex & Age',                 section: 'SEX AND AGE',                src: 'pop',    fmt: 'number' },
  { key: 'housingCosts',      label: 'Selected Monthly Costs',    section: 'SELECTED MONTHLY OWNER',     src: 'data',   fmt: 'dollar' },
];

export function initExplorer() {
  buildMarketCheckboxes();
  buildCategoryDropdown();
  buildToggleListeners();
  updateMetricDropdown();
  renderExplorer();
}

// ── UI builders ───────────────────────────────────────────────────────────────

function buildMarketCheckboxes() {
  const container = document.getElementById('market-checkboxes');
  MARKETS.forEach(mkt => {
    const label = document.createElement('label');
    label.className = 'market-checkbox checked';
    label.dataset.id = mkt.id;
    label.innerHTML = `
      <input type="checkbox" checked>
      <span class="dot" style="background:${mkt.color}"></span>
      ${mkt.short}
    `;
    label.addEventListener('click', () => {
      const input = label.querySelector('input');
      input.checked = !input.checked;
      if (input.checked) {
        state.selectedMarkets.add(mkt.id);
        label.classList.add('checked');
      } else {
        if (state.selectedMarkets.size <= 1) return; // keep at least 1
        state.selectedMarkets.delete(mkt.id);
        label.classList.remove('checked');
      }
      renderExplorer();
    });
    container.appendChild(label);
  });
}

function buildCategoryDropdown() {
  const sel = document.getElementById('exp-category');
  CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.key;
    opt.textContent = cat.label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', e => {
    state.category = e.target.value;
    updateMetricDropdown();
    updateTenureVisibility();
    renderExplorer();
  });
}

function buildToggleListeners() {
  // Year
  document.querySelectorAll('#exp-year-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#exp-year-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.year = btn.dataset.year;
      updateMetricDropdown();
      renderExplorer();
    });
  });

  // Tenure
  document.querySelectorAll('#exp-tenure-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#exp-tenure-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tenure = btn.dataset.tenure;
      renderExplorer();
    });
  });

  // Chart type
  document.querySelectorAll('#exp-chart-type .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#exp-chart-type .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chartType = btn.dataset.type;
      renderExplorer();
    });
  });

  // Metric
  document.getElementById('exp-metric').addEventListener('change', e => {
    state.metric = e.target.value;
    renderExplorer();
  });
}

function updateMetricDropdown() {
  const sel = document.getElementById('exp-metric');
  sel.innerHTML = '';

  const metrics = getMetricOptions();
  metrics.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = m.key;
    opt.textContent = m.label;
    sel.appendChild(opt);
  });
  state.metric = metrics[0]?.key || null;
}

function updateTenureVisibility() {
  const cat = CATEGORIES.find(c => c.key === state.category);
  document.getElementById('tenure-group').style.display = cat?.hasTenure ? '' : 'none';
}

function getMetricOptions() {
  const cat = CATEGORIES.find(c => c.key === state.category);
  if (!cat) return [];

  if (cat.src === 'income') {
    return [
      { key: '__full_distribution__', label: 'Full Distribution (All Brackets)' },
      ...window.dashData.raw.income2024.brackets.map(b => ({ key: b, label: b })),
      { key: 'medianIncome', label: 'Median Household Income' },
    ];
  }

  // Get rows from appropriate data sheet
  const rows = getDataRows(cat);
  const seen = new Set();
  const options = [];

  // Add "Full Distribution" first for distribution categories
  const distCats = ['homeValue', 'grossRent', 'unitsInStructure', 'yearBuilt', 'bedrooms', 'vehicles', 'raceEthnicity', 'sexAge'];
  if (distCats.includes(state.category)) {
    options.push({ key: '__full_distribution__', label: 'Full Distribution (All Rows)' });
  }

  rows.forEach(row => {
    if (!seen.has(row.label)) {
      seen.add(row.label);
      options.push({ key: row.label, label: row.label });
    }
  });

  return options;
}

// ── Data extraction ───────────────────────────────────────────────────────────

function getDataRows(cat) {
  if (!cat) return [];
  const raw = window.dashData.raw;
  let source;

  if (cat.src === 'data') {
    source = state.year === '2020' ? raw.data2020 : raw.data2024;
    if (state.year === 'both') source = raw.data2024; // default to 2024 for 'both' in data
  } else if (cat.src === 'pop') {
    source = state.year === '2020' ? raw.pop2020.flatRows : raw.pop2024.flatRows;
    if (state.year === 'both') source = raw.pop2024.flatRows;
  } else {
    return [];
  }

  // Filter by section
  if (cat.section) {
    const sectionUpper = cat.section.toUpperCase();
    return source.filter(row => {
      const s = (row.section || '').toUpperCase();
      return s.includes(sectionUpper) || s.startsWith(sectionUpper.substring(0, 10));
    });
  }

  return source;
}

function extractDataPoint(cat, metricKey, marketId, year) {
  const raw = window.dashData.raw;

  if (cat.src === 'income') {
    const incomeData = year === '2020' ? raw.income2020 : raw.income2024;
    const mktData = incomeData.markets[marketId];
    if (!mktData) return null;

    if (metricKey === 'medianIncome') return mktData.medianIncome;
    if (metricKey === '__full_distribution__') return null;

    const idx = incomeData.brackets.indexOf(metricKey);
    if (idx === -1) return null;

    const field = state.tenure === 'owner' ? 'ownerEst' : state.tenure === 'renter' ? 'renterEst' : 'totalEst';
    return mktData[field]?.[idx] ?? null;

  } else if (cat.src === 'data' || cat.src === 'pop') {
    const rows = getDataRows(cat);
    const row = rows.find(r => r.label === metricKey);
    if (!row) return null;
    const field = (cat.src === 'pop') ? 'pct' : 'estimate';
    return row[marketId]?.[field] ?? null;
  }

  return null;
}

function extractFullDistribution(cat, marketId, year) {
  const raw = window.dashData.raw;

  if (cat.src === 'income') {
    const incomeData = year === '2020' ? raw.income2020 : raw.income2024;
    const mktData = incomeData.markets[marketId];
    if (!mktData) return { labels: [], values: [] };
    const field = state.tenure === 'owner' ? 'ownerPct' : state.tenure === 'renter' ? 'renterPct' : 'totalPct';
    return { labels: incomeData.brackets, values: mktData[field] || [] };
  }

  const rows = getDataRows(cat);
  const field = cat.src === 'pop' ? 'pct' : 'estimate';
  return {
    labels: rows.map(r => r.label),
    values: rows.map(r => r[marketId]?.[field] ?? null),
  };
}

// ── Chart rendering ──────────────────────────────────────────────────────────

function renderExplorer() {
  if (!state.metric) return;

  const cat = CATEGORIES.find(c => c.key === state.category);
  if (!cat) return;

  const isFullDist = state.metric === '__full_distribution__';
  const selectedMkts = MARKETS.filter(m => state.selectedMarkets.has(m.id));

  if (isFullDist) {
    renderFullDistribution(cat, selectedMkts);
  } else if (state.year === 'both') {
    renderBothYears(cat, selectedMkts);
  } else {
    renderSingleMetric(cat, selectedMkts);
  }

  renderDataTable(cat, selectedMkts);
}

function destroyExplorerChart() {
  if (explorerChart) {
    explorerChart.destroy();
    explorerChart = null;
  }
}

function getCanvas() {
  return document.getElementById('explorer-canvas');
}

function renderSingleMetric(cat, selectedMkts) {
  destroyExplorerChart();
  const canvas = getCanvas();

  const labels = selectedMkts.map(m => m.label);
  const values = selectedMkts.map(m => extractDataPoint(cat, state.metric, m.id, state.year));
  const colors = selectedMkts.map(m => m.color);
  const fmt = cat.fmt;

  const isHoriz = state.chartType === 'horizontalBar';
  const isDonut = state.chartType === 'donut';
  const isLine  = state.chartType === 'line';

  if (isDonut) {
    explorerChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.map(c => c + 'CC'),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { color: '#ccc', padding: 16, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatValue(ctx.parsed, fmt)}` } },
        },
      },
    });
    return;
  }

  const type = isLine ? 'line' : 'bar';
  explorerChart = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        label: state.metric,
        data: values,
        backgroundColor: colors.map(c => c + 'BB'),
        borderColor: colors,
        borderWidth: isLine ? 2 : 1,
        tension: 0.3,
        pointRadius: isLine ? 5 : 0,
        pointBackgroundColor: colors,
      }],
    },
    options: {
      indexAxis: isHoriz ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatValue(ctx.parsed[isHoriz ? 'x' : 'y'], fmt) } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#888', font: { size: 11 }, callback: isHoriz ? v => formatValue(v, fmt) : undefined },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#888', font: { size: 11 }, callback: isHoriz ? undefined : v => formatValue(v, fmt) },
        },
      },
    },
  });
}

function renderBothYears(cat, selectedMkts) {
  destroyExplorerChart();
  const canvas = getCanvas();

  const labels = selectedMkts.map(m => m.short);
  const vals2020 = selectedMkts.map(m => extractDataPoint(cat, state.metric, m.id, '2020'));
  const vals2024 = selectedMkts.map(m => extractDataPoint(cat, state.metric, m.id, '2024'));
  const fmt = cat.fmt;

  explorerChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '2020',
          data: vals2020,
          backgroundColor: selectedMkts.map(m => m.color + '44'),
          borderColor:     selectedMkts.map(m => m.color + '88'),
          borderWidth: 1,
        },
        {
          label: '2024',
          data: vals2024,
          backgroundColor: selectedMkts.map(m => m.color + 'CC'),
          borderColor:     selectedMkts.map(m => m.color),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { color: '#888', boxWidth: 10, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatValue(ctx.parsed.y, fmt)}` } },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888' } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888', callback: v => formatValue(v, fmt) } },
      },
    },
  });
}

function renderFullDistribution(cat, selectedMkts) {
  destroyExplorerChart();
  const canvas = getCanvas();

  const isDonut = state.chartType === 'donut';
  const yr = state.year === 'both' ? '2024' : state.year;

  // For donut: only first selected market
  if (isDonut) {
    const mkt = selectedMkts[0];
    const { labels, values } = extractFullDistribution(cat, mkt.id, yr);
    const palette = generatePalette(mkt.color, labels.length);
    explorerChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: palette, borderColor: 'rgba(0,0,0,0.3)', borderWidth: 1 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { color: '#ccc', padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatValue(ctx.parsed, cat.fmt)}` } },
        },
      },
    });
    return;
  }

  // Stacked bar: markets on X, brackets as stacks
  const firstMkt = selectedMkts[0];
  const { labels: brackets } = extractFullDistribution(cat, firstMkt.id, yr);
  const bracketColors = generatePalette('#DC143C', brackets.length);

  const datasets = brackets.map((bracket, bi) => ({
    label: bracket,
    data: selectedMkts.map(m => {
      const { values } = extractFullDistribution(cat, m.id, yr);
      return values[bi] ?? null;
    }),
    backgroundColor: bracketColors[bi] + 'CC',
    borderColor: bracketColors[bi],
    borderWidth: 1,
  }));

  const isHoriz = state.chartType === 'horizontalBar';

  explorerChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: selectedMkts.map(m => m.short),
      datasets,
    },
    options: {
      indexAxis: isHoriz ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { color: '#888', boxWidth: 10, padding: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatValue(ctx.parsed[isHoriz ? 'x' : 'y'], cat.fmt)}` } },
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888' } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888', callback: isHoriz ? undefined : v => formatValue(v, cat.fmt) } },
      },
    },
  });
}

// ── Data table ───────────────────────────────────────────────────────────────

function renderDataTable(cat, selectedMkts) {
  const wrap = document.getElementById('explorer-table-wrap');
  wrap.innerHTML = '';

  const isFullDist = state.metric === '__full_distribution__';
  const yr = (state.year === 'both') ? null : state.year;
  const fmt = cat.fmt;

  let tableRows = [];
  let colHeaders = [];

  if (state.year === 'both' && !isFullDist) {
    // Columns: Market | 2020 | 2024
    colHeaders = ['Market', '2020', '2024'];
    tableRows = selectedMkts.map(m => ({
      label: m.label,
      vals: [
        formatValue(extractDataPoint(cat, state.metric, m.id, '2020'), fmt),
        formatValue(extractDataPoint(cat, state.metric, m.id, '2024'), fmt),
      ],
    }));
  } else if (isFullDist) {
    const yrs = state.year === 'both' ? ['2024'] : [state.year];
    const yVal = yrs[0];
    const { labels: brackets } = extractFullDistribution(cat, selectedMkts[0].id, yVal);
    colHeaders = ['Bracket', ...selectedMkts.map(m => m.short)];
    tableRows = brackets.map((bracket, bi) => ({
      label: bracket,
      vals: selectedMkts.map(m => {
        const { values } = extractFullDistribution(cat, m.id, yVal);
        return formatValue(values[bi], fmt);
      }),
    }));
  } else {
    // Columns: Market | Value
    const yVal = yr || '2024';
    colHeaders = ['Market', yVal];
    tableRows = selectedMkts.map(m => ({
      label: m.label,
      vals: [formatValue(extractDataPoint(cat, state.metric, m.id, yVal), fmt)],
    }));
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead><tr>${colHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows.map(r =>
      `<tr><td>${r.label}</td>${r.vals.map(v => `<td>${v}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  `;
  wrap.appendChild(table);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function generatePalette(baseColor, count) {
  // Generate a gradient palette from dark crimson → light crimson-pink
  const colors = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const r = Math.round(lerp(0x6b, 0xff, t));
    const g = Math.round(lerp(0x07, 0x4d, t));
    const b = Math.round(lerp(0x12, 0x4d, t));
    colors.push(`rgb(${r},${g},${b})`);
  }
  return colors;
}

function lerp(a, b, t) { return a + (b - a) * t; }
