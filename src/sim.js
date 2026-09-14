const readline = require('readline');
const { think } = require('./brain');
const sessions = require('./sessions');
const booking = require('./booking');

const CHAT = 'sim-client';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

console.log('=== محاكي الاستقبال (بدون واتساب) ===');
console.log('اكتب كأنك زبون. أوامر: /voice (رد صوتي تجريبي) /reset /exit');
console.log('التاريخ اليوم: ' + booking.todayStr());
console.log('');

rl.on('line', async line => {
  const t = line.trim();
  if (!t) return;
  if (t === '/exit') process.exit(0);
  if (t === '/reset') { sessions.reset(CHAT); sessions.get(CHAT).handoffUntil = 0; console.log('[تم التصفير]'); return; }
  if (t === '/voice') {
    const s = sessions.get(CHAT);
    s.preferVoice = !s.preferVoice;
    console.log('[وضع الصوت: ' + (s.preferVoice ? 'on — بالتطبيق الحقيقي الرد رح يكون صوتي]' : 'off]') + ']');
    return;
  }
  if (sessions.wantsHuman(t)) { sessions.setHandoff(CHAT); console.log('البوت > [تحويل لموظف — سكوت 30 دقيقة]'); return; }
  if (sessions.inHandoff(CHAT)) { console.log('البوت > [ساكت — موظف بشري مسك المحادثة]'); return; }

  const out = await think(CHAT, t);
  console.log('البوت > ' + (out.reply || '...'));
});
rl.on('close', () => process.exit(0));
