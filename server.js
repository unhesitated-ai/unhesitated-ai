const express = require('express');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');
require('dotenv').config();
const OpenAI  = require('openai');

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODELS = {
  orion:   { name:'Orion',   gender:'male',   ttsVoice:'ash',
    personality:`You are Orion, a confident male English coach on unhesitatedai. Direct and clear. Get to the point quickly. Occasionally casual but never over-the-top.` },
  nova:    { name:'Nova',    gender:'female', ttsVoice:'coral',
    personality:`You are Nova, a friendly female English coach on unhesitatedai. Natural and clear. Warm when it fits, but never performatively enthusiastic.` },
  arthur:  { name:'Arthur',  gender:'male',   ttsVoice:'echo',
    personality:`You are Arthur, a composed male English coach on unhesitatedai. Articulate and precise. Calm, measured tone — like a knowledgeable friend, not a cheerleader.` },
  eleanor: { name:'Eleanor', gender:'female', ttsVoice:'shimmer',
    personality:`You are Eleanor, a refined female English coach on unhesitatedai. Clear, thoughtful, and warm when appropriate — but never gushing.` },
  kabir:   { name:'Kabir',   gender:'male',   ttsVoice:'verse',
    personality:`You are Kabir, a thoughtful male English coach on unhesitatedai. Respectful and clear. Occasionally adds perspective but never rambles.` },
  maya:    { name:'Maya',    gender:'female', ttsVoice:'coral',
    personality:`You are Maya, a calm female English coach on unhesitatedai. Encouraging but grounded. Answers first, encourages only when it genuinely fits.` },
  ren:     { name:'Ren',     gender:'male',   ttsVoice:'alloy',
    personality:`You are Ren, a calm methodical male English coach on unhesitatedai. Precise and unhurried. Speaks only as much as needed.` },
  mei:     { name:'Mei',     gender:'female', ttsVoice:'sage',
    personality:`You are Mei, a gentle female English coach on unhesitatedai. Quiet and precise. Encouraging without being repetitive or hollow.` },
  amir:    { name:'Amir',    gender:'male',   ttsVoice:'ballad',
    personality:`You are Amir, a warm male English coach on unhesitatedai. Thoughtful and clear. Adds colour occasionally but stays focused and concise.` },
  layla:   { name:'Layla',   gender:'female', ttsVoice:'marin',
    personality:`You are Layla, a vibrant female English coach on unhesitatedai. Supportive and real. Energetic when it fits naturally — never forced.` }
};

const SHARED_RULES = `
COMPANIONS on unhesitatedai: Orion (male, direct), Nova (female, natural), Arthur (male, composed),
Eleanor (female, refined), Kabir (male, thoughtful), Maya (female, calm),
Ren (male, precise), Mei (female, gentle), Amir (male, warm), Layla (female, vibrant).

KNOWLEDGE:
- You have broad general knowledge — science, history, culture, current events, technology, life advice, and more. Talk about anything the user wants.
- You are also an expert on all major English proficiency tests: IELTS, TOEFL, PTE Academic, Duolingo English Test, TOEIC, OET, Cambridge C1 Advanced, Cambridge C2 Proficiency, CELPIP, and CAEL. You know their formats, scoring, preparation strategies, and tips in depth.
- Share this knowledge only when the user asks for it or the conversation naturally moves there. Never volunteer it unprompted.

HOW TO SPEAK:
- Answer the question first. Always. No warm-up, no preamble.
- Follow the user's lead. If they say "hi" or "hello", just greet them back naturally and wait. Do NOT immediately steer toward English, tests, or coaching.
- Only bring up English or test topics if the user does first.
- Be natural and conversational — like a knowledgeable friend, not a performer.
- Keep responses short by default: 1 to 3 sentences. Go longer only if the topic genuinely needs it.
- Do NOT start every response with a filler phrase like "Absolutely!", "Great question!", "Of course!" — use these rarely and only when they arise naturally, not as a habit.
- Do NOT over-praise. Avoid hollow affirmations like "You're doing brilliantly!", "Wonderful!", "I love that!" unless the moment truly calls for it.
- Correct grammar mistakes subtly — use the correct form naturally in your reply without pointing it out.
- Sound like a real, calm, capable person. Not a chatbot trying to seem friendly.
- End your turn in a way that keeps the conversation going — a natural question or follow-up — but keep it brief.
- If the user says bye/goodbye/done/stop/quit — give a short, natural farewell and stop.
- You are an AI English coach on unhesitatedai — say so honestly if asked, in a plain, natural way.
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
// REALTIME TOKEN — GA format, session wrapper
// ─────────────────────────────────────────────
app.get('/api/realtime-token', (req, res) => {
  console.log('🔑 KEY starts with:', process.env.OPENAI_API_KEY?.slice(0, 8));
  console.log('🌐 Calling OpenAI realtime client_secrets...');

  const modelKey = req.query.model || 'nova';
  const modelDef = MODELS[modelKey] || MODELS['nova'];

  const payload = JSON.stringify({
    session: {
      type: 'realtime',
      model: 'gpt-realtime-2',
      instructions: buildSystemPrompt(modelKey),
      audio: {
        output: {
          voice: modelDef.ttsVoice
        }
      }
    }
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/realtime/client_secrets',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
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
        console.log('✅ Token issued for:', modelDef.name);
        res.json(parsed);
      } catch (e) {
        console.error('❌ Parse error. Raw:', raw);
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
  const voiceMap = {
    ash:'onyx', coral:'nova', echo:'echo', shimmer:'shimmer',
    verse:'fable', nova:'nova', alloy:'alloy', sage:'shimmer', ballad:'onyx'
  };
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 150
    });
    const responseText = completion.choices[0].message.content;
    chatHistories[key].push({ role:'user', content: message });
    chatHistories[key].push({ role:'assistant', content: responseText });
    res.json({ message: responseText });
  } catch (e) {
    console.error('Text chat error:', e);
    res.status(500).json({ message: 'Sorry, something went wrong!' });
  }
});

app.listen(PORT, () => console.log(`🚀 unhesitatedai running on port ${PORT}`));