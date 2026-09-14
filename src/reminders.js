const booking = require('./booking');

// 2h-before reminder: checks every minute
// day-before reminder: at ~18:05 daily
function start(send) {
  setInterval(async () => {
    for (const b of booking.dueSoon(120)) {
      try {
        await send(b.phone, `⏰ تذكير: عندك موعد اليوم الساعة ${b.time} (${b.service}). بانتظارك!`);
        booking.markReminded(b.id, 'reminded2h');
      } catch (e) {
        console.error('remind2h fail:', e.message);
      }
    }
  }, 60000);

  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== 18 || now.getMinutes() > 4) return;
    for (const b of booking.dueTomorrow()) {
      try {
        await send(b.phone, `⏰ تذكير: عندك موعد بكرة ${b.date} الساعة ${b.time} (${b.service}).`);
        booking.markReminded(b.id, 'remindedDayBefore');
      } catch (e) {
        console.error('remindDay fail:', e.message);
      }
    }
  }, 5 * 60000);

  console.log('⏰ التذكيرات شغالة (قبل الموعد بساعتين + يوم قبل الساعة 6 مساءً)');
}

module.exports = { start };
