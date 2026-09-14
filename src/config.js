const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// tiny .env loader (no dependency) — commented lines (#) are skipped
(function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
})();

const SHOP = {
  name: 'عيادة النور لطب الأسنان',
  address: 'طرابلس، لبنان',
  hours: { open: '09:00', close: '17:00' },
  closedWeekdays: [6], // 0=Sunday ... 6=Saturday
  slotMinutes: 30,
  daysAhead: 14,
  services: [
    { name: 'فحص وتنظيف', price: 20, minutes: 30 },
    { name: 'حشوة', price: 40, minutes: 45 },
    { name: 'تبييض', price: 80, minutes: 60 },
    { name: 'خلع', price: 30, minutes: 30 },
  ],
};

const BRAIN = {
  baseURL: process.env.BRAIN_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  apiKey: process.env.BRAIN_API_KEY || '',
  model: process.env.BRAIN_MODEL || 'gemini-2.5-flash-lite',
};

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'bookings.json');

function edgePath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

module.exports = { SHOP, BRAIN, GROQ_API_KEY, DATA_FILE, edgePath };
