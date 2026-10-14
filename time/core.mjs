export const ZONES = Object.freeze([
  { id: 'cn', label: '北京时间', country: '中国', city: '北京', english: 'BEIJING', flag: '🇨🇳', iana: 'Asia/Shanghai', base: 480, group: 'china' },
  { id: 'nl', label: '荷兰', country: '荷兰', city: '阿姆斯特丹', english: 'AMSTERDAM', flag: '🇳🇱', iana: 'Europe/Amsterdam', base: 60, group: 'central' },
  { id: 'be', label: '比利时', country: '比利时', city: '布鲁塞尔', english: 'BRUSSELS', flag: '🇧🇪', iana: 'Europe/Brussels', base: 60, group: 'central' },
  { id: 'lu', label: '卢森堡', country: '卢森堡', city: '卢森堡市', english: 'LUXEMBOURG', flag: '🇱🇺', iana: 'Europe/Luxembourg', base: 60, group: 'central' },
  { id: 'uk', label: '英国', country: '英国', city: '伦敦', english: 'LONDON', flag: '🇬🇧', iana: 'Europe/London', base: 0, group: 'britain' },
  { id: 'fr', label: '法国', country: '法国', city: '巴黎', english: 'PARIS', flag: '🇫🇷', iana: 'Europe/Paris', base: 60, group: 'central' },
  { id: 'de', label: '德国', country: '德国', city: '柏林', english: 'BERLIN', flag: '🇩🇪', iana: 'Europe/Berlin', base: 60, group: 'central' },
  { id: 'utc', label: 'UTC · 0 时区', country: 'UTC', city: '协调世界时', english: 'UNIVERSAL TIME', flag: '◷', iana: 'UTC', base: 0, group: 'utc' }
]);

const MINUTE = 60000;
const DAY = 86400000;
const formatters = new Map();
const transitionCache = new Map();
const pad = n => String(n).padStart(2, '0');

export function zone(id) {
  const found = ZONES.find(z => z.id === id || z.iana === id);
  if (!found) throw new RangeError('未知时区');
  return found;
}

function formatterFor(id) {
  const z = zone(id);
  if (!formatters.has(z.id)) {
    formatters.set(z.id, new Intl.DateTimeFormat('en-GB', {
      timeZone: z.iana, calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
  }
  return formatters.get(z.id);
}

export function partsAt(epoch, id) {
  if (!Number.isFinite(epoch)) throw new RangeError('无效时间');
  const p = {};
  for (const part of formatterFor(id).formatToParts(new Date(epoch))) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)) p[part.type] = Number(part.value);
  }
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  const weekdayIndex = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { ...p, date, time, dateTime: `${date}T${time}`, weekdayIndex, weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][weekdayIndex] };
}

export function offsetAt(epoch, id) {
  const p = partsAt(epoch, id);
  const localAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (localAsUTC - Math.floor(epoch / 1000) * 1000) / MINUTE;
}

function parseLocal(input) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(input));
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(n => Number(n ?? 0));
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundtrip = new Date(naive);
  if (roundtrip.getUTCFullYear() !== year || roundtrip.getUTCMonth() !== month - 1 || roundtrip.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute, second, naive };
}

export function resolveLocal(input, id) {
  const p = parseLocal(input);
  if (!p) return { status: 'invalid', candidates: [], message: '请填写有效的日期和时间（2000—2099 年）。' };
  try { zone(id); } catch { return { status: 'invalid', candidates: [], message: '请选择有效的输入时区。' }; }
  // Collect offsets on both sides of a possible clock change. Then round-trip
  // candidates: a wall time can map to zero, one, or two actual instants.
  const offsets = new Set();
  for (let step = -8; step <= 8; step++) offsets.add(offsetAt(p.naive + step * 6 * 3600000, id));
  const candidates = [...offsets].map(offset => p.naive - offset * MINUTE).filter(epoch => {
    const actual = partsAt(epoch, id);
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].every(key => actual[key] === p[key]);
  }).sort((a, b) => a - b);
  if (!candidates.length) return { status: 'nonexistent', candidates, message: '这个当地时间不存在：进入夏令时时，时钟向前跳了一小时。请换一个时间。' };
  if (candidates.length > 1) return { status: 'ambiguous', candidates, message: '这个时间会出现两次：结束夏令时时，时钟回拨了一小时。请选择你指的是哪一次。' };
  return { status: 'unique', candidates, message: '' };
}

export function convertInstant(epoch, sourceId = 'cn') {
  const source = partsAt(epoch, sourceId);
  const sourceDay = Date.UTC(source.year, source.month - 1, source.day);
  const beijingOffset = offsetAt(epoch, 'cn');
  return ZONES.map(z => {
    const p = partsAt(epoch, z.id);
    const offset = offsetAt(epoch, z.id);
    const summer = ['central', 'britain'].includes(z.group) && offset > z.base;
    const season = z.group === 'china' ? '全年标准时间' : z.group === 'utc' ? '统一时间基准' : summer ? '夏令时' : '标准时间（冬令时）';
    const abbreviation = z.group === 'central' ? (summer ? 'CEST' : 'CET') : z.group === 'britain' ? (summer ? 'BST' : 'GMT') : z.group === 'china' ? 'CST' : 'UTC';
    return { ...z, ...p, epoch, offset, difference: offset - beijingOffset, summer, season, abbreviation, dayDelta: (Date.UTC(p.year, p.month - 1, p.day) - sourceDay) / DAY };
  });
}

export function transitionsForYear(year, id = 'uk') {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return [];
  const cacheKey = `${year}:${zone(id).id}`;
  if (transitionCache.has(cacheKey)) return transitionCache.get(cacheKey);
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const changes = [];
  let previous = start;
  let before = offsetAt(start, id);
  for (let current = start + DAY; current <= end; current += DAY) {
    const after = offsetAt(current, id);
    if (after !== before) {
      let left = previous;
      let right = current;
      while (right - left > MINUTE) {
        const middle = Math.floor((left + right) / (2 * MINUTE)) * MINUTE;
        if (offsetAt(middle, id) === before) left = middle;
        else right = middle;
      }
      changes.push({ epoch: right, before, after, direction: after > before ? 'forward' : 'back' });
    }
    previous = current;
    before = after;
  }
  transitionCache.set(cacheKey, changes);
  return changes;
}

export function officeSlots(date, id) {
  const start = resolveLocal(`${date}T09:00:00`, 'cn');
  if (start.status !== 'unique') return [];
  const slots = [];
  for (let halfHour = 0; halfHour < 18; halfHour++) {
    const epoch = start.candidates[0] + halfHour * 30 * MINUTE;
    const beijing = partsAt(epoch, 'cn');
    const foreign = partsAt(epoch, id);
    const minuteOfDay = foreign.hour * 60 + foreign.minute;
    if (minuteOfDay >= 9 * 60 && minuteOfDay < 18 * 60) slots.push({ epoch, beijing, foreign });
  }
  return slots;
}

// Parse the transport unit explicitly; a Unix timestamp denotes one instant,
// so it has no source timezone and daylight saving applies only to the display.
export function parseTimestamp(input, unit = 'auto') {
  const value = String(input).trim();
  if (!value) throw new RangeError('请输入 Unix 时间戳。');
  let selected = unit;
  if (selected === 'auto') {
    if (/^(?:0|[0-9]{9,10})(?:\.[0-9]{1,3})?$/.test(value)) selected = 'seconds';
    else if (/^[0-9]{13}$/.test(value)) selected = 'milliseconds';
    else throw new RangeError('无法自动识别单位：常用 10 位为秒、13 位为毫秒，其他长度请手动选择。');
  }
  let milliseconds;
  if (selected === 'seconds' && /^[0-9]{1,10}(?:\.[0-9]{1,3})?$/.test(value)) {
    const [whole, fraction = ''] = value.split('.');
    milliseconds = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  } else if (selected === 'milliseconds' && /^[0-9]{1,13}$/.test(value)) milliseconds = BigInt(value);
  else throw new RangeError('请输入有效数字：毫秒使用整数，秒最多保留 3 位小数。');
  if (milliseconds < 0n || milliseconds >= 4102444800000n) throw new RangeError('时间戳支持 UTC 1970—2099 年，请检查数值和单位。');
  const epoch = Number(milliseconds);
  return {epoch, unit:selected, millisecond:epoch % 1000};
}
