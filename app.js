(function () {
  'use strict';
  var API = (window.WEDDING_CONFIG && window.WEDDING_CONFIG.API_URL) || '';
  var DAYS = [16, 17, 18, 19, 20];
  var DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var FIXED_LODGING = [
    { code: 'villa', name: 'ישן/ה בווילה', note: 'רק למי שסוכם איתנו מראש.' },
    { code: 'self', name: 'מסדר/ת לבד', note: 'מלון, דירה או משפחה אחרת. לא צריכים מאיתנו כלום.' },
    { code: 'undecided', name: 'עדיין לא החלטתי', note: 'אפשר לחזור ולעדכן.' }
  ];
  // גיבוי אם טעינת האפשרויות נכשלה. בלי מחיר ובלי קוד הנחה, בכוונה.
  var FALLBACK_OPTIONS = [{ name: 'Seaside Village', description: 'יחידות אירוח בלימנארי, ליד פוליטיקה.', distance: 'כ-8 דקות נסיעה מחוף פוליטיקה', url: 'https://seasidevillage.gr', minNights: 2 }];

  var $ = function (id) { return document.getElementById(id); };
  var steps = Array.prototype.slice.call(document.querySelectorAll('.step'));
  var current = 0;
  var options = null;
  var state = { name: '', phone: '', adults: 1, children: 0, kidsAges: '', companions: '', arrive: '', depart: '', flight: '',
    transport: '', airport: 'אתונה (ATH)', landing: '', passengers: 1, lodging: '', rooms: [], notes: '', allergies: '' };
  var passengersTouched = false;
  var existing = false;

  // ---------- עזרים ----------
  function normalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.indexOf('0') === 0) d = '972' + d.slice(1);
    if (d.indexOf('9720') === 0) d = '972' + d.slice(4);
    return d.length >= 9 && d.length <= 15 ? d : '';
  }
  function dateStr(day) { return '2027-06-' + (day < 10 ? '0' : '') + day; }
  function dayNum(s) { return s ? parseInt(s.slice(8), 10) : 0; }
  function dayLabel(day) { return DOW[new Date(Date.UTC(2027, 5, day)).getUTCDay()] + ' ' + day + '.6'; }
  function nights() { return state.arrive && state.depart ? dayNum(state.depart) - dayNum(state.arrive) : null; }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function setErr(id, msg) { $(id).textContent = msg || ''; }
  function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.hidden = !msg; }

  function post(payload) {
    if (!API) return Promise.reject(new Error('no_api'));
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); });
  }

  // ---------- ניווט ----------
  var ticks = $('ticks');
  for (var t = 0; t < 6; t++) ticks.appendChild(document.createElement('b'));
  // כותרות מפוצלות למילים: השם הנגיש נשמר ב-aria-label והמילים מוסתרות מקוראי מסך. בלי JS הכותרת נשארת רגילה.
  document.documentElement.classList.add('js');
  steps.forEach(function (st) {
    var h = st.querySelector('h1,h2');
    if (!h) return;
    var text = h.textContent.trim();
    h.setAttribute('aria-label', text);
    h.textContent = '';
    text.split(/\s+/).forEach(function (word, i) {
      var sp = document.createElement('span');
      sp.className = 'w'; sp.setAttribute('aria-hidden', 'true'); sp.style.setProperty('--i', i);
      sp.textContent = word; h.appendChild(sp); h.appendChild(document.createTextNode(' '));
    });
  });
  function show(n) {
    var prev = current;
    current = n;
    document.body.setAttribute('data-dir', n < prev ? 'back' : 'fwd');
    document.body.classList.toggle('is-intro', n === 0);
    steps.forEach(function (s, i) { s.hidden = i !== n; s.classList.remove('in'); });
    var inApp = n >= 1 && n <= 6;
    $('topbar').hidden = n === 0;
    $('stepCount').textContent = inApp ? n + ' מתוך 6' : '';
    Array.prototype.forEach.call(ticks.children, function (b, i) { b.className = (inApp || n === 7) && i < (n === 7 ? 6 : n) ? 'on' + (i === n - 1 ? ' now' : '') : ''; });
    window.scrollTo(0, 0);
    var h = steps[n].querySelector('h1,h2');
    requestAnimationFrame(function () { steps[n].classList.add('in'); });
    if (h) { h.focus({ preventScroll: true }); }
  }

  // ---------- סטפרים ----------
  var LIMITS = { adults: [1, 12], children: [0, 12], passengers: [1, 40] };
  function renderCounts() {
    ['adults', 'children', 'passengers'].forEach(function (k) { $(k).textContent = state[k]; });
    $('kidsAgesField').hidden = state.children === 0;
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-inc],[data-dec]');
    if (!t) return;
    var k = t.getAttribute('data-inc') || t.getAttribute('data-dec');
    var d = t.hasAttribute('data-inc') ? 1 : -1;
    var next = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], state[k] + d));
    state[k] = next;
    if (k === 'passengers') passengersTouched = true;
    if (!passengersTouched) state.passengers = Math.min(40, Math.max(1, state.adults + state.children));
    renderCounts();
  });

  // ---------- תאריכים ----------
  function buildChips() {
    [['arrive', 'arriveChips', DAYS.slice(0, 4)], ['depart', 'departChips', DAYS.slice(1)]].forEach(function (cfg) {
      var box = $(cfg[1]);
      cfg[2].forEach(function (day) {
        var lab = el('label', { 'class': 'chip' });
        var inp = el('input', { type: 'radio', name: cfg[0], value: dateStr(day) });
        var txt = day === 18 ? dayLabel(day) + ' · החתונה' : dayLabel(day);
        lab.appendChild(inp); lab.appendChild(el('span', {}, txt));
        inp.addEventListener('change', function () { state[cfg[0]] = inp.value; refreshDates(); });
        box.appendChild(lab);
      });
    });
  }
  function refreshDates() {
    // לא ניתן לבחור עזיבה לפני הגעה
    document.querySelectorAll('#departChips input').forEach(function (i) {
      i.disabled = !!state.arrive && dayNum(i.value) < dayNum(state.arrive);
      if (i.disabled && i.checked) { i.checked = false; state.depart = ''; }
    });
    document.querySelectorAll('#arriveChips input').forEach(function (i) { i.checked = i.value === state.arrive; });
    document.querySelectorAll('#departChips input').forEach(function (i) { i.checked = i.value === state.depart; });
    var n = nights();
    $('nights').textContent = n === null ? '' : n === 0 ? 'ביום אחד, בלי לינה' : n === 1 ? 'לילה אחד' : n + ' לילות';
    setErr('err-arrive', ''); setErr('err-depart', '');
  }

  // ---------- הסעה ----------
  function refreshTransport() {
    document.querySelectorAll('input[name=transport]').forEach(function (i) { i.checked = i.value === state.transport; });
    $('shuttleFields').hidden = state.transport !== 'shuttle';
    if (state.transport === 'shuttle' && !passengersTouched) state.passengers = Math.min(40, Math.max(1, state.adults + state.children));
    renderCounts();
  }
  document.querySelectorAll('input[name=transport]').forEach(function (i) {
    i.addEventListener('change', function () { state.transport = i.value; setErr('err-transport', ''); refreshTransport(); });
  });
  $('airport').addEventListener('change', function () {
    $('airportOtherField').hidden = $('airport').value !== '__other';
  });

  // ---------- לינה ----------
  function renderLodging() {
    var box = $('lodgingCards');
    box.textContent = '';
    (options || FALLBACK_OPTIONS).forEach(function (o) {
      var card = el('div', { 'class': 'card lodge' });
      var row = el('label', { 'class': 'row' });
      row.appendChild(el('input', { type: 'radio', name: 'lodging', value: o.name }));
      var body = el('span');
      body.appendChild(el('b', {}, 'אני מזמין/ה ב-' + o.name));
      if (o.description) body.appendChild(el('small', {}, o.description));
      if (o.distance) body.appendChild(el('small', {}, o.distance));
      if (o.minNights) body.appendChild(el('small', {}, 'מינימום ' + o.minNights + ' לילות.'));
      if (o.price) {
        body.appendChild(el('span', { 'class': 'price' }, o.price));
        if (o.priceSource) body.appendChild(el('small', {}, o.priceSource));
      } else {
        body.appendChild(el('small', {}, 'המחיר באתר שלהם.'));
      }
      if (o.code) body.appendChild(el('span', { 'class': 'code' }, 'קוד הנחה: ' + o.code));
      row.appendChild(body); card.appendChild(row);
      card.dataset.place = o.name;
      if (o.rooms && o.rooms.length) card.appendChild(roomsPanel(o));
      if (o.url && /^https:\/\//i.test(o.url)) {
        var a = el('a', { 'class': 'book', href: o.url, target: '_blank', rel: 'noopener noreferrer' }, 'להזמנה אצלם ←');
        card.appendChild(a);
      }
      box.appendChild(card);
    });
    FIXED_LODGING.forEach(function (f) {
      var lab = el('label', { 'class': 'card' });
      lab.appendChild(el('input', { type: 'radio', name: 'lodging', value: f.code }));
      var s = el('span'); s.appendChild(el('b', {}, f.name)); s.appendChild(el('small', {}, f.note));
      lab.appendChild(s); box.appendChild(lab);
    });
    box.querySelectorAll('input[type=radio]').forEach(function (i) {
      i.addEventListener('change', function () { state.lodging = i.value; setErr('err-lodging', ''); lodgingWarn(); syncRooms(); });
    });
    syncLodging();
  }
  // חדרים של מקום: מוצגים רק כשהמקום נבחר. סימון = העדפה, לא הזמנה.
  function roomsPanel(o) {
    var panel = el('div', { 'class': 'rooms', hidden: '' });
    panel.appendChild(el('p', { 'class': 'rooms-hint' }, 'ככה נראים החדרים. סמנו את מה שבא לכם (אפשר כמה). זו העדפה בלבד, לא הזמנה, והזמינות אצלם.'));
    var list = el('div', { 'class': 'roomlist' });
    o.rooms.forEach(function (r) {
      var item = el('div', { 'class': 'room' });
      var lab = el('label', { 'class': 'roompick' });
      var cb = el('input', { type: 'checkbox', value: r.name });
      cb.checked = state.rooms.indexOf(r.name) !== -1;
      cb.addEventListener('change', function () {
        var i = state.rooms.indexOf(r.name);
        if (cb.checked && i === -1) state.rooms.push(r.name);
        if (!cb.checked && i !== -1) state.rooms.splice(i, 1);
      });
      lab.appendChild(cb);
      if (r.image) {
        var img = el('img', { src: r.image, alt: 'החדר ' + r.name, loading: 'lazy', decoding: 'async', width: '96', height: '96', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', function () { img.remove(); });
        lab.appendChild(img);
      }
      var info = el('span', { 'class': 'roominfo' });
      info.appendChild(el('b', {}, r.name + (r.type ? ' · ' + r.type : '')));
      var facts = [r.size, r.capacity, r.view].filter(Boolean).join(' · ');
      if (facts) info.appendChild(el('small', {}, facts));
      lab.appendChild(info);
      item.appendChild(lab);
      if (r.url) item.appendChild(el('a', { 'class': 'roomlink', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'לעוד תמונות ←'));
      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }
  function syncRooms() {
    $('lodgingCards').querySelectorAll('.card.lodge').forEach(function (card) {
      var panel = card.querySelector('.rooms');
      if (!panel) return;
      panel.hidden = !card.querySelector('.row input').checked;
      panel.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = state.rooms.indexOf(cb.value) !== -1; });
    });
  }
  function syncLodging() {
    $('lodgingCards').querySelectorAll('input[type=radio]').forEach(function (i) { i.checked = i.value === state.lodging; });
    syncRooms();
    lodgingWarn();
  }
  function lodgingWarn() {
    var w = $('lodgingWarn'), n = nights(), o = (options || FALLBACK_OPTIONS).filter(function (x) { return x.name === state.lodging; })[0];
    if (o && o.minNights && n !== null && n < o.minNights) {
      w.textContent = 'ב-' + o.name + ' המינימום הוא ' + o.minNights + ' לילות, ובחרתם ' + (n === 1 ? 'לילה אחד' : n + ' לילות') + '. אפשר לחזור ולשנות תאריכים, או להמשיך ונסדר.';
      w.hidden = false;
    } else w.hidden = true;
  }
  function loadOptions() {
    if (!API) { renderLodging(); return; }
    fetch(API + '?action=options').then(function (r) { return r.json(); })
      .then(function (r) { options = r.ok && r.options && r.options.length ? r.options : null; })
      .catch(function () { options = null; })
      .then(renderLodging);
  }

  // ---------- שמירת שדות טקסט ----------
  ['name', 'phone', 'kidsAges', 'companions', 'flight', 'landing', 'airportOther', 'notes', 'allergies'].forEach(function (id) {
    $(id).addEventListener('input', function () { state[id] = $(id).value; });
  });
  function syncInputs() {
    ['name', 'phone', 'kidsAges', 'companions', 'flight', 'landing', 'notes', 'allergies'].forEach(function (id) { $(id).value = state[id] || ''; });
    var other = state.airport && state.airport !== 'אתונה (ATH)';
    $('airport').value = other ? '__other' : 'אתונה (ATH)';
    $('airportOtherField').hidden = !other;
    $('airportOther').value = other ? state.airport : '';
    renderCounts(); refreshDates(); refreshTransport(); syncLodging();
  }

  // ---------- אימות לכל מסך ----------
  function validate(n) {
    if (n === 1) {
      var ok = true;
      if (state.name.trim().length < 2) { setErr('err-name', 'איך קוראים לכם?'); ok = false; } else setErr('err-name', '');
      if (!normalizePhone(state.phone)) { setErr('err-phone', 'נראה שחסרה ספרה או שהמספר לא תקין.'); ok = false; } else setErr('err-phone', '');
      return ok;
    }
    if (n === 3) {
      var good = true;
      if (!state.arrive) { setErr('err-arrive', 'באיזה יום מגיעים?'); good = false; }
      if (!state.depart) { setErr('err-depart', 'באיזה יום עוזבים?'); good = false; }
      return good;
    }
    if (n === 4) {
      if (!state.transport) { setErr('err-transport', 'בחרו אפשרות אחת.'); return false; }
      return true;
    }
    if (n === 5) {
      if (!state.lodging) { setErr('err-lodging', 'בחרו אפשרות אחת. אפשר "עדיין לא החלטתי".'); return false; }
      return true;
    }
    return true;
  }

  // ---------- שליחה וטעינה ----------
  function loadExisting() {
    var btn = $('detailsNext');
    btn.disabled = true;
    return post({ action: 'lookup', phone: state.phone, name: state.name })
      .then(function (r) {
        if (r.ok && r.found) {
          var a = r.answers;
          Object.keys(a).forEach(function (k) { if (k !== 'name' && a[k] !== '' && a[k] != null) state[k] = a[k]; });
          passengersTouched = !!a.passengers;
          syncInputs();
          existing = true; $('keepHint').hidden = false;
          banner('כבר מילאתם בעבר. הכנסנו את התשובות, אפשר לשנות.');
          return true;
        }
        if (r.ok && r.mismatch) {
          setErr('err-phone', 'הטלפון הזה כבר רשום בשם אחר. אם זה אתם, כתבו את השם כמו בפעם הקודמת (מספיק שם פרטי או משפחה), או כתבו ליותם ומאיה.');
          return false;
        }
        banner('');
        return true;
      })
      .catch(function () { banner('לא הצלחנו לבדוק אם מילאתם בעבר. אפשר להמשיך.'); return true; })
      .then(function (go) { btn.disabled = false; return go; });
  }

  function payload() {
    var p = JSON.parse(JSON.stringify(state));
    p.action = 'submit';
    p.hp = $('hp').value;
    p.rooms = payloadRooms();
    p.name = state.name.trim();
    if (p.transport === 'shuttle') {
      p.airport = $('airport').value === '__other' ? ($('airportOther').value.trim() || 'שדה אחר') : 'אתונה (ATH)';
      state.airport = p.airport;
    } else { p.airport = ''; p.landing = ''; p.passengers = ''; }
    return p;
  }

  var ERRORS = {
    name_mismatch: 'הטלפון הזה כבר רשום בשם אחר. כתבו את השם כמו בפעם הקודמת, או כתבו ליותם ומאיה.',
    bad_dates: 'בדקו את תאריכי ההגעה והעזיבה.',
    bad_lodging: 'אפשרות הלינה לא זוהתה. רעננו את הדף ובחרו שוב.'
  };
  function submit() {
    var btn = $('submitBtn'), p = payload();
    btn.disabled = true; setErr('err-submit', '');
    post(p).then(function (r) {
      if (!r.ok) { setErr('err-submit', ERRORS[r.error] || 'משהו השתבש בשמירה. נסו שוב בעוד רגע.'); btn.disabled = false; return; }
      renderSummary(); show(7); banner(''); btn.disabled = false;
    }).catch(function () {
      setErr('err-submit', API ? 'לא הצלחנו לשמור. בדקו חיבור ונסו שוב. התשובות נשמרו במסך.' : 'הטופס עוד לא מחובר לשמירה.');
      btn.disabled = false;
    });
  }

  function payloadRooms() {
    var chosen = (options || FALLBACK_OPTIONS).filter(function (x) { return x.name === state.lodging; })[0];
    var valid = chosen && chosen.rooms ? chosen.rooms.map(function (r) { return r.name; }) : [];
    return state.rooms.filter(function (n) { return valid.indexOf(n) !== -1; });
  }
  function renderSummary() {
    var dl = $('summary'); dl.textContent = '';
    var n = nights();
    var tr = { shuttle: 'צריך הסעה מהשדה', rental: 'שוכר/ת רכב', self: 'מסדר/ת לבד' }[state.transport];
    var lod = FIXED_LODGING.filter(function (f) { return f.code === state.lodging; })[0];
    var rows = [
      ['שם', state.name.trim()],
      ['מגיעים', state.adults + ' מבוגרים' + (state.children ? ', ' + state.children + ' ילדים' + (state.kidsAges ? ' (' + state.kidsAges + ')' : '') : '')],
      ['תאריכים', dayLabel(dayNum(state.arrive)) + ' עד ' + dayLabel(dayNum(state.depart)) + (n !== null ? ' (' + (n === 0 ? 'בלי לינה' : n === 1 ? 'לילה אחד' : n + ' לילות') + ')' : '')],
      ['הגעה', tr + (state.transport === 'shuttle' ? ', ' + state.passengers + ' נוסעים' + (state.landing ? ', נחיתה ' + state.landing : '') : '')],
      ['לינה', lod ? lod.name : state.lodging]
    ];
    var pickedRooms = payloadRooms();
    if (pickedRooms.length) rows.push(['חדרים שמעניינים אתכם', pickedRooms.join(', ')]);
    if (state.allergies) rows.push(['אלרגיות', state.allergies]);
    if (state.notes) rows.push(['הערות', state.notes]);
    rows.forEach(function (r) { var d = el('div'); d.appendChild(el('dt', {}, r[0])); d.appendChild(el('dd', {}, r[1])); dl.appendChild(d); });
  }

  // ---------- חיבור כפתורים ----------
  document.querySelectorAll('[data-next]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!validate(current)) return;
      if (current === 1) { loadExisting().then(function (go) { if (go) show(2); }); return; }
      if (current === 3 || current === 5) lodgingWarn();
      show(current + 1);
    });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show(current - 1); }); });
  $('editAgain').addEventListener('click', function () { show(2); });
  $('form').addEventListener('submit', function (e) { e.preventDefault(); if (current === 6) submit(); });
  $('form').addEventListener('keydown', function (e) {
    // Enter בתוך שדה לא שולח ולא מדלג על מסך
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      var next = steps[current].querySelector('[data-next]');
      if (next) next.click();
    }
  });

  buildChips(); renderCounts(); show(0); loadOptions();
})();
