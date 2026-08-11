(function () {
  'use strict';

  var K = { url: 'pf.endpoint', rows: 'pf.rows', queue: 'pf.queue', sync: 'pf.sync' };
  var FLAGS = [
    { key: 'src',   short: 'И', name: 'Исходники сохранены', hint: '.dwg, .pln, .rvt, .max, .psd' },
    { key: 'shot',  short: 'Ф', name: 'Фото или скан подачи', hint: 'планшет целиком, макет со всех сторон' },
    { key: 'pdf',   short: 'П', name: 'Финальный PDF', hint: 'не ниже 300 dpi' },
    { key: 'desc',  short: 'О', name: 'Описание работы', hint: '3–5 предложений: задача, идея, сложности' }
  ];

  var state = { rows: [], queue: [], course: 0, sem: 0, filter: 'all', open: null, busy: false };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- хранилище ---------- */
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function endpoint() { return localStorage.getItem(K.url) || ''; }

  /* ---------- сеть ---------- */
  function fetchRows() {
    return fetch(endpoint() + '?action=list', { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error(d && d.error ? d.error : 'Таблица ответила ошибкой');
        return d.rows;
      });
  }

  function push(id, fields) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', id: id, fields: fields })
    }).then(function (r) { return r.json(); });
  }

  function enqueue(id, fields) {
    var found = null;
    for (var i = 0; i < state.queue.length; i++) {
      if (state.queue[i].id === id) { found = state.queue[i]; break; }
    }
    if (found) { for (var k in fields) found.fields[k] = fields[k]; }
    else { state.queue.push({ id: id, fields: fields }); }
    save(K.queue, state.queue);
    flush();
  }

  var flushTimer = null;
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(runFlush, 600);
  }

  function runFlush() {
    if (state.busy || !state.queue.length || !navigator.onLine) return;
    state.busy = true;
    var item = state.queue[0];
    push(item.id, item.fields)
      .then(function (d) {
        if (!d || !d.ok) throw new Error('отказ записи');
        state.queue.shift();
        save(K.queue, state.queue);
        save(K.sync, Date.now());
        state.busy = false;
        renderStamp();
        if (state.queue.length) runFlush();
      })
      .catch(function () {
        state.busy = false;
        renderStamp();
        toast('Изменения сохранены на телефоне. Отправлю, когда будет связь.');
      });
  }

  /* ---------- вспомогательное ---------- */
  function done(r) {
    var n = 0;
    for (var i = 0; i < FLAGS.length; i++) if (r[FLAGS[i].key]) n++;
    return n;
  }
  function pct(list) {
    if (!list.length) return 0;
    var s = 0;
    for (var i = 0; i < list.length; i++) s += done(list[i]);
    return Math.round(s / (list.length * 4) * 100);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  /* ---------- отрисовка ---------- */
  function renderStamp() {
    $('stampReady').textContent = pct(state.rows) + '%';
    var t = load(K.sync, 0);
    var label = '—';
    if (state.queue.length) label = 'ждёт ' + state.queue.length;
    else if (t) {
      var d = new Date(t);
      label = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    $('stampSync').textContent = label;
  }

  function renderCourses() {
    var html = '<button class="tab" type="button" data-course="0" aria-pressed="' +
      (state.course === 0) + '">Все<small>' + pct(state.rows) + '%</small></button>';
    for (var c = 1; c <= 5; c++) {
      var sub = state.rows.filter(function (r) { return r.course === c; });
      html += '<button class="tab" type="button" data-course="' + c + '" aria-pressed="' +
        (state.course === c) + '">' + c + ' курс<small>' + pct(sub) + '%</small></button>';
    }
    $('courseBar').innerHTML = html;
  }

  function renderChips() {
    var s = '';
    [[0, 'Оба семестра'], [1, '1 сем'], [2, '2 сем']].forEach(function (o) {
      s += '<button class="chip" type="button" data-sem="' + o[0] + '" aria-pressed="' +
        (state.sem === o[0]) + '">' + o[1] + '</button>';
    });
    $('semBar').innerHTML = s;
    var f = '';
    [['all', 'Все'], ['todo', 'В работе'], ['done', 'Готово']].forEach(function (o) {
      f += '<button class="chip" type="button" data-filter="' + o[0] + '" aria-pressed="' +
        (state.filter === o[0]) + '">' + o[1] + '</button>';
    });
    $('stateBar').innerHTML = f;
  }

  function visible() {
    return state.rows.filter(function (r) {
      if (state.course && r.course !== state.course) return false;
      if (state.sem && r.sem !== state.sem) return false;
      var n = done(r);
      if (state.filter === 'done' && n < 4) return false;
      if (state.filter === 'todo' && n === 4) return false;
      return true;
    });
  }

  function rowHtml(r, i) {
    var cells = '';
    for (var f = 0; f < FLAGS.length; f++) {
      cells += '<span class="cell' + (r[FLAGS[f].key] ? ' on' : '') + '">' + FLAGS[f].short + '</span>';
    }
    var tag = r.type === 'ПРОЕКТ' ? '<span class="row__tag">проект</span>' : '';
    var work = r.work ? '<b>' + esc(r.work) + '</b> · ' : '';
    return '<button class="row" type="button" data-id="' + r.id + '" aria-expanded="' +
      (state.open === r.id) + '">' +
      '<span class="row__num">' + ('0' + i).slice(-2) + '</span>' +
      '<span class="row__name">' + work + esc(r.name) + tag + '</span>' +
      '<span class="cells" aria-hidden="true">' + cells + '</span></button>' +
      (state.open === r.id ? panelHtml(r) : '');
  }

  function panelHtml(r) {
    var checks = '';
    for (var i = 0; i < FLAGS.length; i++) {
      var f = FLAGS[i];
      checks += '<button class="check" type="button" data-flag="' + f.key + '" data-id="' + r.id +
        '" aria-pressed="' + (!!r[f.key]) + '">' +
        '<span class="check__box" aria-hidden="true">✓</span>' +
        '<span class="check__txt">' + f.name + '<small>' + f.hint + '</small></span></button>';
    }
    var link = r.folder
      ? '<a class="panel__link" href="' + esc(r.folder) + '" target="_blank" rel="noopener">Открыть папку →</a>'
      : '';
    return '<div class="panel">' +
      '<p class="panel__note">' + esc(r.sem) + ' семестр · ' + esc(r.credits) + ' кредита · ' +
      esc(r.type) + (r.note ? ' · ' + esc(r.note) : '') + '</p>' +
      '<div class="checks">' + checks + '</div>' +
      '<label class="field"><span>Название работы</span>' +
      '<input type="text" data-field="work" data-id="' + r.id + '" value="' + esc(r.work) + '"></label>' +
      '<div class="field--row">' +
      '<label class="field"><span>Оценка</span>' +
      '<input type="text" inputmode="numeric" data-field="grade" data-id="' + r.id + '" value="' + esc(r.grade) + '"></label>' +
      '<label class="field"><span>Папка на Google Диске</span>' +
      '<input type="url" spellcheck="false" data-field="folder" data-id="' + r.id + '" value="' + esc(r.folder) + '"></label>' +
      '</div>' + link +
      '<label class="field"><span>Заметки</span>' +
      '<textarea data-field="notes" data-id="' + r.id + '">' + esc(r.notes) + '</textarea></label>' +
      '</div>';
  }

  function renderList() {
    var rows = visible();
    if (!rows.length) {
      $('list').innerHTML = '<p class="empty">Здесь пусто. Снимите фильтр или выберите другой курс.</p>';
      return;
    }
    var html = '', lastKey = '', n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = r.course + '.' + r.sem;
      if (key !== lastKey) {
        if (lastKey) html += '</div>';
        var grp = rows.filter(function (x) { return x.course === r.course && x.sem === r.sem; });
        html += '<div class="group"><div class="group__head">Курс ' + r.course + ' · семестр ' + r.sem +
          '<span>' + pct(grp) + '% · ' + grp.length + ' дисциплин</span></div>';
        lastKey = key; n = 0;
      }
      n++;
      html += rowHtml(r, n);
    }
    html += '</div>';
    $('list').innerHTML = html;
  }

  function renderAll() {
    renderStamp(); renderCourses(); renderChips(); renderList();
  }

  /* ---------- изменения ---------- */
  function findRow(id) {
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) return state.rows[i];
    return null;
  }
  function change(id, fields) {
    var r = findRow(id);
    if (!r) return;
    for (var k in fields) r[k] = fields[k];
    save(K.rows, state.rows);
    enqueue(id, fields);
  }

  /* ---------- события ---------- */
  document.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('.tab'))) {
      state.course = +t.dataset.course; state.open = null; renderAll(); window.scrollTo(0, 0); return;
    }
    if ((t = e.target.closest('[data-sem]'))) {
      state.sem = +t.dataset.sem; state.open = null; renderAll(); return;
    }
    if ((t = e.target.closest('[data-filter]'))) {
      state.filter = t.dataset.filter; state.open = null; renderAll(); return;
    }
    if ((t = e.target.closest('.check'))) {
      var r = findRow(t.dataset.id);
      var f = t.dataset.flag;
      var next = {}; next[f] = !r[f];
      change(t.dataset.id, next);
      renderStamp(); renderCourses(); renderList();
      return;
    }
    if ((t = e.target.closest('.row'))) {
      state.open = state.open === t.dataset.id ? null : t.dataset.id;
      renderList();
      return;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target.closest('[data-field]');
    if (!t) return;
    var v = {}; v[t.dataset.field] = t.value.trim();
    change(t.dataset.id, v);
    if (t.dataset.field === 'work') renderList();
  });

  $('btnRefresh').addEventListener('click', function () { sync(true); });
  $('btnSettings').addEventListener('click', function () { showSetup(true); });
  $('btnBack').addEventListener('click', function () { showApp(); });
  window.addEventListener('online', runFlush);

  /* ---------- запуск ---------- */
  function sync(loud) {
    if (!endpoint()) return;
    fetchRows().then(function (rows) {
      var byId = {};
      for (var i = 0; i < state.rows.length; i++) byId[state.rows[i].id] = state.rows[i];
      // локальные изменения из очереди имеют приоритет над тем, что пришло с сервера
      for (var q = 0; q < state.queue.length; q++) {
        for (var j = 0; j < rows.length; j++) {
          if (rows[j].id === state.queue[q].id) {
            for (var k in state.queue[q].fields) rows[j][k] = state.queue[q].fields[k];
          }
        }
      }
      state.rows = rows;
      save(K.rows, rows); save(K.sync, Date.now());
      renderAll();
      if (loud) toast('Данные обновлены');
    }).catch(function (err) {
      toast(navigator.onLine ? 'Таблица не отвечает: ' + err.message : 'Нет связи — работаю по памяти');
    });
  }

  function showApp() {
    $('setup').hidden = true; $('app').hidden = false;
    renderAll(); sync(false); runFlush();
  }

  function showSetup(fromApp) {
    $('app').hidden = true; $('setup').hidden = false;
    $('endpointInput').value = endpoint();
    $('btnBack').hidden = !fromApp;
    $('setupErr').hidden = true;
  }

  $('btnConnect').addEventListener('click', function () {
    var url = $('endpointInput').value.trim();
    var err = $('setupErr');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      err.textContent = 'Адрес должен начинаться на https://script.google.com/macros/s/ и заканчиваться на /exec';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    this.textContent = 'Проверяю…';
    var btn = this;
    localStorage.setItem(K.url, url);
    fetchRows().then(function (rows) {
      state.rows = rows; save(K.rows, rows); save(K.sync, Date.now());
      btn.textContent = 'Подключить';
      showApp();
    }).catch(function (e) {
      btn.textContent = 'Подключить';
      err.textContent = 'Не получилось прочитать таблицу: ' + e.message +
        '. Проверьте, что в развёртывании стоит доступ «Все» (Anyone).';
      err.hidden = false;
    });
  });

  state.rows = load(K.rows, []);
  state.queue = load(K.queue, []);
  if (endpoint()) showApp(); else showSetup(false);
})();
