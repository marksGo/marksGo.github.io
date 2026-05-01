/* source/js/daily.js
 * Client-side interactions for the Daily Inquiry page.
 * Consumes a JSON blob injected at #dailyData by the Hexo generator.
 */
(function () {
  'use strict';

  const dataEl = document.getElementById('dailyData');
  if (!dataEl) return;

  const DATA = JSON.parse(dataEl.textContent);
  const STATUS = { proposed: '提出', thinking: '思考中', resolved: '已解决', shelved: '搁置' };
  const SCALE  = { flash: '闪念', short: '短思', long: '长考', lifelong: '终身课题' };
  const TYPE   = { propose: '提出', think: '续思', resolved: '结论' };
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  // Build entriesByDate on the client (generator could pass it, but it's ~free here)
  const entriesByDate = {};
  for (const q of DATA.questions) {
    for (const e of q.entries) {
      (entriesByDate[e.date] ||= []).push({ qid: q.id, title: q.title, ...e });
    }
  }

  // State
  const years = Object.keys(DATA.calendars).map(Number).sort();
  const currentYear = new Date().getFullYear();
  let viewYear = years.includes(currentYear) ? currentYear : years[years.length - 1];
  let filter = { status: 'all', scale: 'all', date: null };

  // Elements
  const $ = id => document.getElementById(id);
  const elStats = $('dailyStats');
  const elYears = $('dailyYears');
  const elHeatmap = $('dailyHeatmap');
  const elQList = $('dailyQList');
  const elReset = $('dailyReset');
  const elTip = $('dailyTooltip');

  // ---- renderers ----

  function renderYears() {
    elYears.innerHTML = years.map(y =>
      `<button data-year="${y}" class="${y === viewYear ? 'active' : ''}">${y}</button>`
    ).join('');
    elYears.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => {
        viewYear = +b.dataset.year;
        filter.date = null;
        renderAll();
      })
    );
  }

  function renderStats() {
    const s = DATA.yearStats[viewYear] || { propose:0, think:0, resolved:0, absent:0 };
    const totalSolved = DATA.totals.byStatus.resolved || 0;
    const total = DATA.totals.total;
    const restarts = DATA.totals.restarts || 0;

    elStats.innerHTML = `
      <div class="stat">
        <div class="stat__num">${s.propose}<span class="small">+${s.think}</span></div>
        <div class="stat__label">inquiries ${viewYear}</div>
        <div class="stat__zh">今年 · 提出 · 续思</div>
      </div>
      <div class="stat">
        <div class="stat__num">${s.resolved}</div>
        <div class="stat__label">resolutions ${viewYear}</div>
        <div class="stat__zh">今年 · 结论数</div>
      </div>
      <div class="stat">
        <div class="stat__num">${s.absent}</div>
        <div class="stat__label">absent days</div>
        <div class="stat__zh">今年 · 缺席天数</div>
      </div>
      <div class="stat">
        <div class="stat__num">${totalSolved}<span class="small">/${total}</span></div>
        <div class="stat__label">all time</div>
        <div class="stat__zh">累计 · 解决 / 总数${restarts ? ' · 重启 ' + restarts : ''}</div>
      </div>
    `;
  }

  function renderHeatmap() {
    const cells = DATA.calendars[viewYear] || [];
    elHeatmap.innerHTML = '';
    if (!cells.length) return;

    let col = 0;
    const monthSeen = new Set();

    // Leading blanks for first partial week
    const firstDow = cells[0].dow;
    for (let k = 0; k < firstDow; k++) {
      const blank = document.createElement('div');
      blank.style.gridRow = `${k + 2}`;
      blank.style.gridColumn = `${col + 1}`;
      elHeatmap.appendChild(blank);
    }

    for (const c of cells) {
      if (!monthSeen.has(c.month)) {
        monthSeen.add(c.month);
        const m = document.createElement('div');
        m.className = 'heatmap__month';
        m.style.gridRow = '1';
        m.style.gridColumn = `${col + 1}`;
        m.textContent = MONTHS[c.month];
        elHeatmap.appendChild(m);
      }
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.state = c.state;
      cell.dataset.date = c.date;
      cell.style.gridRow = `${c.dow + 2}`;
      cell.style.gridColumn = `${col + 1}`;
      if (filter.date === c.date) cell.classList.add('selected');
      elHeatmap.appendChild(cell);
      if (c.dow === 6) col++;
    }

    bindHeatmapEvents();
  }

  function matchFilter(q) {
    if (filter.status !== 'all' && q.status !== filter.status) return false;
    if (filter.scale  !== 'all' && q.scale  !== filter.scale)  return false;
    if (filter.date && !q.entries.some(e => e.date === filter.date)) return false;
    return true;
  }

  function renderQList() {
    const rows = DATA.questions
      .filter(matchFilter)
      .sort((a, b) => (b.last_touched || '').localeCompare(a.last_touched || ''));

    if (!rows.length) {
      elQList.innerHTML = `<div class="empty">没有符合条件的问题<em>— nothing here, yet —</em></div>`;
      return;
    }

    elQList.innerHTML = rows.map(q => {
      const entries = (q.entries || []).slice().reverse().map(e => `
        <div class="entry">
          <div class="entry__date">${e.date}</div>
          <div class="entry__type ${e.type}">${TYPE[e.type] || e.type}</div>
          <div class="entry__note">${escapeHtml(e.note || '')}</div>
        </div>
      `).join('');

      const tags = (q.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      const restart = q.restart_count > 0
        ? `<span class="label restart">重启 ×${q.restart_count}</span>` : '';

      return `
        <div class="q" data-qid="${q.id}">
          <div class="q__id">${q.id.toUpperCase()}</div>
          <div class="q__body">
            <h3>${escapeHtml(q.title)}</h3>
            <div class="q__meta">
              <span><span class="dot ${q.status}"></span>${STATUS[q.status] || q.status}</span>
              <span>last · ${q.last_touched || '—'}</span>
              <span>entries · ${q.entries.length}</span>
              ${tags}
            </div>
          </div>
          <div class="q__labels">
            <span class="label scale-${q.scale}">${SCALE[q.scale] || q.scale}</span>
            ${restart}
          </div>
          <div class="entries">${entries}</div>
        </div>
      `;
    }).join('');

    elQList.querySelectorAll('.q').forEach(node => {
      node.addEventListener('click', () => node.classList.toggle('open'));
    });
  }

  // ---- interactions ----

  function showTip(cell) {
    const ds = cell.dataset.date;
    if (!ds || cell.dataset.state === 'future') return;
    const ents = entriesByDate[ds] || [];
    const absent = DATA.absences && DATA.absences.indexOf
      ? DATA.absences.indexOf(ds) >= 0
      : false;

    let body;
    if (!ents.length) {
      body = absent
        ? '<div class="tooltip__item">主动搁置的一天</div>'
        : '<div class="tooltip__item">（没有记录）</div>';
    } else {
      body = ents.map(e =>
        `<div class="tooltip__item">[${TYPE[e.type] || e.type}] ${escapeHtml(e.title)}</div>`
      ).join('');
    }

    elTip.innerHTML = `<div class="tooltip__date">${ds}</div>${body}`;
    elTip.classList.add('show');
    const r = cell.getBoundingClientRect();
    const tr = elTip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    let top = r.top - tr.height - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    if (top < 8) top = r.bottom + 8;
    elTip.style.left = left + 'px';
    elTip.style.top = top + 'px';
  }

  function hideTip() { elTip.classList.remove('show'); }

  function bindHeatmapEvents() {
    elHeatmap.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('mouseenter', () => showTip(cell));
      cell.addEventListener('mouseleave', hideTip);
      cell.addEventListener('click', () => {
        const ds = cell.dataset.date;
        if (!ds || cell.dataset.state === 'future') return;
        filter.date = filter.date === ds ? null : ds;
        renderHeatmap();
        renderQList();
        syncReset();
      });
    });
  }

  function bindFilters() {
    document.querySelectorAll('.daily-page .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter;
        filter[f] = chip.dataset.val;
        document.querySelectorAll(`.daily-page .chip[data-filter="${f}"]`)
          .forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderQList();
        syncReset();
      });
    });

    elReset.addEventListener('click', () => {
      filter = { status: 'all', scale: 'all', date: null };
      document.querySelectorAll('.daily-page .chip').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.daily-page .chip[data-val="all"]').forEach(c => c.classList.add('active'));
      renderHeatmap();
      renderQList();
      syncReset();
    });
  }

  function syncReset() {
    const active = filter.status !== 'all' || filter.scale !== 'all' || filter.date;
    elReset.disabled = !active;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAll() {
    renderStats();
    renderHeatmap();
    renderQList();
    syncReset();
  }

  // init
  renderYears();
  renderAll();
  bindFilters();
})();
