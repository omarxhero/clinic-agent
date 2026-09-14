const { MessageMedia } = require('whatsapp-web.js');
const { startWhatsApp } = require('./wa');
const { think } = require('./brain');
const voice = require('./voice');
const sessions = require('./sessions');
const reminders = require('./reminders');

async function handleMessage(msg, client) {
  const chatId = msg.from;
  const s = sessions.get(chatId);

  let text = null;
  let isVoice = false;

  if (msg.type === 'chat' && msg.body) {
    text = msg.body;
  } else if (msg.type === 'ptt' || msg.type === 'audio') {
    isVoice = true;
    const media = await msg.downloadMedia();
    if (!media || !media.data) {
      await msg.reply('ما قدرت حمّل الفويس نوت 🙏 ممكن تكتبها نص؟');
      return;
    }
    const heard = await voice.transcribe(Buffer.from(media.data, 'base64'));
    if (heard && heard.trim()) {
      text = heard;
    } else {
      await msg.reply('وصلتني الفويس نوت بس ما قدرت افهمها 🙏 ممكن تكتبها نص؟');
      return;
    }
  } else {
    return;
  }

  if (sessions.wantsHuman(text)) {
    sessions.setHandoff(chatId);
    await msg.reply('تمام، حوّلتك لموظف بشري رح يرد عليك قريب. (البوت يرجع يشتغل تلقائياً بعد نصف ساعة)');
    return;
  }
  if (sessions.inHandoff(chatId)) return;

  if (isVoice) s.preferVoice = true;

  const out = await think(chatId, text);
  if (!out || !out.reply) return;

  // booking confirmations always text — important info must be readable
  if (out.confirm) {
    await msg.reply(out.reply);
    return;
  }

  if (s.preferVoice) {
    const mp3 = await voice.speak(out.reply);
    if (mp3) {
      await client.sendMessage(chatId, new MessageMedia('audio/mpeg', mp3.toString('base64'), 'reply.mp3'));
      return;
    }
  }
  await msg.reply(out.reply);
}

console.log('بوت الاستقبال — تشغيل... (أول مرة: رح يظهر كود QR بالتيرمنال)');

process.on('unhandledRejection', e => console.error('unhandled rejection:', e?.message || e));
process.on('uncaughtException', e => console.error('uncaught exception:', e?.message || e));

startWhatsApp({
  onMessage: handleMessage,
  onReady: client => {
    reminders.start(async (phone, text) => client.sendMessage(phone, text));
  },
});
