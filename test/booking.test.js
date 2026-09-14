process.env.DATA_FILE = require('node:path').join(require('node:os').tmpdir(), 'clinic-agent-test-bookings.json');
require('node:fs').rmSync(process.env.DATA_FILE, { force: true });

const test = require('node:test');
const assert = require('node:assert');
const booking = require('../src/booking');
const sessions = require('../src/sessions');
const { think } = require('../src/brain');

function nextOpenDate() {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while ([6].includes(d.getDay()));
  return booking.fmtDate(d);
}

function nextClosedDate() {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 6);
  return booking.fmtDate(d);
}

test('open day has full slot grid', () => {
  const free = booking.freeSlots(nextOpenDate());
  assert.ok(free.length >= 10);
  assert.ok(free.includes('09:00'));
});

test('closed day (Saturday) empty', () => {
  assert.equal(booking.freeSlots(nextClosedDate()).length, 0);
});

test('today slots already passed are hidden', () => {
  // 09:00 grid start always hidden when checked late morning or after
  const now = new Date();
  const fakeNowMinutes = now.getHours() * 60 + now.getMinutes();
  const free = booking.freeSlots(booking.todayStr());
  for (const t of free) {
    const [h, m] = t.split(':').map(Number);
    assert.ok(h * 60 + m > fakeNowMinutes + 15, `slot ${t} should be in the future`);
  }
});

test('book ok then double-book rejected', () => {
  booking.resetDemo();
  const date = nextOpenDate();
  const a = booking.book({ name: 'عمر', service: 'خلع', date, time: '09:00' }, 't1');
  assert.ok(a.ok);
  const b = booking.book({ name: 'سامي', service: 'خلع', date, time: '09:00' }, 't2');
  assert.ok(!b.ok);
  assert.deepEqual(b.errors, ['taken']);
});

test('time outside grid rejected', () => {
  booking.resetDemo();
  const r = booking.book({ name: 'عمر', service: 'خلع', date: nextOpenDate(), time: '09:07' }, 't');
  assert.ok(!r.ok);
});

test('past date rejected', () => {
  booking.resetDemo();
  const r = booking.book({ name: 'عمر', service: 'خلع', date: '2020-01-01', time: '09:00' }, 't');
  assert.ok(!r.ok);
});

test('cancel with time frees only that slot', () => {
  booking.resetDemo();
  const date = nextOpenDate();
  booking.book({ name: 'عمر', service: 'خلع', date, time: '10:00' }, 'p1');
  booking.book({ name: 'عمر', service: 'حشوة', date, time: '14:00' }, 'p1');
  assert.ok(booking.cancel('p1', date, '10:00'));
  assert.equal(booking.bookingsOf('p1').length, 1);
  assert.equal(booking.bookingsOf('p1')[0].time, '14:00');
  const r = booking.book({ name: 'سامي', service: 'خلع', date, time: '10:00' }, 'p2');
  assert.ok(r.ok);
});

test('draft patch whitelist blocks unknown fields', () => {
  const d = sessions.patchDraft('test-chat', { name: 'عمر', phone: '123', hack: 'x' });
  assert.equal(d.name, 'عمر');
  assert.equal(d.phone, undefined);
  assert.equal(d.hack, undefined);
});

test('handoff word detected, normal text not', () => {
  assert.ok(sessions.wantsHuman('تولى'));
  assert.ok(sessions.wantsHuman('موظف.'));
  assert.ok(!sessions.wantsHuman('بدي احجز موعد'));
});

test('mock brain full booking flow end to end', async () => {
  booking.resetDemo();
  sessions.reset('sim-test');
  const date = nextOpenDate();

  let out = await think('sim-test', 'حجز');
  assert.ok(out.reply.includes('اسمك'));
  out = await think('sim-test', 'عمر');
  assert.ok(out.reply.includes('خدمة'));
  out = await think('sim-test', 'خلع');
  assert.ok(out.reply.includes(date) || out.reply.includes('يوم'));
  out = await think('sim-test', date);
  const free = booking.freeSlots(date);
  assert.ok(free.length > 0);
  out = await think('sim-test', free[0]);
  assert.ok(out.reply.includes('تأكيد'));
  out = await think('sim-test', 'نعم');
  assert.ok(out.reply.includes('تم تثبيت'));
  assert.ok(!booking.freeSlots(date).includes(free[0]));
});

test('mock brain cancel flow end to end', async () => {
  assert.equal(booking.bookingsOf('sim-test').length, 1);
  let out = await think('sim-test', 'بد الغاء');
  assert.ok(out.reply.includes('1.'));
  out = await think('sim-test', '1');
  assert.ok(out.reply.includes('تم إلغاء'));
  assert.equal(booking.bookingsOf('sim-test').length, 0);
});
