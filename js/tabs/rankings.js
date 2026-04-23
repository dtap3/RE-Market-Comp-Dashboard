// rankings.js — Rankings tab

import { MARKETS, RANKABLE_METRICS, formatValue, formatCAGR } from '../dataLoader.js';

let state = {
  metricKey: 'medianHomeValue',
  year:      '2024',
  sortDir:   'desc',
};

export function initRankings() {
  buildMetricDropdown();
  buildToggleGroups();
  render();
}

function buildMetricDropdown() {
  const sel = document.getElementById('rank-metric');
  RANKABLE_METRICS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.key;
    opt.textContent = m.label;
    if (m.key === state.metricKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', e => {
    state.metricKey = e.target.value;
    render();
  });
}

function buildToggleGroups() {
  // Year toggles
  document.querySelectorAll('#rank-year-group .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#rank-year-group .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.year = btn.dataset.val;
      render();
    });
  });

  // Sort toggles
  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sortDir = btn.dataset.sort;
      render();
    });
  });
}

function render() {
  const metaMeta = RANKABLE_METRICS.find(m => m.key === state.metricKey);
  if (!metaMeta) return;

  const summary = window.dashData.summary;

  // Auto-flip sort for lower-is-better metrics
  const effectiveSort = metaMeta.lowerIsBetter
    ? (state.sortDir === 'desc' ? 'asc' : 'desc')
    : state.sortDir;

  // Gather values
  const entries = MARKETS.map(mkt => {
    const d = summary[mkt.id]?.[state.metricKey] || {};
    let value;
    if (state.year === 'cagr') {
      value = d.cagr;
    } else if (state.year === '2024') {
      value = d.v2024;
    } else {
      value = d.v2020;
    }
    return { mkt, value, d };
  });

  // Sort
  entries.sort((a, b) => {
    const av = a.value ?? -Infinity;
    const bv = b.value ?? -Infinity;
    return effectiveSort === 'desc' ? bv - av : av - bv;
  });

  const maxVal = Math.max(...entries.map(e => Math.abs(e.value ?? 0)), 1);

  const container = document.getElementById('rank-cards');
  container.innerHTML = '';

  entries.forEach((entry, idx) => {
    const { mkt, value, d } = entry;
    const rank = idx + 1;
    const displayVal = formatValue(value, metaMeta.fmt === 'percent' && state.year === 'cagr' ? 'decimal' : metaMeta.fmt);
    const pct = value !== null ? Math.max((Math.abs(value) / maxVal) * 100, 2) : 2;

    // CAGR badge (only when showing a 2020/2024 value, not CAGR mode itself)
    let cagrHtml = '';
    if (state.year !== 'cagr' && d.cagr !== null) {
      const cagrStr = formatCAGR(d.cagr, metaMeta.isAbsoluteDelta);
      const cls = d.cagr > 0 ? 'positive' : d.cagr < 0 ? 'negative' : 'neutral';
      cagrHtml = `<span class="cagr-badge ${cls}">${cagrStr} CAGR</span>`;
    }

    const card = document.createElement('div');
    card.className = 'rank-card';
    card.innerHTML = `
      <div class="rank-badge ${rank === 1 ? 'rank-1' : ''}">${rank}</div>
      <div class="rank-market-info">
        <div class="rank-market-name">${mkt.label}</div>
        <div class="rank-market-short">${mkt.short}</div>
      </div>
      <div class="rank-bar-track">
        <div class="rank-bar-fill" style="width:0%;background:linear-gradient(90deg,${mkt.color}88 0%,${mkt.color} 100%)"></div>
      </div>
      <div class="rank-value-group">
        <div class="rank-value">${displayVal}</div>
        ${cagrHtml}
      </div>
    `;
    container.appendChild(card);

    // Animate bar after paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fill = card.querySelector('.rank-bar-fill');
        if (fill) fill.style.width = `${pct}%`;
      });
    });
  });
}
