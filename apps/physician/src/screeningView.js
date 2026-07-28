const esc = (value) => String(value ?? '')
  .replace(/[—–]/g, '-')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// PROTOTYPE DATA — illustrative structure only. Cadence, dates, and basis
// labels are placeholders pending the governed screening schedule artifact.
const PROTOTYPE_SCREENINGS = [
  { id: 'colorectal', name: 'Colorectal cancer screening (colonoscopy)', cadence: 'Every 10 years', lastDone: '2021-04-15', nextDue: '2031-04-15', basis: 'USPSTF A · illustrative', once: false },
  { id: 'lipid', name: 'Lipid panel', cadence: 'Annual', lastDone: '2025-11-14', nextDue: '2026-11-14', basis: 'Risk management · illustrative', once: false },
  { id: 'hba1c', name: 'HbA1c', cadence: 'Annual', lastDone: '2024-08-02', nextDue: '2025-08-02', basis: 'Prediabetes phenotype · illustrative', once: false },
  { id: 'bp', name: 'Blood pressure', cadence: 'Annual', lastDone: '2026-01-20', nextDue: '2027-01-20', basis: 'USPSTF A · illustrative', once: false },
  { id: 'cac', name: 'Coronary artery calcium score', cadence: 'Once, risk refinement', lastDone: null, nextDue: '2026-08-15', basis: 'PREVENT intermediate risk · illustrative', once: true },
  { id: 'phq', name: 'Depression screen (PHQ-2)', cadence: 'Annual', lastDone: '2025-06-15', nextDue: '2026-06-15', basis: 'USPSTF B · illustrative', once: false },
  { id: 'osa', name: 'Sleep apnea screen', cadence: 'Every 2 years', lastDone: '2025-03-10', nextDue: '2027-03-10', basis: 'Wearable phenotype · illustrative', once: false },
  { id: 'hepc', name: 'Hepatitis C antibody', cadence: 'Once', lastDone: '2023-05-11', nextDue: null, basis: 'USPSTF B · illustrative', once: true },
  { id: 'hiv', name: 'HIV screen', cadence: 'Once', lastDone: '2023-05-11', nextDue: null, basis: 'USPSTF A · illustrative', once: true },
];

const DAY = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 90;

function statusOf(item, today) {
  if (item.once && item.lastDone) return 'completed';
  if (!item.nextDue) return 'completed';
  const due = new Date(item.nextDue);
  if (due < today) return 'overdue';
  if (due - today <= DUE_SOON_DAYS * DAY) return 'due';
  return 'upcoming';
}

const STATUS_META = {
  overdue: { label: 'Overdue', cls: 'hazard' },
  due: { label: 'Due soon', cls: 'forward' },
  upcoming: { label: 'Upcoming', cls: 'forward' },
  completed: { label: 'Completed', cls: 'baseline' },
};

const STATUS_ORDER = ['overdue', 'due', 'upcoming', 'completed'];

function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function listView(items, today) {
  const groups = STATUS_ORDER
    .map((status) => ({
      status,
      rows: items.filter((item) => statusOf(item, today) === status),
    }))
    .filter((group) => group.rows.length);
  return `<div class="sc-list-stack">${groups.map((group) => `
    <section class="panel sc-group">
      <div class="panel-head"><h3>${esc(STATUS_META[group.status].label)}</h3><span>${group.rows.length}</span></div>
      <div class="sc-rows">${group.rows.map((item) => `
        <div class="sc-row">
          <div class="sc-name"><strong>${esc(item.name)}</strong><span>${esc(item.basis)}</span></div>
          <div class="sc-cad"><span class="k">Cadence</span><span class="v">${esc(item.cadence)}</span></div>
          <div class="sc-date"><span class="k">Last</span><span class="v">${esc(fmtDate(item.lastDone))}</span></div>
          <div class="sc-date"><span class="k">Next</span><span class="v sc-next-${STATUS_META[group.status].cls}">${esc(fmtDate(item.nextDue))}</span></div>
        </div>`).join('')}
      </div>
    </section>`).join('')}</div>`;
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function timelineView(items, today, year) {
  const isCurrentYear = year === today.getFullYear();
  const nowFrac = isCurrentYear
    ? (today - new Date(year, 0, 1)) / (new Date(year + 1, 0, 1) - new Date(year, 0, 1))
    : null;
  const rows = items.map((item) => {
    const status = statusOf(item, today);
    const meta = STATUS_META[status];
    let marker = '';
    let markerDate = null;
    if (item.nextDue && new Date(item.nextDue).getFullYear() === year) {
      const frac = (new Date(item.nextDue) - new Date(year, 0, 1)) / (new Date(year + 1, 0, 1) - new Date(year, 0, 1));
      marker = `<span class="sc-dot sc-dot-${meta.cls}" style="left:${(frac * 100).toFixed(2)}%"></span>`;
      markerDate = item.nextDue;
    } else if (status === 'overdue' && isCurrentYear && nowFrac !== null) {
      marker = `<span class="sc-dot sc-dot-hazard" style="left:${(nowFrac * 100).toFixed(2)}%"></span>`;
      markerDate = item.nextDue;
    } else if (status === 'completed' && item.lastDone && new Date(item.lastDone).getFullYear() === year) {
      const frac = (new Date(item.lastDone) - new Date(year, 0, 1)) / (new Date(year + 1, 0, 1) - new Date(year, 0, 1));
      marker = `<span class="sc-dot sc-dot-baseline" style="left:${(frac * 100).toFixed(2)}%"></span>`;
      markerDate = item.lastDone;
    }
    return `
      <div class="sc-tl-row">
        <div class="sc-tl-name">${esc(item.name)}</div>
        <div class="sc-tl-track">${marker}</div>
        <div class="sc-tl-date">${markerDate ? esc(fmtDate(markerDate)) : ''}</div>
      </div>`;
  }).join('');
  const nowLine = nowFrac !== null
    ? `<span class="sc-now" style="left:${(nowFrac * 100).toFixed(2)}%"></span>`
    : '';
  return `
    <section class="panel sc-timeline">
      <div class="panel-head"><h3>Timeline</h3>
        <span class="sc-year-flip"><button type="button" data-sc-year="-1" aria-label="Previous year">‹</button><strong>${year}</strong><button type="button" data-sc-year="1" aria-label="Next year">›</button></span>
      </div>
      <div class="sc-tl" role="region" aria-label="Screening timeline">
        <div class="sc-tl-grid">
        <div class="sc-tl-head">
          <div class="sc-tl-name"></div>
          <div class="sc-tl-track sc-tl-months">${MONTHS.map((m, i) => `<span style="left:${((i / 12) * 100).toFixed(2)}%">${m}</span>`).join('')}${nowLine}</div>
          <div class="sc-tl-date"></div>
        </div>
        ${rows}
        </div>
      </div>
      <p class="rs-axis-note">Overdue items pin to today. Completed one-time screens mark their completion year.</p>
    </section>`;
}

export function screeningView(state) {
  const today = new Date();
  const year = state.screeningYear ?? today.getFullYear();
  const mode = state.screeningMode ?? 'list';
  const items = PROTOTYPE_SCREENINGS;
  const body = mode === 'timeline' ? timelineView(items, today, year) : listView(items, today);
  return `<section class="screen-frame stable-screen screening-screen">
    <header class="screen-head"><div><h1>Screening</h1><p>Surveillance and early detection, separate from risk reduction.</p></div>
      <div class="sc-mode" role="tablist" aria-label="Screening view">
        <button type="button" data-sc-mode="list" class="${mode === 'list' ? 'on' : ''}" role="tab" aria-selected="${mode === 'list'}">List</button>
        <button type="button" data-sc-mode="timeline" class="${mode === 'timeline' ? 'on' : ''}" role="tab" aria-selected="${mode === 'timeline'}">Timeline</button>
      </div>
    </header>
    <div class="screen-body screening-body">
      <div class="sc-banner screen-state screen-state-advisory">Illustrative schedule. Dates and cadence await a governed source.</div>
      ${body}
    </div>
  </section>`;
}
