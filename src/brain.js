const { SHOP, BRAIN } = require('./config');
const booking = require('./booking');
const sessions = require('./sessions');

function servicesLine() {
  return SHOP.services.map(s => `${s.name} (${s.price}$)`).join('، ');
}

function availabilityLine() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 10 && out.length < 5; i++) {
    const ds = booking.fmtDate(d);
    const free = booking.freeSlots(ds);
    if (free.length) {
      const shown = free.slice(0, 6).join('،');
      out.push(`${ds}: ${shown}${free.length > 6 ? ` (+${free.length - 6} أخرى)` : ''}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return out.join(' | ') || 'لا مواعيد متاحة حالياً';
}

function systemPrompt(draft, userBookings) {
  return [
    `أنت موظف الاستقبال الذكي في "${SHOP.name}" (${SHOP.address}) وترد على الزبائن عبر واتساب.`,
    `الحجز الجاري الآن (بيانات مؤكدة سابقاً): ${JSON.stringify(draft)}`,
    `مواعيد هذا الزبون المحجوزة حالياً: ${userBookings.length ? userBookings.map(b => `${b.date} ${b.time} (${b.service})`).join('، ') : 'لا يوجد'}`,
    'قواعد صارمة:',
    '- رد بلغة الزبون: عربي بلهجة شامية بسيطة، أو إنجليزي إن كتب إنجليزي.',
    '- ردود قصيرة (سطر أو سطرين).',
    `- الخدمات والأسعار: ${servicesLine()}. ممنوع اختراع خدمة أو سعر أو مدة.`,
    '- المواعيد: فقط من جدول الأوقات المتاحة أدناه. ممنوع اختراع وقت. إن طلب الزبون وقتاً غير متاح، اقترح أقرب بدائل متاحة.',
    '- ممنوع أي نصيحة طبية أو تشخيص. سؤال طبي = action handoff فوراً.',
    '- أي شيء غير واضح أو خارج موضوع الحجز = action handoff.',
    '- قبل التثبيت: اعرض على الزبون الاسم، الخدمة، التاريخ، الوقت واطلب تأكيده الصريح.',
    '- الإلغاء: إذا طلب الزبون إلغاء موعده، استخدم action cancel مع draft date/time للموعد الملغى (من قائمة مواعيده أعلاه).',
    'الإخراج JSON فقط بهذا الشكل:',
    '{"reply":"...","draft":{"name":"","service":"","date":"YYYY-MM-DD","time":"HH:MM"},"action":null}',
    '- draft: فقط الحقول المؤكدة من المحادثة. لا تخمين أبداً.',
    '- action: null أو {"type":"book"} (فقط بعد تأكيد الزبون الكامل) أو {"type":"cancel"} أو {"type":"handoff"}.',
    `الأوقات المتاحة الأيام القادمة: ${availabilityLine()}`,
  ].join('\n');
}

function parseBrainJSON(text) {
  const base = { reply: 'أهلاً! كيف فيني ساعدك؟', draftPatch: null, action: null };
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) return { ...base, reply: (text || '').trim().slice(0, 500) || base.reply };
  try {
    const o = JSON.parse(m[0]);
    return {
      reply: String(o.reply || base.reply),
      draftPatch: o.draft && typeof o.draft === 'object' ? o.draft : null,
      action: o.action && o.action.type ? o.action : null,
    };
  } catch {
    return base;
  }
}

async function realBrain(s, chatId) {
  const res = await fetch(BRAIN.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${BRAIN.apiKey}` },
    body: JSON.stringify({
      model: BRAIN.model,
      temperature: 0,
      messages: [{ role: 'system', content: systemPrompt(s.draft, booking.bookingsOf(chatId)) }, ...s.history],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return parseBrainJSON(j.choices?.[0]?.message?.content);
}

function parseDayWord(t) {
  if (/اليوم|النهاردة|النهارده/.test(t)) return booking.todayStr();
  if (/بكرة|بكره|بكيره|غدا|غداً|باجر/.test(t)) return booking.fmtDate(new Date(Date.now() + 864e5));
  const m = t.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

// rule-based fallback brain: works with zero API keys, same booking flow
function mockBrain(s, text, chatId) {
  const t = text.trim();
  const d = s.draft;
  const R = (reply, draftPatch = null, action = null, stage = undefined) => ({ reply, draftPatch, action, stage });
  const mine = () => booking.bookingsOf(chatId);
  const listMine = () => mine().map((b, i) => `${i + 1}. ${b.date} ${b.time} (${b.service})`).join('\n');

  if (/(سعر|أسعار|اسعار|بكم|price|شنو عندكم)/i.test(t) && !/حجز/.test(t)) {
    return R(`الخدمات وأسعارها: ${servicesLine()}`);
  }
  if (/(دوام|ساعات الدوام|وقت الدوام|opening|working hours)/i.test(t)) {
    return R(`الدوام من ${SHOP.hours.open} لـ ${SHOP.hours.close}.`);
  }

  if (s.stage === 'cancel_pick') {
    if (/لا|لأ|كسرت/.test(t)) return R('تمام، بقي الموعد. 💙', null, null, 'idle');
    const n = parseInt((t.match(/\d+/) || [])[0], 10);
    const list = mine();
    if (n >= 1 && n <= list.length) {
      const b = list[n - 1];
      booking.cancel(chatId, b.date, b.time);
      return R(`تم إلغاء موعد ${b.date} الساعة ${b.time} ✅`, null, null, 'idle');
    }
    return R('رقّم غير واضح. مواعيدك:\n' + listMine() + '\nاكتب الرقم، أو "لا" للإبقاء.');
  }

  if (s.stage === 'idle' || !s.stage) {
    if (/(إلغاء|الغاء|الغي|امسح الموعد|cancel)/i.test(t)) {
      if (!mine().length) return R('ما في مواعيد محجوزة على رقمك. اكتب "حجز" لإضافة موعد.');
      return R('مواعيدك:\n' + listMine() + '\nاكتب رقم الموعد اللي بدك تلغيه، أو "لا" للإبقاء.', null, null, 'cancel_pick');
    }
    if (/(حجز|احجز|موعد|book|appointment)/i.test(t)) return R('منيح 😊 شو اسمك الكريم؟', null, null, 'name');
    if (/(سلام|هلا|مرحبا|أهلا|اهلا|hi|hello|صباح|مساء|كيفك)/i.test(t)) {
      return R(`أهلين! معك الاستقبال الذكي بـ${SHOP.name}. بدي احجزلك موعد؟ اكتب "حجز".`);
    }
    return R('بقدر اساعدك تحجز موعد أو تعرف الأسعار. اكتب "حجز" للبدء.');
  }
  if (s.stage === 'name') {
    if (t.length < 2) return R('شو اسمك الكريم؟');
    return R(`تشرفنا ${t}! أي خدمة بدك؟\n${servicesLine()}`, { name: t }, null, 'service');
  }
  if (s.stage === 'service') {
    const num = parseInt((t.match(/\d+/) || [])[0], 10);
    const pick = SHOP.services.find(x => t.includes(x.name)) ||
      (num >= 1 && num <= SHOP.services.length ? SHOP.services[num - 1] : null);
    if (!pick) return R(`ما وصلتني الخدمة. المتاح:\n${servicesLine()}`);
    const today = booking.todayStr();
    const tmr = booking.fmtDate(new Date(Date.now() + 864e5));
    return R(
      `تمام، ${pick.name}. لأي يوم؟ (مثلاً: اليوم ${today} / بكرة ${tmr} / أو تاريخ بصيغة 2026-09-20)`,
      { service: pick.name }, null, 'date',
    );
  }
  if (s.stage === 'date') {
    const ds = parseDayWord(t);
    if (!ds) return R('ما فهمت التاريخ. اكتب "اليوم"، "بكرة"، أو تاريخ بصيغة 2026-09-20.');
    const free = booking.freeSlots(ds);
    if (!free.length) return R(`ما في أوقات متاحة يوم ${ds}. جرّب يوم تاني.`);
    return R(`يوم ${ds} الأوقات المتاحة: ${free.slice(0, 8).join('، ')}\nأي وقت يناسبك؟`, { date: ds }, null, 'time');
  }
  if (s.stage === 'time') {
    const m = t.match(/\d{1,2}:\d{2}/);
    const guess = m ? m[0].padStart(5, '0') : null;
    const free = booking.freeSlots(d.date || booking.todayStr());
    const pick = free.includes(guess) ? guess : null;
    if (!pick) return R('الوقت غير متاح. الأوقات المتاحة: ' + free.slice(0, 8).join('، '));
    return R(
      `تأكيد أخير:\n👤 ${d.name}\n🦷 ${d.service}\n📅 ${d.date} ⏰ ${pick}\nاكتب "نعم" للتثبيت أو "لا" للإلغاء.`,
      { time: pick }, null, 'confirm',
    );
  }
  if (s.stage === 'confirm') {
    if (/نعم|ايه|اى|أكد|اكد|yes|ok|تمام|زبط/.test(t)) return R('', null, { type: 'book' }, 'idle');
    if (/لا|لأ|cancel|الغاء|إلغاء|بدل/.test(t)) return R('تم الإلغاء. اكتب "حجز" وقت ما بدك. 💙', null, null, 'idle');
    return R('اكتب "نعم" للتثبيت أو "لا" للإلغاء.');
  }
  return R('اكتب "حجز" للبدء.', null, null, 'idle');
}

async function think(chatId, userText) {
  sessions.pushHistory(chatId, 'user', userText);
  const s = sessions.get(chatId);

  let out;
  try {
    out = BRAIN.apiKey ? await realBrain(s, chatId) : mockBrain(s, userText, chatId);
  } catch (e) {
    console.error('brain error:', e.message);
    sessions.pushHistory(chatId, 'assistant', 'الخط مشغول، جرّب بعد شوي.');
    return { reply: 'لحظة، في ضغط بالخط 🙏 جرّب تكتبلي من جديد بعد شوي.', confirm: false };
  }

  if (out.draftPatch) sessions.patchDraft(chatId, out.draftPatch);
  if (out.stage) s.stage = out.stage;

  let reply = out.reply;
  let confirm = false;

  if (out.action && out.action.type === 'handoff') {
    sessions.setHandoff(chatId);
    reply = 'تمام، حوّلتك لموظف بشري، رح يرد عليك قريب. 🙏';
  } else if (out.action && out.action.type === 'cancel') {
    const mine = booking.bookingsOf(chatId);
    const { date, time } = s.draft || {};
    let target = null;
    if (date && time) target = mine.find(b => b.date === date && b.time === time);
    else if (mine.length === 1) target = mine[0];
    if (target) {
      booking.cancel(chatId, target.date, target.time);
      reply = `تم إلغاء موعد ${target.date} الساعة ${target.time} ✅`;
      sessions.reset(chatId);
    } else if (mine.length > 1) {
      reply = 'عندك أكتر من موعد. حدد التاريخ والوقت: ' + mine.map(b => `${b.date} ${b.time}`).join('، ');
    } else {
      reply = 'ما لقيت موعد محجوز على رقمك.';
    }
  } else if (out.action && out.action.type === 'book') {
    const res = booking.book(s.draft, chatId);
    if (res.ok) {
      reply = `✅ تم تثبيت الموعد:\n👤 ${s.draft.name}\n🦷 ${s.draft.service}\n📅 ${s.draft.date} ⏰ ${s.draft.time}\nبانتظارك! للتعديل أو الإلغاء راسلنا.`;
      confirm = true;
      sessions.reset(chatId);
    } else {
      const free = booking.freeSlots(s.draft.date || booking.todayStr());
      reply = 'هذا الوقت صار محجوز أو غير متاح. المتاح: ' + (free.slice(0, 6).join('، ') || 'ما في أوقات بهاليوم، جرّب يوم تاني');
    }
  }

  if (!reply) reply = 'أهلاً! كيف فيني ساعدك؟';
  sessions.pushHistory(chatId, 'assistant', reply);
  return { reply, confirm };
}

module.exports = { think, servicesLine, availabilityLine };
