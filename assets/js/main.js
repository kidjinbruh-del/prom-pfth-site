/* ═══════════════════════════════════════════════════════════
   ПРОФТЕХ — main.js
   Без зависимостей. Формы, файлы, UTM, цели Яндекс.Метрики.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────── КОНФИГУРАЦИЯ ─────────── */
  var CONFIG = {
    // Куда отправляется заявка. Замените на свой обработчик или вебхук CRM
    // (Битрикс24 crm.lead.add, amoCRM, свой backend и т.п.)
    endpoint: /\.github\.io$/i.test(location.hostname)
      ? 'https://prom.pfth.ru/api/lead'
      : '/api/lead',

    // Номер счётчика Яндекс.Метрики. Укажите после установки счётчика.
    ymCounterId: 112150338,

    maxTotalSize: 20 * 1024 * 1024, // 20 МБ суммарно
    maxFiles: 10,

    // Ключи, которые сохраняем из URL и передаём в CRM
    utmKeys: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'],
    clickIds: ['yclid', 'gclid', '_ym_uid']
  };

  var PAGES_MIRROR = /\.github\.io$/i.test(location.hostname);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ─────────── АНАЛИТИКА ───────────
     track() безопасно работает, даже если Метрика ещё не загружена
     или счётчик не указан. Дублируем в dataLayer для GTM / Google Analytics. */
  function track(goal, params) {
    params = params || {};
    try {
      if (CONFIG.ymCounterId && typeof window.ym === 'function') {
        window.ym(CONFIG.ymCounterId, 'reachGoal', goal, params);
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: goal }, params));
    } catch (e) { /* аналитика не должна ломать страницу */ }

    if (window.__PT_DEBUG) console.log('[goal]', goal, params);
    pushActivity(goal, activityDetail(params));
  }

  var PUSH_GOALS = {
    phone_click: 1,
    email_click: 1,
    cta_click: 1,
    file_attach: 1,
    form_fail: 1,
    eq_card_open: 1,
    eq_direct_visit: 1,
    form_start: 1
  };
  var lastPush = {};

  function activityDetail(params) {
    params = params || {};
    var parts = [];
    if (params.text) parts.push(String(params.text));
    else if (params.intent) parts.push(String(params.intent));
    else if (params.title) parts.push(String(params.title));
    else if (params.eq) parts.push(String(params.eq));
    else if (params.phone) parts.push(String(params.phone));
    if (params.place) parts.push(String(params.place));
    if (params.count) parts.push(String(params.count) + ' файл.');
    return parts.join(' · ').slice(0, 180);
  }

  function pushActivity(event, detail) {
    if (PAGES_MIRROR) return;
    if (!PUSH_GOALS[event]) return;
    var key = event + '|' + (detail || '');
    var now = Date.now();
    if (lastPush[key] && now - lastPush[key] < 15000) return;
    lastPush[key] = now;
    var body = new URLSearchParams();
    body.set('event', event);
    body.set('detail', detail || '');
    body.set('page_url', location.href);
    body.set('utm_source', attribution.utm_source || '');
    body.set('session_id', getSessionId());
    fetch('/api/event', { method: 'POST', body: body, keepalive: true }).catch(function () {});
  }
  window.ptTrack = track; // доступно снаружи для ручных вызовов

  /* ─────────── UTM-МЕТКИ И ИСТОЧНИК ───────────
     Сохраняем в sessionStorage: пользователь может уйти на другую
     страницу и вернуться — источник не потеряется. */
  var STORE = 'pt_attr';

  function readAttribution() {
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch (e) { saved = {}; }

    var qs = new URLSearchParams(location.search);
    var fresh = {};
    CONFIG.utmKeys.concat(CONFIG.clickIds).forEach(function (k) {
      var v = qs.get(k);
      if (v) fresh[k] = v;
    });

    // Новые метки перекрывают старые; при их отсутствии остаётся первый источник
    var data = Object.assign({}, saved, fresh);
    if (!data.landing_url) data.landing_url = location.href;
    if (!data.first_referrer) data.first_referrer = document.referrer || 'direct';

    try { sessionStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* приватный режим */ }
    return data;
  }

  var attribution = readAttribution();

  function detectFunnel() {
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('prom.pfth.ru') !== -1 || host.indexOf('prom.') === 0) return 'prom';
    return 'proftech-site';
  }

  function fillHiddenFields() {
    CONFIG.utmKeys.concat(['yclid']).forEach(function (k) {
      var el = document.getElementById(k);
      if (el) el.value = attribution[k] || '';
    });
    var page = $('#fld-page'); if (page) page.value = location.href;
    var ref = $('#fld-ref'); if (ref) ref.value = attribution.first_referrer || '';
    var funnel = $('#fld-funnel'); if (funnel) funnel.value = detectFunnel();

    // ClientID Метрики — позволяет связать заявку в CRM с визитом
    var cid = $('#ym_client_id');
    if (cid && CONFIG.ymCounterId && typeof window.ym === 'function') {
      try {
        window.ym(CONFIG.ymCounterId, 'getClientID', function (id) { cid.value = id || ''; });
      } catch (e) { /* нет счётчика */ }
    }
  }
  fillHiddenFields();

  /* ─────────── УЧЁТ ПОСЕТИТЕЛЕЙ (дашборд) ─────────── */
  function getSessionId() {
    var key = 'pt_sid';
    try {
      var sid = sessionStorage.getItem(key);
      if (!sid) {
        sid = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem(key, sid);
      }
      return sid;
    } catch (e) { return 'anon'; }
  }

  function trackVisit() {
    if (PAGES_MIRROR) return;
    var sentKey = 'pt_visit_sent';
    try { if (sessionStorage.getItem(sentKey)) return; } catch (e) { /* private mode */ }

    var body = new URLSearchParams();
    body.set('session_id', getSessionId());
    body.set('page_url', location.href);
    body.set('referrer', attribution.first_referrer || document.referrer || '');
    body.set('utm_source', attribution.utm_source || '');
    body.set('funnel', detectFunnel());

    fetch('/api/visit', { method: 'POST', body: body, keepalive: true })
      .then(function () { try { sessionStorage.setItem(sentKey, '1'); } catch (e) {} })
      .catch(function () { /* тихо */ });
  }
  trackVisit();

  /* ─────────── ЧИСТЫЕ URL БЕЗ # (/zayavka вместо #zayavka) ─────────── */
  var SECTION_IDS = {
    problema: 1, uslugi: 1, process: 1, baza: 1, oborudovanie: 1, keysy: 1,
    zakazchiki: 1, faq: 1, kontakty: 1, zayavka: 1, sravnenie: 1, ekspertiza: 1,
    'o-kompanii': 1, 'usloviya-b2b': 1, 'remont-liniy': 1, 'remont-oborudovaniya': 1,
    modernizaciya: 1, avtomatizaciya: 1, main: 1
  };

  function pathSection() {
    var p = (location.pathname || '/').replace(/^\/+|\/+$/g, '');
    if (!p) return '';
    var file = p.split('/').pop();
    // Каждая страница архива — полная копия с собственным canonical.
    // При прямом открытии /uslugi.html прокручиваем к блоку «Услуги».
    if (/\.html?$/i.test(file)) {
      var base = file.replace(/\.html?$/i, '');
      return base !== 'index' && SECTION_IDS[base] ? base : '';
    }
    return SECTION_IDS[p] ? p : '';
  }

  function scrollToSection(id, behavior) {
    if (!id) {
      window.scrollTo({ top: 0, behavior: behavior || 'auto' });
      return;
    }
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: behavior || 'smooth', block: 'start' });
    if (id === 'zayavka') {
      setTimeout(function () {
        var first = $('#lead-form input[name="name"]');
        if (first && window.innerWidth > 900) first.focus({ preventScroll: true });
      }, 400);
    }
  }

  // Старые ссылки с # → /путь
  if (location.hash && location.hash.length > 1) {
    var hashId = location.hash.slice(1);
    if (SECTION_IDS[hashId] || hashId === 'hero') {
      var clean = hashId === 'hero' ? '/' : '/' + hashId;
      history.replaceState(null, '', clean + location.search);
    }
  }

  function applyRoute(behavior) {
    var id = pathSection();
    if (id) scrollToSection(id, behavior);
    else if (location.pathname === '/' || location.pathname === '') {
      /* home */
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var path = href.split('?')[0].split('#')[0];
    if (path === '/') {
      e.preventDefault();
      history.pushState(null, '', '/' + location.search);
      scrollToSection('', 'smooth');
      return;
    }
    var id = path.replace(/^\//, '').replace(/\/$/, '');
    if (!SECTION_IDS[id]) return;
    e.preventDefault();
    history.pushState(null, '', '/' + id + location.search);
    scrollToSection(id, 'smooth');
  });

  window.addEventListener('popstate', function () { applyRoute('smooth'); });

  // Прямой заход на /uslugi.html, /zayavka.html, ... — сразу к нужному блоку.
  (function initialRoute() {
    var id = pathSection();
    if (!id) return;
    scrollToSection(id, 'auto');
    // Шрифты и картинки могут сдвинуть вёрстку после первой отрисовки.
    window.addEventListener('load', function () {
      if (window.pageYOffset < 200) scrollToSection(id, 'auto');
    });
  })();

  // Контекст CTA переживает переход на страницу заявки.
  function restoreFormContext() {
    try {
      var savedIntent = sessionStorage.getItem('pt_intent');
      if (savedIntent) {
        var intentField = $('#fld-intent');
        if (intentField) intentField.value = savedIntent;
        sessionStorage.removeItem('pt_intent');
      }
    } catch (e) {}
    try {
      if (sessionStorage.getItem('pt_focus_file')) {
        sessionStorage.removeItem('pt_focus_file');
        setTimeout(function () {
          var target = $('#drop');
          if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 700);
      }
    } catch (e) {}
  }
  restoreFormContext();

  /* ─────────── ШАПКА И МОБИЛЬНОЕ МЕНЮ ─────────── */
  var hdr = $('#hdr'), nav = $('#nav'), burger = $('#burger');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var fab = $('#cta-fab');
  var mbar = $('#mbar');
  var kontakty = $('#kontakty');
  var footer = $('.ftr');
  var onScroll = function () {
    var y = window.pageYOffset;
    if (hdr) hdr.classList.toggle('is-stuck', y > 20);
    var footerVisible = footer && footer.getBoundingClientRect().top < window.innerHeight;
    if (fab) fab.classList.toggle('is-on', y > 700 && !footerVisible);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Мобильная панель — только в блоке Контакты */
  if (mbar && kontakty && 'IntersectionObserver' in window) {
    var mbarObs = new IntersectionObserver(
      function (entries) {
        var on = entries.some(function (e) { return e.isIntersecting; });
        mbar.classList.toggle('is-on', on);
        document.body.classList.toggle('mbar-on', on);
      },
      { root: null, threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    mbarObs.observe(kontakty);
  }
  /* ─────────── ЕДИНАЯ ОБРАБОТКА КЛИКОВ ───────────
     Все CTA, телефоны и почта размечены data-goal — одна делегированная
     точка вместо десятка обработчиков. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-goal]');
    if (!el) return;

    var goal = el.getAttribute('data-goal');
    var payload = {
      id: el.id || null,
      place: el.getAttribute('data-goal-place') || null,
      intent: el.getAttribute('data-intent') || null,
      text: (el.textContent || '').trim().slice(0, 60)
    };

    if (goal === 'phone_click') payload.phone = el.getAttribute('href');
    track(goal, payload);

    // CTA передаёт свой контекст в форму: в CRM видно, из какого блока заявка.
    // Ссылки ведут на отдельные .html-страницы, поэтому контекст переживает
    // переход через sessionStorage.
    var intent = el.getAttribute('data-intent');
    if (intent) {
      var fld = $('#fld-intent');
      if (fld) fld.value = intent;
      try { sessionStorage.setItem('pt_intent', intent); } catch (e) {}
    }

    // «Отправить оборудование на диагностику» — сразу к прикреплению файлов
    if (el.hasAttribute('data-focus-file')) {
      try { sessionStorage.setItem('pt_focus_file', '1'); } catch (e) {}
      setTimeout(function () {
        var drop = $('#drop');
        if (drop) drop.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 600);
    } else if ((el.getAttribute('href') || '').indexOf('zayavka') !== -1) {
      setTimeout(function () {
        var first = $('#lead-form input[name="name"]');
        if (first && window.innerWidth > 900) first.focus({ preventScroll: true });
      }, 700);
    }
  });

  /* ─────────── FAQ: цель на раскрытие ─────────── */
  $$('.faq__i').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      var q = d.querySelector('summary h3');
      track('faq_open', { question: q ? q.textContent.trim() : '' });
    });
  });

  /* ─────────── КАРТОЧКИ ОБОРУДОВАНИЯ (раскрытие, URL-параметры, цели) ─────────── */
  var eqCards = $$('.eq__i');

  function clearEqRowPeers() {
    eqCards.forEach(function (c) { c.classList.remove('is-row-peer'); });
  }

  function getEqRowPeers(card) {
    // Сравниваем верх карточек: в одном ряду offsetTop одинаковый (с учётом колонок сетки)
    var top = card.offsetTop;
    return eqCards.filter(function (c) {
      return Math.abs(c.offsetTop - top) < 4;
    });
  }

  function syncEqRowPeers(activeCard) {
    clearEqRowPeers();
    if (!activeCard || !activeCard.classList.contains('is-open')) return;
    getEqRowPeers(activeCard).forEach(function (c) {
      c.classList.add('is-row-peer');
    });
  }

  function setEqCardState(card, open) {
    var head = $('.eq__head', card);
    var label = $('.eq__trigger-label', card);
    if (open) {
      card.classList.add('is-open');
      if (head) head.setAttribute('aria-expanded', 'true');
      if (label) label.textContent = 'Свернуть';
    } else {
      card.classList.remove('is-open');
      if (head) head.setAttribute('aria-expanded', 'false');
      if (label) label.textContent = 'Подробнее';
    }
  }

  function toggleEqCard(card, viaUser) {
    var isOpen = card.classList.contains('is-open');
    eqCards.forEach(function (c) {
      if (c !== card) setEqCardState(c, false);
    });
    setEqCardState(card, !isOpen);
    syncEqRowPeers(!isOpen ? card : null);

    if (!isOpen) {
      var slug = card.getAttribute('data-eq') || '';
      var title = ($('h3', card) ? $('h3', card).textContent.trim() : slug);
      track('eq_card_open', { eq: slug, title: title });

      if (viaUser) {
        setTimeout(function () {
          var rect = card.getBoundingClientRect();
          if (rect.bottom > window.innerHeight) {
            window.scrollBy({ top: Math.min(rect.bottom - window.innerHeight + 30, rect.top - 80), behavior: 'smooth' });
          }
        }, 220);
      }
    }
  }

  eqCards.forEach(function (card) {
    var head = $('.eq__head', card);
    if (!head) return;
    head.addEventListener('click', function (e) {
      e.preventDefault();
      toggleEqCard(card, true);
    });
    head.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleEqCard(card, true);
      }
    });
  });

  // При ресайзе ряд может измениться (4→3→2→1 колонки) — пересчитываем соседей
  var eqResizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(eqResizeTimer);
    eqResizeTimer = setTimeout(function () {
      var open = eqCards.filter(function (c) { return c.classList.contains('is-open'); })[0];
      syncEqRowPeers(open || null);
    }, 120);
  });

  function checkEqDeepLink() {
    var params = new URLSearchParams(location.search);
    var eqSlug = params.get('eq') || params.get('equipment');
    if (!eqSlug && location.hash) {
      var hash = location.hash.replace(/^#/, '');
      if (hash.startsWith('eq-')) eqSlug = hash.slice(3);
      else if ($('.eq__i[data-eq="' + hash + '"]')) eqSlug = hash;
    }
    if (!eqSlug) return;

    var targetCard = $('.eq__i[data-eq="' + eqSlug + '"]') || document.getElementById('eq-' + eqSlug);
    if (targetCard) {
      setTimeout(function () {
        eqCards.forEach(function (c) { setEqCardState(c, false); });
        setEqCardState(targetCard, true);
        syncEqRowPeers(targetCard);
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.classList.add('is-highlighted');
        setTimeout(function () {
          targetCard.classList.remove('is-highlighted');
        }, 3600);
        track('eq_direct_visit', { eq: eqSlug });
      }, 300);
    }
  }
  checkEqDeepLink();
  window.addEventListener('hashchange', checkEqDeepLink);

  /* ─────────── ТЕЛЕФОННАЯ МАСКА ─────────── */
  var phone = $('#fld-phone');
  if (phone) {
    var fmt = function (raw) {
      var d = raw.replace(/\D/g, '');
      if (!d) return '';
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      var out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    };
    phone.addEventListener('input', function () {
      var atEnd = phone.selectionStart === phone.value.length;
      phone.value = fmt(phone.value);
      if (atEnd) phone.selectionStart = phone.selectionEnd = phone.value.length;
    });
    phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+7 ('; });
    phone.addEventListener('blur', function () { if (phone.value.replace(/\D/g, '').length < 2) phone.value = ''; });
  }

  /* ─────────── ПРИКРЕПЛЕНИЕ ФАЙЛОВ ─────────── */
  var fileInput = $('#fld-files');
  var filesList = $('#files-list');
  var drop = $('#drop');
  var picked = []; // собственный список: input.files доступен только на чтение

  function human(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  }

  function syncInput() {
    if (!fileInput || typeof DataTransfer === 'undefined') return;
    var dt = new DataTransfer();
    picked.forEach(function (f) { dt.items.add(f); });
    fileInput.files = dt.files;
  }

  function renderFiles() {
    if (!filesList) return;
    filesList.innerHTML = '';
    picked.forEach(function (f, i) {
      var li = document.createElement('li');
      var b = document.createElement('b'); b.textContent = f.name;
      var s = document.createElement('span'); s.textContent = human(f.size);
      var x = document.createElement('button');
      x.type = 'button'; x.innerHTML = '&times;';
      x.setAttribute('aria-label', 'Удалить ' + f.name);
      x.addEventListener('click', function () {
        picked.splice(i, 1); syncInput(); renderFiles(); validateFiles();
      });
      li.appendChild(b); li.appendChild(s); li.appendChild(x);
      filesList.appendChild(li);
    });
  }

  function totalSize() {
    return picked.reduce(function (a, f) { return a + f.size; }, 0);
  }

  function validateFiles() {
    var err = $('#files-err');
    var wrap = err ? err.closest('.fld') : null;
    var msg = '';
    if (picked.length > CONFIG.maxFiles) msg = 'Не более ' + CONFIG.maxFiles + ' файлов за раз.';
    else if (totalSize() > CONFIG.maxTotalSize) msg = 'Суммарный размер файлов превышает 20 МБ. Пришлите ключевые фото или отправьте архив на почту.';
    if (err) err.textContent = msg;
    if (wrap) wrap.classList.toggle('is-err', !!msg);
    return !msg;
  }

  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      var dup = picked.some(function (p) { return p.name === f.name && p.size === f.size; });
      if (!dup) picked.push(f);
    });
    syncInput(); renderFiles();
    if (validateFiles() && picked.length) {
      track('file_attach', { count: picked.length, total_size_kb: Math.round(totalSize() / 1024) });
    }
  }

  if (fileInput) {
    fileInput.addEventListener('change', function () { addFiles(fileInput.files); });
  }

  if (drop) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
  }

  /* ─────────── ВАЛИДАЦИЯ И ОТПРАВКА ФОРМЫ ─────────── */
  var form = $('#lead-form');

  function setErr(input, msg) {
    var fld = input.closest('.fld');
    if (!fld) return;
    fld.classList.toggle('is-err', !!msg);
    var box = fld.querySelector('[data-err]');
    if (box) box.textContent = msg || '';
  }

  function validate() {
    var ok = true;

    var name = form.elements['name'];
    if (!name.value.trim()) { setErr(name, 'Укажите, как к вам обращаться'); ok = false; }
    else setErr(name, '');

    var tel = form.elements['phone'];
    var digits = tel.value.replace(/\D/g, '');
    if (digits.length !== 11) { setErr(tel, 'Укажите телефон в формате +7 (___) ___-__-__'); ok = false; }
    else setErr(tel, '');

    var em = form.elements['email'];
    if (em && em.value.trim()) {
      var emVal = em.value.trim();
      var re = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
      if (!re.test(emVal)) { setErr(em, 'Укажите корректный email (например, name@company.ru)'); ok = false; }
      else setErr(em, '');
    } else if (em) {
      setErr(em, '');
    }

    var inn = form.elements['inn'];
    if (inn && inn.value.trim()) {
      var innDigits = inn.value.replace(/\D/g, '');
      if (innDigits.length !== 10 && innDigits.length !== 12) {
        setErr(inn, 'ИНН должен состоять из 10 (для юрлиц) или 12 цифр');
        ok = false;
      } else {
        setErr(inn, '');
      }
    } else if (inn) {
      setErr(inn, '');
    }

    var consent = form.elements['privacy_consent'];
    if (!consent || !consent.checked) {
      if (consent) setErr(consent, 'Подтвердите согласие на обработку персональных данных');
      ok = false;
    } else {
      setErr(consent, '');
    }

    if (!validateFiles()) ok = false;
    return ok;
  }

  if (form) {
    form.addEventListener('focusin', function onFormStart() {
      form.removeEventListener('focusin', onFormStart);
      pushActivity('form_start', '');
    });
    ['name', 'phone', 'email', 'inn'].forEach(function (n) {
      var el = form.elements[n];
      if (el) el.addEventListener('input', function () { if (el.closest('.fld').classList.contains('is-err')) validate(); });
    });
    var consent = form.elements['privacy_consent'];
    if (consent) consent.addEventListener('change', function () { setErr(consent, consent.checked ? '' : 'Подтвердите согласие на обработку персональных данных'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var btn = $('#cta-form-submit');
      var msg = $('#form-msg');
      msg.className = 'frm__msg';

      if (!validate()) {
        var bad = form.querySelector('.fld.is-err input, .fld.is-err textarea');
        if (bad) bad.focus();
        track('form_error', { form: 'lead' });
        return;
      }

      // Honeypot: бот заполняет скрытое поле — тихо имитируем успех
      if (form.elements['company_site'] && form.elements['company_site'].value) {
        msg.className = 'frm__msg is-ok';
        msg.textContent = 'Заявка отправлена.';
        return;
      }

      var fd = new FormData(form);
      // Явно кладём файлы из picked (один раз — браузер шлёт name="files[]")
      fd.delete('files[]');
      fd.delete('files');
      picked.forEach(function (f) {
        fd.append('files[]', f, f.name);
      });
      Object.keys(attribution).forEach(function (k) {
        if (!fd.has(k)) fd.append(k, attribution[k]);
      });
      fd.append('files_count', String(picked.length));
      fd.append('sent_at', new Date().toISOString());
      // Актуальный URL без устаревшего #
      fd.set('page_url', location.href);
      fd.set('funnel', detectFunnel());

      btn.classList.add('is-loading');

      fetch(CONFIG.endpoint, {
        method: 'POST',
        body: fd,
        mode: PAGES_MIRROR ? 'no-cors' : 'cors'
      })
        .then(function (r) {
          if (PAGES_MIRROR) return {};
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json().catch(function () { return {}; });
        })
        .then(function () {
          msg.className = 'frm__msg is-ok';
          msg.textContent = 'Заявка принята. Инженер свяжется с вами и уточнит детали по оборудованию.';
          track('form_submit', {
            form: 'lead',
            intent: fd.get('intent'),
            has_files: picked.length > 0,
            files_count: picked.length
          });
          form.reset();
          picked = []; syncInput(); renderFiles();
          fillHiddenFields();
        })
        .catch(function (err) {
          msg.className = 'frm__msg is-bad';
          msg.innerHTML = 'Не удалось отправить заявку. Позвоните нам: ' +
            '<a href="tel:+74912972052">+7 (4912) 97-20-52</a> ' +
            'или напишите на <a href="mailto:prom.pfth@yandex.ru">prom.pfth@yandex.ru</a>.';
          track('form_fail', { form: 'lead', reason: String(err && err.message) });
        })
        .finally(function () {
          btn.classList.remove('is-loading');
          msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    });
  }

  /* ─────────── ПРОСМОТР БЛОКОВ И ПОЯВЛЕНИЕ ───────────
     Цель на просмотр секции показывает, до какого блока доскроллил
     трафик из Яндекс Директа. */
  if ('IntersectionObserver' in window) {
    var seen = {};
    var sections = $$('section[id]');
    var viewObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || seen[en.target.id]) return;
        seen[en.target.id] = true;
        track('section_view', {
          section: en.target.id,
          ad_group: en.target.getAttribute('data-ad-group') || null
        });
      });
    }, { threshold: 0.35 });
    sections.forEach(function (s) { viewObs.observe(s); });

    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealObs.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    $$('.sec__head, .svc, .prob, .step, .exp__i, .case, .cmp__col, .callout, .about__txt, .eq__i, .faq__i')
      .forEach(function (el) { el.classList.add('rv'); revealObs.observe(el); });
  }

  /* ─────────── ЦЕЛЬ НА ВОВЛЕЧЁННОСТЬ ───────────
     Отсекает нецелевой трафик: посетитель провёл на странице 30+ секунд. */
  setTimeout(function () { track('engaged_30s'); }, 30000);

  /* ─────────── КОНСОЛЬ: события в такт видео ─────────── */
  (function initConsoleSync() {
    var video = $('#console-video');
    var rows = $$('#console-events .panel__row');
    var slide = $('#console-slide');
    var led = $('#console-led');
    var code = $('#console-code');
    if (!video || !rows.length) return;

    var STORY_RATE = 1.162;
    var lastRow = rows[rows.length - 1];
    var finaleFrom = parseFloat(lastRow.getAttribute('data-from')) || 31.5;

    function setStoryRate() {
      try {
        video.defaultPlaybackRate = STORY_RATE;
        if (video.playbackRate !== STORY_RATE) video.playbackRate = STORY_RATE;
      } catch (e) {}
    }

    function playStory() {
      setStoryRate();
      var play = video.play();
      if (play && play.catch) play.catch(function () {});
    }

    function restartStory() {
      try { video.currentTime = 0; } catch (e) {}
      playStory();
    }

    function loopFinale() {
      try { video.currentTime = finaleFrom; } catch (e) {}
      playStory();
    }

    setStoryRate();
    video.addEventListener('loadedmetadata', setStoryRate);
    video.addEventListener('play', setStoryRate);
    playStory();

    var slides = [
      { from: 0, to: 5.0, text: 'Простой: линия не выпускает продукцию', mode: 'warn' },
      { from: 5.0, to: 7.5, text: 'Сбои нарастают — без вмешательства будет авария', mode: 'warn' },
      { from: 7.5, to: 10.0, text: 'Авария: линия стоит, производство остановлено', mode: 'alert' },
      { from: 10.0, to: 13.0, text: 'Отказ систем: конвейер и продукция под угрозой', mode: 'alert' },
      { from: 13.0, to: 19.5, text: 'Приняли звонок — инженер ПРОФТЕХ уже в пути', mode: 'check' },
      { from: 19.5, to: 22.5, text: 'На объекте: подключаемся и ищем причину', mode: 'check' },
      { from: 22.5, to: 25.5, text: 'Причина найдена — готовим восстановление', mode: 'check' },
      { from: 25.5, to: 28.5, text: 'Устраняем отказ: ремонт и замена узла', mode: 'alert' },
      { from: 28.5, to: 31.5, text: 'Настраиваем линию после ремонта', mode: 'alert' },
      { from: 31.5, to: 37.0, text: 'Готово: линия снова работает в штатном режиме', mode: 'ok' },
      { from: 37.0, to: 42.0, text: 'Производство восстановлено — поток идёт', mode: 'ok' },
      { from: 42.0, to: 47.5, text: 'Автоматика в цикле: роботы и узлы на связи', mode: 'ok' },
      { from: 47.5, to: 99, text: 'Результат: линия выпускает продукцию', mode: 'ok' }
    ];

    function setStatus(mode, label) {
      if (led) {
        led.className = 'panel__led';
        if (mode === 'warn') led.classList.add('panel__led--warn');
        else if (mode === 'alert') led.classList.add('panel__led--alert');
        else led.classList.add('panel__led--on');
      }
      if (code) {
        code.textContent = label;
        code.classList.toggle('is-warn', mode === 'warn');
        code.classList.toggle('is-alert', mode === 'alert');
      }
    }

    function setSlide(mode, text) {
      if (!slide) return;
      slide.textContent = text;
      slide.className = 'panel__slide';
      if (mode) slide.classList.add('is-' + mode);
    }

    function sync() {
      var t = video.currentTime || 0;
      var activeRow = null;

      rows.forEach(function (row) {
        var from = parseFloat(row.getAttribute('data-from')) || 0;
        var to = parseFloat(row.getAttribute('data-to')) || 0;
        var shown = t >= from;
        var active = shown && t < to;
        var done = t >= to && to < 90;
        var success = shown && !!row.querySelector('.panel__v--ok');

        row.classList.toggle('is-shown', shown);
        row.classList.toggle('is-active', active);
        row.classList.toggle('is-done', done && !active);
        row.classList.toggle('is-success', success);
        if (active) activeRow = row;
      });

      var currentSlide = slides[0];
      for (var i = 0; i < slides.length; i++) {
        if (t >= slides[i].from && t < slides[i].to) {
          currentSlide = slides[i];
          break;
        }
      }
      setSlide(currentSlide.mode, currentSlide.text);

      if (t < 7.5) {
        setStatus('warn', t < 5.0 ? 'HOLD' : 'WARN');
      } else if (t < 31.5) {
        var label = 'STOP';
        if (t >= 28.5) label = 'CAL';
        else if (t >= 25.5) label = 'FIX';
        else if (t >= 19.5) label = 'DIAG';
        else if (t >= 13.0) label = 'GO';
        setStatus('alert', label);
      } else {
        setStatus('ok', 'OK');
      }
    }

    video.addEventListener('timeupdate', sync);
    video.addEventListener('seeked', sync);
    video.addEventListener('play', sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('ended', loopFinale);
    $$('.logo').forEach(function (logo) {
      logo.addEventListener('click', function () { restartStory(); });
    });
    sync();
  })();
})();
