const express = require('express');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');
require('dotenv').config();
const OpenAI  = require('openai');

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODELS = {
  orion:   { name:'Orion',   gender:'male',   ttsVoice:'ash',
    personality:`You are Orion, a sharp, confident male English coach on unhesitatedai. Direct, upbeat, modern. Use phrases like "Totally", "For sure", "Let's dive in", "Absolutely".` },
  nova:    { name:'Nova',    gender:'female', ttsVoice:'coral',
    personality:`You are Nova, an expressive warm female English coach on unhesitatedai. Enthusiastic, encouraging. Use phrases like "Oh I love that!", "Absolutely!", "Here's the thing...", "That's so good!"` },
  arthur:  { name:'Arthur',  gender:'male',   ttsVoice:'echo',
    personality:`You are Arthur, a composed articulate male English coach on unhesitatedai. Measured, precise, gentlemanly. Use phrases like "Quite right", "Rather", "Indeed", "Brilliant", "Cheers".` },
  eleanor: { name:'Eleanor', gender:'female', ttsVoice:'shimmer',
    personality:`You are Eleanor, an eloquent refined female English coach on unhesitatedai. Warm, sophisticated. Use phrases like "Lovely", "Indeed", "Shall we?", "How delightful."` },
  kabir:   { name:'Kabir',   gender:'male',   ttsVoice:'verse',
    personality:`You are Kabir, a thoughtful wise male English coach on unhesitatedai. Culturally rich, respectful. Use phrases like "Certainly", "Let me elaborate", "You see..."` },
  maya:    { name:'Maya',    gender:'female', ttsVoice:'nova',
    personality:`You are Maya, a nurturing precise female English coach on unhesitatedai. Warm, encouraging. Use phrases like "Wonderful question", "You're doing brilliantly", "Let's take it step by step."` },
  ren:     { name:'Ren',     gender:'male',   ttsVoice:'alloy',
    personality:`You are Ren, a calm methodical male English coach on unhesitatedai. Precise, unhurried. Use phrases like "Let's think carefully", "Take your time", "Shall we break this down?"` },
  mei:     { name:'Mei',     gender:'female', ttsVoice:'sage',
    personality:`You are Mei, a gentle precise female English coach on unhesitatedai. Graceful, quietly encouraging. Use phrases like "Very good", "Let's try that together", "You're making great progress."` },
  amir:    { name:'Amir',    gender:'male',   ttsVoice:'ballad',
    personality:`You are Amir, a warm philosophical male English coach on unhesitatedai. Storyteller soul. Use phrases like "There's a saying...", "Let me paint you a picture", "Words carry such beauty."` },
  layla:   { name:'Layla',   gender:'female', ttsVoice:'alloy',
    personality:`You are Layla, a graceful vibrant female English coach on unhesitatedai. Nurturing, full of life. Use phrases like "I'm right here with you", "You've got this", "Let's do this together."` }
};

const SHARED_RULES = `
COMPANIONS on unhesitatedai: Orion (male, bold), Nova (female, warm), Arthur (male, refined),
Eleanor (female, eloquent), Kabir (male, wise), Maya (female, nurturing),
Ren (male, calm), Mei (female, gentle), Amir (male, philosophical), Layla (female, vibrant).

RULES:
1. Keep responses to 2-4 short spoken sentences. You are speaking aloud, not writing.
2. Use natural fillers that match your personality.
3. Match the user's level and energy instantly.
4. Never rudely correct grammar — mirror correct phrasing naturally in your reply.
5. Always pass the conversation back to the user at the end of your turn.
6. If user says bye/goodbye/done/stop/quit — give a warm farewell and end.
7. You are an AI English coach on unhesitatedai — be honest if asked.
`;

function buildSystemPrompt(key) {
  const m = MODELS[key] || MODELS['nova'];
  return m.personality + '\n' + SHARED_RULES;
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
// REALTIME TOKEN — native https only, no SDK
// ─────────────────────────────────────────────
app.get('/api/realtime-token', (req, res) => {
  const modelKey = req.query.model || 'nova';
  const modelDef = MODELS[modelKey] || MODELS['nova'];

  const payload = JSON.stringify({
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: modelDef.ttsVoice,
    instructions: buildSystemPrompt(modelKey),
    input_audio_transcription: { model: 'whisper-1' },
    turn_detection: { type: 'server_vad' }
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/realtime/sessions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'realtime=v1',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let raw = '';
    apiRes.on('data', chunk => { raw += chunk; });
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        if (apiRes.statusCode !== 200) {
          console.error('❌ OpenAI error:', JSON.stringify(parsed, null, 2));
          return res.status(apiRes.statusCode).json({ error: parsed });
        }
        console.log(`✅ Token issued — model: ${modelDef.name}, voice: ${modelDef.ttsVoice}`);
        res.json(parsed);
      } catch (e) {
        console.error('❌ Parse error. Raw response:', raw);
        res.status(500).json({ error: 'Failed to parse OpenAI response', raw });
      }
    });
  });

  apiReq.on('error', (err) => {
    console.error('❌ HTTPS error:', err.message);
    res.status(500).json({ error: err.message });
  });

  apiReq.write(payload);
  apiReq.end();
});

// ─────────────────────────────────────────────
// FALLBACK TTS
// ─────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text, model: modelKey } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided.' });
  const modelDef = MODELS[modelKey] || MODELS['nova'];
  const voiceMap = { ash:'onyx', coral:'nova', echo:'echo', shimmer:'shimmer', verse:'fable', nova:'nova', alloy:'alloy', sage:'shimmer', ballad:'onyx' };
  const safeVoice = voiceMap[modelDef.ttsVoice] || 'nova';
  try {
    const speech = await openai.audio.speech.create({ model:'tts-1', voice:safeVoice, input:text });
    const buffer = Buffer.from(await speech.arrayBuffer());
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (e) {
    console.error('TTS error:', e);
    res.status(500).json({ error: 'TTS failed.' });
  }
});

// ─────────────────────────────────────────────
// FALLBACK TEXT CHAT
// ─────────────────────────────────────────────
const chatHistories = {};

app.post('/api/text-chat', async (req, res) => {
  const { message, model: modelKey } = req.body;
  if (!message) return res.status(400).json({ message: 'No message provided.' });
  const key = modelKey || 'nova';
  if (!chatHistories[key]) chatHistories[key] = [];
  try {
    const messages = [
      { role:'system', content: buildSystemPrompt(key) },
      ...chatHistories[key],
      { role:'user', content: message }
    ];
    const completion = await openai.chat.completions.create({ model:'gpt-4o', messages, max_tokens:150 });
    const responseText = completion.choices[0].message.content;
    chatHistories[key].push({ role:'user', content:message });
    chatHistories[key].push({ role:'assistant', content:responseText });
    res.json({ message: responseText });
  } catch (e) {
    console.error('Text chat error:', e);
    res.status(500).json({ message: 'Sorry, something went wrong!' });
  }
});

app.listen(PORT, () => console.log(`🚀 unhesitatedai running on port ${PORT}`));