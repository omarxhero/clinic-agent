const { Client, LocalAuth } = require('whatsapp-web.js');
const { edgePath } = require('./config');

function startWhatsApp({ onMessage, onReady }) {
  const exec = edgePath();
  if (!exec) throw new Error('Edge browser not found — install Microsoft Edge first');

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'clinic-agent', dataPath: './.wwebjs_auth' }),
    puppeteer: {
      executablePath: exec,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-extensions'],
    },
  });

  client.on('qr', qr => {
    console.log('\n==============================================');
    console.log('امسح الكود من واتساب على التلفون:');
    console.log('واتساب > الإعدادات > الأجهزة المرتبطة > ربط جهاز');
    console.log('==============================================\n');
    require('qrcode-terminal').generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ واتساب جاهز — البوت شغال ويرصد الرسائل');
    if (onReady) onReady(client);
  });

  client.on('auth_failure', () => console.error('❌ فشل الربط — امسح الكود من جديد'));

  client.on('disconnected', reason => console.error('انقطع الاتصال:', reason));

  client.on('message', async msg => {
    try {
      if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us')) return;
      await onMessage(msg, client);
    } catch (e) {
      console.error('msg error:', e.message);
    }
  });

  client.initialize().catch(e => {
    console.error('فشل تشغيل واتساب:', e.message);
    console.error('أغلق النافذة وشغّل start_agent.bat من جديد');
    process.exit(1);
  });
  return client;
}

module.exports = { startWhatsApp };
