import { ZONES, zone, partsAt, offsetAt, resolveLocal, convertInstant, transitionsForYear, officeSlots, parseTimestamp } from './core.mjs';

const $ = id => document.getElementById(id);
const DAY = 86400000;
const halfHour = 1800000;
let lastEuropeanZone = 'de';
let selectedEpoch = null;
let foldChoice = null;
let lastConversion = [];
let calendarYear = new Date().getUTCFullYear();
let timestampRows = [];
let timestampParsed = null;

function offsetLabel(minutes, compact = false) {
  const sign = minutes >= 0 ? '+' : '−';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `UTC${sign}${compact ? hours : String(hours).padStart(2, '0')}${rest || !compact ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

function readableDate(p) { return `${p.year}.${String(p.month).padStart(2, '0')}.${String(p.day).padStart(2, '0')} ${p.weekday}`; }
function shortTime(p) { return p.time.slice(0, 5); }
function dayLabel(delta) { return delta === 0 ? '同日' : delta === -1 ? '前一天' : delta === 1 ? '后一天' : `${Math.abs(delta)} 天${delta > 0 ? '后' : '前'}`; }
function differenceLabel(minutes) {
  if (!minutes) return '与北京同步';
  return `比北京${minutes < 0 ? '晚' : '早'} ${Math.abs(minutes) / 60} 小时`;
}
function office(p) { return p.hour >= 9 && p.hour < 18; }
function weekend(p) { return p.weekdayIndex === 0 || p.weekdayIndex === 6; }

function renderClockStructure() {
  $('world-clocks').innerHTML = ZONES.filter(z => z.id !== 'utc').map(z => {
    const beijing = z.id === 'cn';
    return `<article class="clock-card ${beijing ? 'beijing-card' : ''}" aria-label="${z.label}实时钟">
      <div class="card-top"><span class="flag-box" aria-hidden="true">${z.flag}</span><div><h3 class="country-name">${z.label}</h3><p class="city-name">${z.english}</p></div>${beijing ? '' : `<span id="clock-season-${z.id}" class="clock-season"></span>`}</div>
      <time class="clock-value" id="clock-time-${z.id}"><span id="clock-hm-${z.id}">--:--</span><span class="clock-seconds" id="clock-seconds-${z.id}">:--</span></time>
      <p class="clock-date" id="clock-date-${z.id}"></p>
      ${beijing ? '<p class="beijing-baseline"><span>UTC+8</span>你的时间基准</p><div class="beijing-decoration" aria-hidden="true"></div>' : ''}
      <div class="card-bottom">${beijing ? '<span>全年不使用夏令时</span>' : `<span class="card-difference" id="clock-difference-${z.id}"></span><span id="clock-offset-${z.id}"></span>`}<button type="button" class="card-convert" data-clock-source="${z.id}" title="用${z.label}当前时间换算" aria-label="用${z.label}当前时间换算">${beijing ? '用此刻换算 ↗' : '↗'}</button></div>
    </article>`;
  }).join('');
}

function updateLiveClocks() {
  const now = Date.now();
  const clocks = convertInstant(now, 'cn');
  for (const c of clocks.filter(c => c.id !== 'utc')) {
    $(`clock-hm-${c.id}`).textContent = shortTime(c);
    $(`clock-seconds-${c.id}`).textContent = `:${String(c.second).padStart(2, '0')}`;
    $(`clock-date-${c.id}`).textContent = readableDate(c);
    $(`clock-time-${c.id}`).dateTime = new Date(now).toISOString();
    $(`clock-time-${c.id}`).setAttribute('aria-label', `${c.label} ${c.date} ${c.time}`);
    if (c.id !== 'cn') {
      $(`clock-season-${c.id}`).textContent = c.summer ? '☀ 夏令时' : '◷ 标准时间';
      $(`clock-difference-${c.id}`).textContent = differenceLabel(c.difference);
      $(`clock-offset-${c.id}`).textContent = offsetLabel(c.offset, true);
    }
  }
  const utc = clocks.find(c => c.id === 'utc');
  $('utc-clock').textContent = utc.time;
  $('utc-clock').dateTime = new Date(now).toISOString();
  $('utc-date').textContent = readableDate(utc);
  const beijing = clocks.find(c => c.id === 'cn');
  const european = clocks.find(c => c.id === 'de');
  $('hero-eu-offset').textContent = offsetLabel(european.offset, true);
  for (const [prefix, p, x, y] of [['hero', beijing, 130, 112], ['hero-eu', european, 317, 128]]) {
    $(`${prefix}-hour`).setAttribute('transform', `rotate(${(p.hour % 12) * 30 + p.minute / 2} ${x} ${y})`);
    $(`${prefix}-minute`).setAttribute('transform', `rotate(${p.minute * 6 + p.second / 10} ${x} ${y})`);
  }
  const uk = clocks.find(c => c.id === 'uk');
  $('season-summary').textContent = `欧洲现在使用${european.summer ? '夏令时' : '标准时间（冬令时）'}。中欧比北京晚 ${Math.abs(european.difference) / 60} 小时，英国晚 ${Math.abs(uk.difference) / 60} 小时。`;
  const year = beijing.year;
  const next = [...transitionsForYear(year, 'uk'), ...transitionsForYear(year + 1, 'uk')].find(t => t.epoch > now);
  if (next) {
    const nextDate = partsAt(next.epoch, 'cn');
    const days = Math.ceil((next.epoch - now) / DAY);
    $('next-change').textContent = `下次换季 ${nextDate.month} 月 ${nextDate.day} 日 · ${days} 天后 ↗`;
  } else $('next-change').textContent = '查看换季日历 ↗';
}

function renderZoneOptions() {
  $('source-zone').innerHTML = ZONES.map(z => `<option value="${z.id}">${z.flag} ${z.label}${z.id === 'cn' || z.id === 'utc' ? '' : ` · ${z.city}`}</option>`).join('');
  $('meeting-zone').innerHTML = ZONES.filter(z => ['central', 'britain'].includes(z.group)).map(z => `<option value="${z.id}">${z.flag} ${z.label} · ${z.city}</option>`).join('');
  $('meeting-zone').value = 'de';
}

function syncSourceDirection() {
  const source = zone($('source-zone').value);
  const fromBeijing = source.id === 'cn';
  for (const [id, pressed] of [['from-beijing', fromBeijing], ['from-europe', !fromBeijing]]) {
    $(id).classList.toggle('active', pressed);
    $(id).setAttribute('aria-pressed', String(pressed));
  }
  if (['central', 'britain'].includes(source.group)) lastEuropeanZone = source.id;
  $('input-hint').textContent = source.id === 'utc' ? '输入的是 UTC（0 时区）时间。UTC 本身不实行夏令时。' : `输入的是${source.label}的当地时间。我们会根据所选日期自动判断夏令时。`;
}

function showInstantInForm(epoch, id) {
  const p = partsAt(epoch, id);
  $('source-zone').value = id;
  $('source-date').value = p.date;
  $('source-time').value = p.time;
  // When reversing an already resolved repeated time, preserve its occurrence.
  const resolution = resolveLocal(p.dateTime, id);
  foldChoice = resolution.status === 'ambiguous' ? resolution.candidates.indexOf(Math.floor(epoch / 1000) * 1000) : null;
  syncSourceDirection();
  runConversion();
}

function renderConversionResults(epoch, sourceId) {
  selectedEpoch = epoch;
  lastConversion = convertInstant(epoch, sourceId);
  const source = lastConversion.find(c => c.id === sourceId);
  const utc = lastConversion.find(c => c.id === 'utc');
  $('conversion-output').hidden = false;
  $('copy-result').disabled = false;
  $('result-caption').innerHTML = `<strong>同一时刻 · ${source.label} ${source.date} ${source.time}</strong><br>对应 UTC ${utc.date} ${utc.time}`;
  $('conversion-results').innerHTML = lastConversion.map(c => `<article class="result-card ${c.id === 'cn' ? 'result-beijing' : ''} ${c.id === sourceId ? 'is-source' : ''}" aria-label="${c.label}转换结果">
    <h3 class="result-card-top"><span aria-hidden="true">${c.flag}</span> ${c.label}${c.id === sourceId ? '<span class="source-tag">输入时区</span>' : ''}</h3>
    <time class="result-time" datetime="${new Date(epoch).toISOString()}">${c.time}</time>
    <p class="result-date">${c.date}<span class="day-tag ${c.dayDelta ? 'changed' : ''}" title="相对于输入时区的日期">${dayLabel(c.dayDelta)}</span></p>
    <p class="result-offset">${offsetLabel(c.offset, true)} · ${c.abbreviation}<span class="result-season">${c.id === 'utc' ? '统一时间' : c.id === 'cn' ? '全年不变' : c.summer ? '夏令时' : '标准时间'}</span></p>
  </article>`).join('');
}

function runConversion(resetFold = false) {
  if (resetFold) foldChoice = null;
  syncSourceDirection();
  const sourceId = $('source-zone').value;
  const input = `${$('source-date').value}T${$('source-time').value}`;
  const result = resolveLocal(input, sourceId);
  selectedEpoch = null;
  lastConversion = [];
  $('copy-result').disabled = true;
  $('conversion-status').hidden = true;
  $('conversion-status').replaceChildren();
  $('conversion-output').hidden = true;
  if (['invalid', 'nonexistent'].includes(result.status)) {
    $('conversion-status').hidden = false;
    $('conversion-status').textContent = result.message;
    return;
  }
  if (result.status === 'ambiguous') {
    $('conversion-status').hidden = false;
    const message = document.createElement('p');
    message.textContent = result.message;
    const choices = document.createElement('div');
    choices.className = 'fold-options';
    for (const [index, epoch] of result.candidates.entries()) {
      const c = convertInstant(epoch, sourceId).find(z => z.id === sourceId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `fold-option ${foldChoice === index ? 'chosen' : ''}`;
      button.setAttribute('aria-pressed', String(foldChoice === index));
      button.textContent = `${index === 0 ? '第一次' : '第二次'} · ${c.summer ? '夏令时' : '标准时间'} ${offsetLabel(c.offset)} · 北京 ${partsAt(epoch, 'cn').time}`;
      button.addEventListener('click', () => { foldChoice = index; runConversion(); });
      choices.append(button);
    }
    $('conversion-status').append(message, choices);
    if (foldChoice === null || !result.candidates[foldChoice]) return;
    renderConversionResults(result.candidates[foldChoice], sourceId);
    return;
  }
  foldChoice = null;
  renderConversionResults(result.candidates[0], sourceId);
}

function conversionText() {
  if (!lastConversion.length || selectedEpoch === null) return '';
  const source = lastConversion.find(c => c.id === $('source-zone').value);
  return `时差 · 时间转换\n输入：${source.label} ${source.date} ${source.time} (${offsetLabel(source.offset)})\n\n` + lastConversion.map(c => `${c.label}：${c.date} ${c.time} ${offsetLabel(c.offset)} · ${c.season} · ${dayLabel(c.dayDelta)}`).join('\n');
}

async function copyText(text, button) {
  if (!text) return;
  const label = button.textContent;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    button.textContent = '✓ 已复制全部结果';
    setTimeout(() => { button.textContent = label; }, 2400);
  } catch {
    $('copy-text').value = text;
    const dialog = $('copy-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    $('copy-text').focus();
    $('copy-text').select();
  }
}
function copyResults() { return copyText(conversionText(), $('copy-result')); }

function runTimestamp() {
  timestampRows = []; timestampParsed = null;
  $('timestamp-output').hidden = true;
  $('timestamp-copy').disabled = true;
  try {
    const parsed = parseTimestamp($('timestamp-input').value, $('timestamp-unit').value);
    timestampParsed = parsed;
    timestampRows = convertInstant(parsed.epoch, 'cn');
    const fraction = String(parsed.millisecond).padStart(3, '0');
    $('timestamp-ms').textContent = String(parsed.epoch);
    $('timestamp-seconds').textContent = `${Math.floor(parsed.epoch / 1000)}${parsed.millisecond ? '.' + fraction : ''}`;
    $('timestamp-iso').textContent = new Date(parsed.epoch).toISOString();
    $('timestamp-status').className = 'timestamp-status';
    $('timestamp-status').textContent = `已按${parsed.unit === 'milliseconds' ? '毫秒' : '秒'}解析 · 转换成功`;
    $('timestamp-results').innerHTML = timestampRows.map(c => `<article class="result-card ${c.id === 'cn' ? 'result-beijing' : ''}" aria-label="${c.label}时间戳转换结果">
      <h3 class="result-card-top"><span aria-hidden="true">${c.flag}</span> ${c.label}</h3>
      <time class="result-time" datetime="${new Date(parsed.epoch).toISOString()}">${c.time}.${fraction}</time>
      <p class="result-date">${c.date}<span class="day-tag ${c.dayDelta ? 'changed' : ''}">${dayLabel(c.dayDelta)}</span></p>
      <p class="result-offset">${offsetLabel(c.offset, true)} · ${c.abbreviation}<span class="result-season">${c.id === 'utc' ? '统一时间' : c.id === 'cn' ? '全年不变' : c.summer ? '夏令时' : '标准时间'}</span></p>
    </article>`).join('');
    $('timestamp-output').hidden = false;
    $('timestamp-copy').disabled = false;
  } catch (error) {
    $('timestamp-status').className = 'timestamp-status error';
    $('timestamp-status').textContent = error.message;
  }
}
function setCurrentTimestamp() {
  $('timestamp-input').value = String(Date.now());
  $('timestamp-unit').value = 'milliseconds';
  runTimestamp();
}
function copyTimestamp() {
  if (!timestampParsed || !timestampRows.length) return;
  const fraction = String(timestampParsed.millisecond).padStart(3, '0');
  const text = `时间戳转换\n毫秒：${timestampParsed.epoch}\nUTC：${new Date(timestampParsed.epoch).toISOString()}\n\n` + timestampRows.map(c => `${c.label}：${c.date} ${c.time}.${fraction} ${offsetLabel(c.offset)} · ${c.season}`).join('\n');
  return copyText(text, $('timestamp-copy'));
}

function renderMeeting() {
  const date = $('meeting-date').value;
  const id = $('meeting-zone').value;
  const selected = Number($('meeting-slider').value);
  const midnight = resolveLocal(`${date}T00:00:00`, 'cn');
  if (midnight.status !== 'unique') {
    $('meeting-beijing-time').textContent = '--:--';
    $('meeting-foreign-time').textContent = '--:--';
    $('meeting-date-caption').textContent = '请选择有效的北京日期（2000—2099 年）。';
    $('meeting-fit').textContent = '日期无效';
    $('meeting-recommendation').textContent = '';
    $('timeline-beijing').replaceChildren();
    $('timeline-europe').replaceChildren();
    $('meeting-to-converter').disabled = true;
    return;
  }
  $('meeting-to-converter').disabled = false;
  const base = midnight.candidates[0];
  const epoch = base + selected * halfHour;
  const cn = partsAt(epoch, 'cn');
  const abroad = partsAt(epoch, id);
  const z = zone(id);
  const both = office(cn) && office(abroad);
  const onWeekend = weekend(cn) || weekend(abroad);
  $('meeting-beijing-time').textContent = shortTime(cn);
  $('meeting-foreign-time').textContent = shortTime(abroad);
  $('meeting-location').textContent = `${z.flag} ${z.label}`;
  $('timeline-country').textContent = z.label;
  $('meeting-date-caption').textContent = `北京 ${readableDate(cn)}  ↔  ${z.label} ${readableDate(abroad)}${cn.date !== abroad.date ? '（跨了一天）' : ''}`;
  $('meeting-fit').textContent = both ? `双方办公时段重叠${onWeekend ? ' · 周末' : ''}` : !office(cn) ? '北京在常用办公时间之外' : '对方在常用办公时间之外';
  $('meeting-fit').classList.toggle('outside', !both);
  $('meeting-slider').setAttribute('aria-valuetext', `北京 ${shortTime(cn)}，${z.label} ${shortTime(abroad)}，${both ? '双方办公时段重叠' : '非双方办公重叠时段'}${onWeekend ? '，周末' : ''}`);
  document.querySelector('.timeline').style.setProperty('--position', `${selected / 48 * 100}%`);
  const cnBlocks = [];
  const foreignBlocks = [];
  for (let slot = 0; slot < 48; slot++) {
    const china = partsAt(base + slot * halfHour, 'cn');
    const foreign = partsAt(base + slot * halfHour, id);
    const overlap = office(china) && office(foreign);
    for (const [p, blocks] of [[china, cnBlocks], [foreign, foreignBlocks]]) blocks.push(`<span class="time-block ${office(p) ? 'office' : ''} ${overlap ? 'overlap' : ''}"></span>`);
  }
  $('timeline-beijing').innerHTML = cnBlocks.join('');
  $('timeline-europe').innerHTML = foreignBlocks.join('');
  const slots = officeSlots(date, id);
  if (slots.length) {
    const first = slots[0];
    const end = slots.at(-1).epoch + halfHour;
    $('meeting-recommendation').innerHTML = `<strong>重叠时段：北京 ${shortTime(first.beijing)}—${shortTime(partsAt(end, 'cn'))}</strong> · ${z.label} ${shortTime(first.foreign)}—${shortTime(partsAt(end, id))}${weekend(first.beijing) || weekend(first.foreign) ? '（周末，请确认对方是否上班）' : ''}`;
  } else $('meeting-recommendation').textContent = '当天未找到双方常用办公时段的重叠。';
}

function renderLesson(season) {
  const summer = season === 'summer';
  for (const button of document.querySelectorAll('[data-season]')) {
    const pressed = button.dataset.season === season;
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  }
  $('demo-central-time').textContent = summer ? '12:00' : '11:00';
  $('demo-uk-time').textContent = summer ? '11:00' : '10:00';
  $('demo-central-offset').textContent = summer ? 'UTC+2 · CEST' : 'UTC+1 · CET';
  $('demo-uk-offset').textContent = summer ? 'UTC+1 · BST' : 'UTC+0 · GMT';
  $('demo-explanation').textContent = summer ? '夏天，欧洲时钟快了一小时：中欧比北京晚 6 小时，英国晚 7 小时。北京 18:00，中欧刚到中午，伦敦还是上午。' : '冬天，欧洲恢复标准时间：中欧比北京晚 7 小时，英国晚 8 小时。北京 18:00，中欧是 11:00，伦敦才到 10:00。';
}

function renderCalendar() {
  calendarYear = Math.min(2099, Math.max(2000, calendarYear));
  $('calendar-year').textContent = String(calendarYear);
  $('previous-year').disabled = calendarYear === 2000;
  $('next-year').disabled = calendarYear === 2099;
  const changes = transitionsForYear(calendarYear, 'uk');
  const start = Date.UTC(calendarYear, 0, 1);
  const duration = Date.UTC(calendarYear + 1, 0, 1) - start;
  $('year-months').innerHTML = Array.from({ length: 12 }, (_, m) => `<span style="left:${(Date.UTC(calendarYear, m, 1) - start) / duration * 100}%">${m + 1}月</span>`).join('');
  if (changes.length === 2) {
    const first = (changes[0].epoch - start) / duration * 100;
    const second = (changes[1].epoch - start) / duration * 100;
    $('year-track').innerHTML = `<span class="winter" style="width:${first}%">标准时间</span><span class="summer" style="width:${second - first}%">夏令时 · 当地时钟 ＋ 1 小时</span><span class="winter" style="width:${100 - second}%">标准时间</span>`;
  } else $('year-track').innerHTML = '<span class="winter" style="width:100%">该年按时区规则显示</span>';
  $('change-events').innerHTML = changes.map(change => {
    const p = partsAt(change.epoch, 'utc');
    const spring = change.direction === 'forward';
    return `<article class="change-event ${spring ? '' : 'autumn'}"><span class="event-icon" aria-hidden="true">${spring ? '↗' : '↶'}</span><div><p class="event-kicker">${spring ? 'SPRING FORWARD / 进入夏令时' : 'FALL BACK / 恢复标准时间'}</p><h3 class="event-date">${String(p.month).padStart(2, '0')}.${String(p.day).padStart(2, '0')}<strong>${p.weekday} · 北京 09:00</strong></h3><p class="event-copy">${spring ? '中欧 02:00 → 03:00 · 英国 01:00 → 02:00<br>时钟快进一小时，这一段当地时间被跳过。' : '中欧 03:00 → 02:00 · 英国 02:00 → 01:00<br>时钟回拨一小时，这一段当地时间出现两次。'}</p></div></article>`;
  }).join('');
}

function connectEvents() {
  $('timestamp-form').addEventListener('submit', event => { event.preventDefault(); runTimestamp(); });
  $('timestamp-now').addEventListener('click', setCurrentTimestamp);
  $('timestamp-unit').addEventListener('change', runTimestamp);
  $('timestamp-input').addEventListener('input', () => { timestampRows = []; timestampParsed = null; $('timestamp-output').hidden = true; $('timestamp-copy').disabled = true; $('timestamp-status').className = 'timestamp-status'; $('timestamp-status').textContent = '点击「转换时间戳」查看各国时间。'; });
  $('timestamp-copy').addEventListener('click', copyTimestamp);
  $('conversion-form').addEventListener('submit', event => { event.preventDefault(); runConversion(); });
  for (const id of ['source-date', 'source-time', 'source-zone']) $(id).addEventListener('change', () => runConversion(true));
  for (const id of ['source-date', 'source-time']) $(id).addEventListener('input', () => runConversion(true));
  $('use-now').addEventListener('click', () => showInstantInForm(Date.now(), $('source-zone').value));
  $('from-beijing').addEventListener('click', () => {
    if ($('source-zone').value === 'cn') return;
    const epoch = selectedEpoch;
    if (epoch !== null) showInstantInForm(epoch, 'cn');
    else { $('source-zone').value = 'cn'; runConversion(true); }
  });
  $('from-europe').addEventListener('click', () => {
    if ($('source-zone').value !== 'cn' && $('source-zone').value !== 'utc') return;
    const epoch = selectedEpoch;
    if (epoch !== null) showInstantInForm(epoch, lastEuropeanZone);
    else { $('source-zone').value = lastEuropeanZone; runConversion(true); }
  });
  $('reverse-direction').addEventListener('click', () => {
    const sourceId = $('source-zone').value;
    const target = sourceId === 'cn' ? lastEuropeanZone : 'cn';
    if (selectedEpoch !== null) showInstantInForm(selectedEpoch, target);
    else { $('source-zone').value = target; runConversion(true); }
  });
  for (const button of document.querySelectorAll('[data-clock-source]')) button.addEventListener('click', () => {
    showInstantInForm(Date.now(), button.dataset.clockSource);
    $('converter').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('source-zone').focus({ preventScroll: true });
  });
  $('copy-result').addEventListener('click', copyResults);
  $('close-copy-dialog').addEventListener('click', () => {
    if (typeof $('copy-dialog').close === 'function') $('copy-dialog').close();
    else $('copy-dialog').removeAttribute('open');
  });
  $('meeting-zone').addEventListener('change', renderMeeting);
  $('meeting-date').addEventListener('change', renderMeeting);
  $('meeting-date').addEventListener('input', renderMeeting);
  $('meeting-slider').addEventListener('input', renderMeeting);
  $('meeting-to-converter').addEventListener('click', () => {
    const base = resolveLocal(`${$('meeting-date').value}T00:00:00`, 'cn');
    if (base.status !== 'unique') return;
    showInstantInForm(base.candidates[0] + Number($('meeting-slider').value) * halfHour, 'cn');
    $('converter').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('source-time').focus({ preventScroll: true });
  });
  for (const button of document.querySelectorAll('[data-season]')) button.addEventListener('click', () => renderLesson(button.dataset.season));
  $('previous-year').addEventListener('click', () => { calendarYear--; renderCalendar(); });
  $('next-year').addEventListener('click', () => { calendarYear++; renderCalendar(); });
}

function initialize() {
  renderClockStructure();
  renderZoneOptions();
  const now = Date.now();
  const currentBeijing = partsAt(now, 'cn');
  calendarYear = currentBeijing.year;
  $('meeting-date').value = currentBeijing.date;
  showInstantInForm(now, 'cn');
  updateLiveClocks();
  renderMeeting();
  renderLesson(offsetAt(now, 'de') > 60 ? 'summer' : 'winter');
  renderCalendar();
  connectEvents();
  setCurrentTimestamp();
  setInterval(updateLiveClocks, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLiveClocks(); });
}

try { initialize(); }
catch (error) {
  $('season-summary').textContent = '时间工具暂时无法加载。请刷新页面，或使用支持完整时区数据的新版浏览器。';
  console.error('Time Bridge initialization failed', error);
}
