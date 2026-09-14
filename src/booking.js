const { SHOP, DATA_FILE } = require('./config');
const { load, save } = require('./store');

let data = load(DATA_FILE, { bookings: [], nextId: 1 });

function persist() {
  save(DATA_FILE, data);
}

const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function dayGrid(dateStr) {
  const d = parseDate(dateStr);
  if (SHOP.closedWeekdays.includes(d.getDay())) return [];
  const [oh, om] = SHOP.hours.open.split(':').map(Number);
  const [ch, cm] = SHOP.hours.close.split(':').map(Number);
  const slots = [];
  let t = oh * 60 + om;
  const end = ch * 60 + cm;
  while (t + SHOP.slotMinutes <= end) {
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
    t += SHOP.slotMinutes;
  }
  return slots;
}

function todayStr() {
  return fmtDate(new Date());
}

function availability(dateStr) {
  const taken = new Set(data.bookings.filter(b => b.date === dateStr).map(b => b.time));
  let grid = dayGrid(dateStr);
  if (dateStr === todayStr()) {
    // today: hide slots already passed (15-min buffer for the confirmation flow)
    const now = new Date();
    const cutoff = now.getHours() * 60 + now.getMinutes() + 15;
    grid = grid.filter(t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m > cutoff;
    });
  }
  return grid.map(time => ({ time, taken: taken.has(time) }));
}

function freeSlots(dateStr) {
  return availability(dateStr).filter(s => !s.taken).map(s => s.time);
}

function validate(fields) {
  const errs = [];
  if (!fields.name || String(fields.name).trim().length < 2) errs.push('name');
  if (!SHOP.services.find(s => s.name === fields.service)) errs.push('service');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) errs.push('date');
  else {
    const today = todayStr();
    const max = fmtDate(new Date(Date.now() + SHOP.daysAhead * 864e5));
    if (fields.date < today || fields.date > max) errs.push('date');
  }
  if (!/^\d{2}:\d{2}$/.test(fields.time || '')) errs.push('time');
  return errs;
}

function book(fields, phone) {
  const errs = validate(fields);
  if (errs.length) return { ok: false, errors: errs };
  if (!dayGrid(fields.date).includes(fields.time)) return { ok: false, errors: ['time'] };
  if (!freeSlots(fields.date).includes(fields.time)) return { ok: false, errors: ['taken'] };
  const b = {
    id: data.nextId++,
    phone,
    ...fields,
    reminded2h: false,
    remindedDayBefore: false,
    createdAt: new Date().toISOString(),
  };
  data.bookings.push(b);
  persist();
  return { ok: true, booking: b };
}

function cancel(phone, date, time) {
  const before = data.bookings.length;
  data.bookings = data.bookings.filter(
    b => !(b.phone === phone && b.date === date && (time ? b.time === time : true)),
  );
  persist();
  return data.bookings.length < before;
}

function bookingsOf(phone) {
  return data.bookings.filter(b => b.phone === phone);
}

function dueSoon(minutesAhead) {
  const now = Date.now();
  return data.bookings.filter(b => {
    const [y, m, d] = b.date.split('-').map(Number);
    const [hh, mm] = b.time.split(':').map(Number);
    const t = new Date(y, m - 1, d, hh, mm).getTime();
    const diffMin = (t - now) / 60000;
    return diffMin > 0 && diffMin <= minutesAhead && !b.reminded2h;
  });
}

function dueTomorrow() {
  const tmr = fmtDate(new Date(Date.now() + 864e5));
  return data.bookings.filter(b => b.date === tmr && !b.remindedDayBefore);
}

function markReminded(id, field) {
  const b = data.bookings.find(x => x.id === id);
  if (b) {
    b[field] = true;
    persist();
  }
}

function resetDemo() {
  data = { bookings: [], nextId: 1 };
  persist();
}

module.exports = {
  availability, freeSlots, validate, book, cancel, bookingsOf,
  dueSoon, dueTomorrow, markReminded, resetDemo, todayStr, fmtDate,
};
