// charts.js — Charts tab

import { MARKETS, formatValue, formatCAGR } from '../dataLoader.js';

// Chart.js global dark theme defaults
Chart.defaults.color = '#888';
Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
Chart.defaults.font.family = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size = 12;

const activeCharts = new Map();

let state = { adjusted: false };

const CHART_DEFS = [
  {
    key:      'population',
    title:    'Population',
    fmt:      'number',
    nomKey:   'population',
    adjKey:   null,
  },
  {
    key:      'housingUnits',
    title:    'Housing Units',
    fmt:      'number',
    nomKey:   'housingUnits',
    adjKey:   null,
  },
  {
    key:      'medianIncome',
    title:    'Median Household Income',
    fmt:      'dollar',
    nomKey:   'medianIncome',
    adjKey:   'adjMedianIncome',
  },
  {
    key:      'medianRent',
    title:    'Median Gross Rent',
    fmt:      'dollar',
    nomKey:   'medianRent',
    adjKey:   'adjMedianRent',
  },
  {
    key:      'medianHomeValue',
    title:    'Median Home Value',
    fmt:      'dollar',
    nomKey:   'medianHomeValue',
    adjKey:   'adjMedianHomeValue',
  },
  {
    key:      'vacancyRates',
    title:    'Vacancy Rates',
    fmt:      'percent',
    special:  'vacancy',
  },
];

const CAGR_METRICS = [
  { key: 'population',      label: 'Population',    isAbsoluteDelta: false },
  { key: 'housingUnits',    label: 'Housing Units',  isAbsoluteDelta: false },
  { key: 'medianIncome',    label: 'Median Income',  isAbsoluteDelta: false },
  { key: 'medianRent',      label: 'Median Rent',    isAbsoluteDelta: false },
  { key: 'medianHomeValue', label: 'Home Value',     isAbsoluteDelta: false },
];

export function initCharts() {
  buildAdjToggle();
  renderAllCharts();
}

function buildAdjToggle() {
  document.querySelectorAll('#adj-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#adj-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.adjusted = btn.dataset.adj === 'adjusted';
      renderAllCharts();
    });
  });
}

function renderAllCharts() {
  const grid = document.getElementById('charts-grid');
  grid.innerHTML = '';

  CHART_DEFS.forEach(def => {
    const card = buildChartCard(def);
    grid.appendChild(card);
  });

  // CAGR overview card (full width)
  const cagrCard = buildCagrOverviewCard();
  grid.appendChild(cagrCard);
}

function buildChartCard(def) {
  const card = document.createElement('div');
  card.className = 'chart-card';

  const activeKey = def.adjKey && state.adjusted ? def.adjKey : def.nomKey;
  const title     = def.title + (def.adjKey && state.adjusted ? ' (Adj.)' : '');

  // CAGR row
  let cagrHtml = '';
  if (def.special !== 'vacancy') {
    cagrHtml = '<div class="chart-cagr-row">' +
      MARKETS.map(mkt => {
        const d = window.dashData.summary[mkt.id]?.[activeKey];
        if (!d) return '';
        const str = formatCAGR(d.cagr, false);
        if (!str) return '';
        const cls = d.cagr > 0 ? 'positive' : d.cagr < 0 ? 'negative' : 'neutral';
        return `<span class="chart-cagr-item">
          <span class="mkt-dot" style="background:${mkt.color}"></span>
          ${mkt.short}: <span class="cagr-badge ${cls}" style="margin-left:3px">${str}</span>
        </span>`;
      }).join('') +
    '</div>';
  }

  const canvasId = `chart-${def.key}`;
  card.innerHTML = `
    <div class="chart-card-header">
      <div class="chart-card-title">${title}</div>
    </div>
    <div class="chart-canvas-wrap">
      <canvas id="${canvasId}" height="220"></canvas>
    </div>
    ${cagrHtml}
  `;

  // Render chart after DOM insert (use setTimeout so canvas is in DOM)
  setTimeout(() => {
    if (def.special === 'vacancy') {
      renderVacancyChart(canvasId);
    } else {
      renderGroupedBarChart(canvasId, activeKey, def.fmt);
    }
  }, 0);

  return card;
}

function renderGroupedBarChart(canvasId, metricKey, fmt) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  activeCharts.get(canvasId)?.destroy();

  const labels = MARKETS.map(m => m.short);
  const data2020 = MARKETS.map(m => window.dashData.summary[m.id]?.[metricKey]?.v2020 ?? null);
  const data2024 = MARKETS.map(m => window.dashData.summary[m.id]?.[metricKey]?.v2024 ?? null);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '2020',
          data: data2020,
          backgroundColor: MARKETS.map(m => m.color + '44'),
          borderColor:     MARKETS.map(m => m.color + '88'),
          borderWidth: 1,
        },
        {
          label: '2024',
          data: data2024,
          backgroundColor: MARKETS.map(m => m.color + 'CC'),
          borderColor:     MARKETS.map(m => m.color),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, padding: 14, color: '#888', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y;
              if (val === null) return '—';
              return `${ctx.dataset.label}: ${formatValue(val, fmt)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: '#888',
            font: { size: 11 },
            callback: v => formatValue(v, fmt),
          },
        },
      },
    },
  });
  activeCharts.set(canvasId, chart);
}

function renderVacancyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  activeCharts.get(canvasId)?.destroy();

  const labels = MARKETS.map(m => m.short);

  const hvr2020 = MARKETS.map(m => window.dashData.summary[m.id]?.homeownerVacancy?.v2020 ?? null);
  const hvr2024 = MARKETS.map(m => window.dashData.summary[m.id]?.homeownerVacancy?.v2024 ?? null);
  const rvr2020 = MARKETS.map(m => window.dashData.summary[m.id]?.rentalVacancy?.v2020 ?? null);
  const rvr2024 = MARKETS.map(m => window.dashData.summary[m.id]?.rentalVacancy?.v2024 ?? null);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Homeowner 2020', data: hvr2020, backgroundColor: 'rgba(220,20,60,0.25)', borderColor: 'rgba(220,20,60,0.5)', borderWidth: 1 },
        { label: 'Homeowner 2024', data: hvr2024, backgroundColor: 'rgba(220,20,60,0.8)',  borderColor: '#DC143C', borderWidth: 1 },
        { label: 'Rental 2020',    data: rvr2020, backgroundColor: 'rgba(255,107,107,0.25)', borderColor: 'rgba(255,107,107,0.5)', borderWidth: 1 },
        { label: 'Rental 2024',    data: rvr2024, backgroundColor: 'rgba(255,107,107,0.8)',  borderColor: '#FF6B6B', borderWidth: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, padding: 12, color: '#888', font: { size: 10 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return v !== null ? `${ctx.dataset.label}: ${v?.toFixed(1)}%` : '—';
            },
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888', font: { size: 11 } } },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#888', font: { size: 11 }, callback: v => v + '%' },
        },
      },
    },
  });
  activeCharts.set(canvasId, chart);
}

function buildCagrOverviewCard() {
  const card = document.createElement('div');
  card.className = 'chart-card full-width';
  const canvasId = 'chart-cagr-overview';

  card.innerHTML = `
    <div class="chart-card-header">
      <div class="chart-card-title">CAGR Overview — All Markets (2020 → 2024)</div>
    </div>
    <div class="chart-canvas-wrap">
      <canvas id="${canvasId}" height="180"></canvas>
    </div>
    <div style="font-size:0.6875rem;color:var(--text-muted);margin-top:4px">
      Compound Annual Growth Rate 2020–2024. Population and Housing Units reflect actual count growth.
    </div>
  `;

  setTimeout(() => renderCagrOverviewChart(canvasId), 0);
  return card;
}

function renderCagrOverviewChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  activeCharts.get(canvasId)?.destroy();

  const labels = CAGR_METRICS.map(m => m.label);

  const datasets = MARKETS.map(mkt => ({
    label: mkt.short,
    data: CAGR_METRICS.map(m => window.dashData.summary[mkt.id]?.[m.key]?.cagr ?? null),
    backgroundColor: mkt.color + 'BB',
    borderColor: mkt.color,
    borderWidth: 1,
  }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, padding: 14, color: '#888', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.x;
              return v !== null ? `${ctx.dataset.label}: ${v > 0 ? '+' : ''}${v?.toFixed(2)}%` : '—';
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: '#888',
            font: { size: 11 },
            callback: v => (v > 0 ? '+' : '') + v + '%',
          },
        },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#ccc', font: { size: 11 } } },
      },
    },
  });
  activeCharts.set(canvasId, chart);
}
