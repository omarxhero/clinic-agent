const fs = require('fs');
const path = require('path');
const { GROQ_API_KEY } = require('./config');

// voice note (ogg) -> Arabic text via Groq whisper; null when unavailable
async function transcribe(oggBuffer) {
  if (!GROQ_API_KEY) return null;
  try {
    const fd = new FormData();
    fd.append('file', new Blob([oggBuffer]), 'voice.ogg');
    fd.append('model', 'whisper-large-v3');
    fd.append('language', 'ar');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${GROQ_API_KEY}` },
      body: fd,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const j = await res.json();
    return j.text || null;
  } catch (e) {
    console.error('asr error:', e.message);
    return null;
  }
}

// text -> mp3 buffer via Edge TTS; null on failure
async function speak(text) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const voices = ['ar-LB-LaylaNeural', 'ar-EG-SalmaNeural', 'ar-SA-ZariyahNeural'];
  for (const voice of voices) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const readable = tts.toStream(text).audioStream;
      const chunks = [];
      for await (const chunk of readable) chunks.push(chunk);
      if (!chunks.length) throw new Error('empty audio');
      return Buffer.concat(chunks);
    } catch (e) {
      console.error(`tts ${voice} failed:`, e.message);
    }
  }
  return null;
}

module.exports = { transcribe, speak };
