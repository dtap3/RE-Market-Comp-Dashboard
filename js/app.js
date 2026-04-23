// app.js — bootstrap, tab routing

import { loadDashboardData } from './dataLoader.js';
import { initRankings }      from './tabs/rankings.js';
import { initCharts }        from './tabs/charts.js';
import { initExplorer }      from './tabs/explorer.js';

async function bootstrap() {
  // File protocol check
  if (window.location.protocol === 'file:') {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('file-protocol-error').style.display = 'flex';
    return;
  }

  try {
    await loadDashboardData();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-content">
        <div style="color:var(--color-negative);font-size:0.875rem;">
          Failed to load data: ${err.message}
        </div>
      </div>`;
    return;
  }

  // Hide loader, show app
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'grid';

  // Init all tabs
  initRankings();
  initCharts();
  initExplorer();

  // Tab routing
  setupTabs();
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
      panels.forEach(p => {
        const isTarget = p.id === `tab-${target}`;
        p.classList.toggle('active', isTarget);
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
