const sessions = new Map();

const HANDOFF_WORDS = ['تولى', 'موظف', 'إنسان', 'انسان', 'بشر', 'توقف', 'human', 'agent'];
const HANDOFF_MINUTES = 30;

function get(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      draft: {},
      history: [],
      stage: 'idle',
      handoffUntil: 0,
      preferVoice: false,
    });
  }
  return sessions.get(chatId);
}

function reset(chatId) {
  const s = get(chatId);
  s.draft = {};
  s.stage = 'idle';
}

function pushHistory(chatId, role, content) {
  const s = get(chatId);
  s.history.push({ role, content });
  if (s.history.length > 20) s.history.splice(0, s.history.length - 20);
}

function patchDraft(chatId, patch) {
  const s = get(chatId);
  const allowed = ['name', 'service', 'date', 'time'];
  for (const k of allowed) {
    if (patch && patch[k] !== undefined) s.draft[k] = String(patch[k]).trim();
  }
  return s.draft;
}

function wantsHuman(text) {
  const t = (text || '').trim().toLowerCase();
  return HANDOFF_WORDS.some(w => t === w || t.includes(' ' + w) || t.includes(w + ' ') || t.includes(w + '.'));
}

function setHandoff(chatId) {
  get(chatId).handoffUntil = Date.now() + HANDOFF_MINUTES * 60000;
}

function inHandoff(chatId) {
  return get(chatId).handoffUntil > Date.now();
}

module.exports = { get, reset, pushHistory, patchDraft, wantsHuman, setHandoff, inHandoff };
