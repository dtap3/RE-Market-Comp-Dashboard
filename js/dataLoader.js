// dataLoader.js — parse RE Market Comp Data.xlsx into window.dashData

export const MARKETS = [
  { id: 'LittleRock',   label: 'Little Rock, AR',            short: 'LR',  color: '#DC143C', colOffset: 0 },
  { id: 'Jacksonville', label: 'Jacksonville, FL',            short: 'JAX', color: '#FF6B6B', colOffset: 4 },
  { id: 'Memphis',      label: 'Memphis, TN',                 short: 'MEM', color: '#9B0E2A', colOffset: 8 },
  { id: 'Norfolk',      label: 'Virginia Beach-Norfolk, VA',  short: 'NFK', color: '#E85D75', colOffset: 12 },
];

// colOffset → 0=LR(B-E), 4=JAX(F-I), 8=MEM(J-M), 12=NFK(N-Q) in 17-col data sheets (A + 4*4)

function parseNum(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '(X)' || s === 'N' || s === '-' || s === '' || s === 'null') return null;
  return parseFloat(s.replace(/[,$%±\s()+]/g, '')) || null;
}

function excelSerialToYear(serial) {
  // Excel serial 1 = 1900-01-01; leap-year bug means serial 60 is treated as 1900-02-29
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.getUTCFullYear();
}

// ── parseTableSheet ──────────────────────────────────────────────────────────
// The Table sheet has two panels:
//   Panel 1 rows 2-15 (0-indexed): Norfolk (cols 1-4=B-E) vs Memphis (cols 5-8=G-J? actually F-I?)
//   Panel 2 rows 17-30: Jacksonville (cols 1-4) vs LittleRock (cols 5-8)
// We use sheet_to_json({header:1}) giving a 2D array; columns 0-indexed.
// After inspection: col indices: label=1, v20=2, v24=3, cagr=4 (panel1 city1)
//                                               city2: label=6, v20=7, v24=8, cagr=9

function parseTableSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const METRIC_MAP = {
    'Population':                    { key: 'population',         fmt: 'number' },
    'Housing Units':                 { key: 'housingUnits',       fmt: 'number' },
    'Median Household Income':       { key: 'medianIncome',       fmt: 'dollar' },
    'Adj. Median Household Income':  { key: 'adjMedianIncome',    fmt: 'dollar' },
    'Average Household Size':        { key: 'avgHHSize',          fmt: 'decimal' },
    'Owner Occupied Housing Units':  { key: 'ownerOccupied',      fmt: 'number' },
    'Renter Occupied Housing Units': { key: 'renterOccupied',     fmt: 'number' },
    'Homeowner Vacancy Rate':        { key: 'homeownerVacancy',   fmt: 'percent', isAbsoluteDelta: true },
    'Rental Vacancy Rate':           { key: 'rentalVacancy',      fmt: 'percent', isAbsoluteDelta: true },
    'Median Gross Rent':             { key: 'medianRent',         fmt: 'dollar' },
    'Adj. Median Gross Rent':        { key: 'adjMedianRent',      fmt: 'dollar' },
    'Median Home Value':             { key: 'medianHomeValue',    fmt: 'dollar' },
    'Adj. Median Home Value':        { key: 'adjMedianHomeValue', fmt: 'dollar' },
  };

  // panel order: [cityName, rows]
  const panels = [
    { city1: null, city2: null, rows: rows.slice(1, 16) },
    { city1: null, city2: null, rows: rows.slice(17, 32) },
  ];

  // identify city names from header row of each panel
  // row index 1 (absolute) and 17 should be the city header rows
  const hdr1 = rows[1] || [];
  const hdr2 = rows[17] || [];
  panels[0].city1 = String(hdr1[1] || '').trim();
  panels[0].city2 = String(hdr1[6] || '').trim();
  panels[1].city1 = String(hdr2[1] || '').trim();
  panels[1].city2 = String(hdr2[6] || '').trim();

  // Normalize city name → market id
  function cityToId(name) {
    const n = name.toLowerCase();
    if (n.includes('norfolk') || n.includes('virginia beach')) return 'Norfolk';
    if (n.includes('memphis')) return 'Memphis';
    if (n.includes('jacksonville')) return 'Jacksonville';
    if (n.includes('little rock')) return 'LittleRock';
    return null;
  }

  const metrics = {};
  Object.values(METRIC_MAP).forEach(m => {
    metrics[m.key] = { fmt: m.fmt, isAbsoluteDelta: m.isAbsoluteDelta || false };
    MARKETS.forEach(mkt => { metrics[m.key][mkt.id] = { v2020: null, v2024: null, cagr: null }; });
  });

  panels.forEach(panel => {
    const id1 = cityToId(panel.city1);
    const id2 = cityToId(panel.city2);
    panel.rows.forEach(row => {
      if (!row) return;
      const label1 = String(row[1] || '').trim();
      const label2 = String(row[6] || '').trim();
      const label = label1 || label2;
      const meta = METRIC_MAP[label];
      if (!meta) return;
      const key = meta.key;
      if (id1 && metrics[key]) {
        metrics[key][id1] = {
          v2020: parseNum(row[2]),
          v2024: parseNum(row[3]),
          cagr:  parseNum(row[4]),
        };
      }
      if (id2 && metrics[key]) {
        metrics[key][id2] = {
          v2020: parseNum(row[7]),
          v2024: parseNum(row[8]),
          cagr:  parseNum(row[9]),
        };
      }
    });
  });

  return { metrics };
}

// ── parseDataSheet ───────────────────────────────────────────────────────────
// Columns: A(0)=label, B-E(1-4)=LR, F-I(5-8)=JAX, J-M(9-12)=MEM, N-Q(13-16)=NFK
// Each market: Estimate, MoE, Percent, PercentMoE

function parseDataSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const result = [];
  let currentSection = '';

  rows.forEach(row => {
    if (!row || !row[0]) return;
    const label = String(row[0]).trim();
    if (!label) return;

    // Detect section headers: all data columns empty, label is ALL CAPS or specific known headers
    const dataColsEmpty = MARKETS.every((_, i) => {
      const base = 1 + i * 4;
      return row[base] === null && row[base + 1] === null && row[base + 2] === null;
    });
    if (dataColsEmpty && label === label.toUpperCase() && label.length > 3) {
      currentSection = label;
      return;
    }

    const entry = { label, section: currentSection };
    MARKETS.forEach((mkt, i) => {
      const base = 1 + i * 4;
      entry[mkt.id] = {
        estimate: parseNum(row[base]),
        moe:      parseNum(row[base + 1]),
        pct:      parseNum(row[base + 2]),
        pctMoe:   parseNum(row[base + 3]),
      };
    });
    result.push(entry);
  });

  return result;
}

// ── parseIncomeSheet ─────────────────────────────────────────────────────────
// 49 columns: col 0 = label, then 12 cols per market (LR=1-12, JAX=13-24, MEM=25-36, NFK=37-48)
// Per market: TotalEst, TotalMoE, TotalPct, TotalPctMoE, OwnerEst, OwnerMoE, OwnerPct, OwnerPctMoE,
//             RenterEst, RenterMoE, RenterPct, RenterPctMoE

const INCOME_BRACKETS = [
  'Less than $5,000', '$5,000 to $9,999', '$10,000 to $14,999',
  '$15,000 to $19,999', '$20,000 to $24,999', '$25,000 to $34,999',
  '$35,000 to $49,999', '$50,000 to $74,999', '$75,000 to $99,999',
  '$100,000 to $149,999', '$150,000 or more',
];

function parseIncomeSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const result = {};

  MARKETS.forEach((mkt, mi) => {
    const base = 1 + mi * 12;
    result[mkt.id] = {
      totalEst: [], ownerEst: [], renterEst: [],
      totalPct: [], ownerPct: [], renterPct: [],
      medianIncome: null,
    };
  });

  rows.forEach(row => {
    if (!row || !row[0]) return;
    const label = String(row[0]).trim();

    const bracketIdx = INCOME_BRACKETS.indexOf(label);
    if (bracketIdx !== -1) {
      MARKETS.forEach((mkt, mi) => {
        const base = 1 + mi * 12;
        result[mkt.id].totalEst.push(parseNum(row[base]));
        result[mkt.id].totalPct.push(parseNum(row[base + 2]));
        result[mkt.id].ownerEst.push(parseNum(row[base + 4]));
        result[mkt.id].ownerPct.push(parseNum(row[base + 6]));
        result[mkt.id].renterEst.push(parseNum(row[base + 8]));
        result[mkt.id].renterPct.push(parseNum(row[base + 10]));
      });
    } else if (label.toLowerCase().includes('median') && label.toLowerCase().includes('income')) {
      MARKETS.forEach((mkt, mi) => {
        const base = 1 + mi * 12;
        result[mkt.id].medianIncome = parseNum(row[base]);
      });
    }
  });

  return { brackets: INCOME_BRACKETS, markets: result };
}

// ── parsePopSheet ────────────────────────────────────────────────────────────
// Columns: A(0)=label, B-E(1-4)=LR, F-I(5-8)=JAX, J-M(9-12)=MEM, N-Q(13-16)=NFK

function parsePopSheet(ws, year) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const result = {};
  MARKETS.forEach(mkt => {
    result[mkt.id] = { year, rows: [] };
  });

  let currentSection = '';
  rows.forEach(row => {
    if (!row || !row[0]) return;
    const label = String(row[0]).trim();
    if (!label) return;

    const dataEmpty = MARKETS.every((_, i) => row[1 + i * 4] === null);
    if (dataEmpty && label.length > 2) {
      currentSection = label;
      return;
    }

    const entry = { label, section: currentSection };
    MARKETS.forEach((mkt, i) => {
      const base = 1 + i * 4;
      entry[mkt.id] = {
        estimate: parseNum(row[base]),
        moe:      parseNum(row[base + 1]),
        pct:      parseNum(row[base + 2]),
        pctMoe:   parseNum(row[base + 3]),
      };
    });
    MARKETS.forEach(mkt => result[mkt.id].rows.push(entry));
  });

  // Also return flat rows for Explorer
  const flatRows = [];
  rows.forEach(row => {
    if (!row || !row[0]) return;
    const label = String(row[0]).trim();
    if (!label) return;
    const dataEmpty = MARKETS.every((_, i) => row[1 + i * 4] === null);
    if (dataEmpty) return;
    const entry = { label, section: '' };
    MARKETS.forEach((mkt, i) => {
      const base = 1 + i * 4;
      entry[mkt.id] = {
        estimate: parseNum(row[base]),
        pct:      parseNum(row[base + 2]),
      };
    });
    flatRows.push(entry);
  });

  return { year, byMarket: result, flatRows };
}

// ── parseCpiSheet ────────────────────────────────────────────────────────────
function parseCpiSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const years = [], inflationRate = [], cpiIndex2024 = [];

  rows.slice(1).forEach(row => {
    if (!row || !row[0]) return;
    const yr = excelSerialToYear(row[0]);
    if (!yr || yr < 2000) return;
    years.push(yr);
    inflationRate.push(parseNum(row[1]));
    cpiIndex2024.push(parseNum(row[3]));
  });

  const idx2020 = years.indexOf(2020);
  const deflator2020to2024 = idx2020 >= 0 && cpiIndex2024[idx2020]
    ? 1 / cpiIndex2024[idx2020]
    : 1.213;

  return { years, inflationRate, cpiIndex2024, deflator2020to2024 };
}

// ── buildSummary ─────────────────────────────────────────────────────────────
function buildSummary(tableData) {
  const summary = {};
  const m = tableData.metrics;

  MARKETS.forEach(mkt => {
    summary[mkt.id] = {};
    Object.keys(m).forEach(key => {
      summary[mkt.id][key] = m[key][mkt.id] || { v2020: null, v2024: null, cagr: null };
    });
  });

  return summary;
}

// ── RANKABLE METRICS definition ──────────────────────────────────────────────
export const RANKABLE_METRICS = [
  { key: 'population',         label: 'Population',                  fmt: 'number',  lowerIsBetter: false },
  { key: 'housingUnits',       label: 'Housing Units',               fmt: 'number',  lowerIsBetter: false },
  { key: 'medianIncome',       label: 'Median Household Income',     fmt: 'dollar',  lowerIsBetter: false },
  { key: 'adjMedianIncome',    label: 'Median Income (Adj.)',        fmt: 'dollar',  lowerIsBetter: false },
  { key: 'avgHHSize',          label: 'Avg Household Size',          fmt: 'decimal', lowerIsBetter: false },
  { key: 'ownerOccupied',      label: 'Owner-Occupied Units',        fmt: 'number',  lowerIsBetter: false },
  { key: 'renterOccupied',     label: 'Renter-Occupied Units',       fmt: 'number',  lowerIsBetter: false },
  { key: 'homeownerVacancy',   label: 'Homeowner Vacancy Rate',      fmt: 'percent', lowerIsBetter: true,  isAbsoluteDelta: true },
  { key: 'rentalVacancy',      label: 'Rental Vacancy Rate',         fmt: 'percent', lowerIsBetter: true,  isAbsoluteDelta: true },
  { key: 'medianRent',         label: 'Median Gross Rent',           fmt: 'dollar',  lowerIsBetter: false },
  { key: 'adjMedianRent',      label: 'Median Rent (Adj.)',          fmt: 'dollar',  lowerIsBetter: false },
  { key: 'medianHomeValue',    label: 'Median Home Value',           fmt: 'dollar',  lowerIsBetter: false },
  { key: 'adjMedianHomeValue', label: 'Median Home Value (Adj.)',    fmt: 'dollar',  lowerIsBetter: false },
];

// ── Format helpers ───────────────────────────────────────────────────────────
export function formatValue(val, fmt) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  switch (fmt) {
    case 'dollar':  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'percent': return val.toFixed(1) + '%';
    case 'decimal': return val.toFixed(2);
    case 'number':  return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    default:        return String(val);
  }
}

export function formatCAGR(val, isAbsoluteDelta) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const sign = val > 0 ? '+' : '';
  return isAbsoluteDelta ? `${sign}${val.toFixed(2)}pp` : `${sign}${val.toFixed(2)}%`;
}

// ── Main loader ──────────────────────────────────────────────────────────────
export async function loadDashboardData() {
  if (window.location.protocol === 'file:') {
    throw new Error('FILE_PROTOCOL');
  }

  const resp = await fetch('RE Market Comp Data.xlsx');
  if (!resp.ok) throw new Error(`Failed to fetch Excel file: ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });

  const sheetName = name => {
    const found = wb.SheetNames.find(s => s.trim().toLowerCase() === name.toLowerCase());
    return found ? wb.Sheets[found] : null;
  };

  const tableWs   = sheetName('Table');
  const data2020  = sheetName('Data (2020)');
  const data2024  = sheetName('Data (2024)');
  const inc2020   = sheetName('Income (2020)');
  const inc2024   = sheetName('Income (2024)');
  const pop2020   = sheetName('Population (2020)');
  const pop2024   = sheetName('Population (2024)');
  const cpiWs     = sheetName('CPI Fred Data');

  const tableData    = tableWs  ? parseTableSheet(tableWs)     : { metrics: {} };
  const rawData2020  = data2020 ? parseDataSheet(data2020)     : [];
  const rawData2024  = data2024 ? parseDataSheet(data2024)     : [];
  const rawInc2020   = inc2020  ? parseIncomeSheet(inc2020)    : { brackets: [], markets: {} };
  const rawInc2024   = inc2024  ? parseIncomeSheet(inc2024)    : { brackets: [], markets: {} };
  const rawPop2020   = pop2020  ? parsePopSheet(pop2020, 2020) : { flatRows: [] };
  const rawPop2024   = pop2024  ? parsePopSheet(pop2024, 2024) : { flatRows: [] };
  const cpiData      = cpiWs    ? parseCpiSheet(cpiWs)         : { deflator2020to2024: 1.213 };

  const summary = buildSummary(tableData);

  window.dashData = {
    markets: MARKETS,
    summary,
    tableMetrics: tableData.metrics,
    raw: {
      data2020: rawData2020,
      data2024: rawData2024,
      income2020: rawInc2020,
      income2024: rawInc2024,
      pop2020: rawPop2020,
      pop2024: rawPop2024,
      cpi: cpiData,
    },
    rankableMetrics: RANKABLE_METRICS,
  };

  return window.dashData;
}
