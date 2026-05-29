```js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─────────────────────────────────────────────
   MODEL REGISTRY
───────────────────────────────────────────── */

const MODELS = {
  orion: {
    name: 'Orion',
    voice: 'alloy',
    personality: `
You are Orion, a bold, energetic and modern male English coach on unhesitated.ai.
You are confident, concise, motivating and conversational.
Keep replies short and natural.
`
  },

  nova: {
    name: 'Nova',
    voice: 'nova',
    personality: `
You are Nova, a warm and expressive female English coach on unhesitated.ai.
You are encouraging, upbeat and engaging.
Keep replies natural and conversational.
`
  },

  arthur: {
    name: 'Arthur',
    voice: 'echo',
    personality: `
You are Arthur, a refined and articulate English coach on unhesitated.ai.
You are calm, intelligent and gentlemanly.
Keep replies short and elegant.
`
  },

  eleanor: {
    name: 'Eleanor',
    voice: 'shimmer',
    personality: `
You are Eleanor, a graceful and sophisticated English coach on unhesitated.ai.
You are warm, poised and eloquent.
`
  },

  kabir: {
    name: 'Kabir',
    voice: 'fable',
    personality: `
You are Kabir, a thoughtful and wise English coach on unhesitated.ai.
You explain ideas clearly and patiently.
`
  },

  maya: {
    name: 'Maya',
    voice: 'nova',
    personality: `
You are Maya, a nurturing and intelligent English coach on unhesitated.ai.
You are warm, encouraging and supportive.
`
  },

  ren: {
    name: 'Ren',
    voice: 'alloy',
    personality: `
You are Ren, a calm and patient English coach on unhesitated.ai.
You speak clearly and thoughtfully.
`
  },

  mei: {
    name: 'Mei',
    voice: 'shimmer',
    personality: `
You are Mei, a gentle and attentive English coach on unhesitated.ai.
You are calm, supportive and precise.
`
  },

  amir: {
    name: 'Amir',
    voice: 'onyx',
    personality: `
You are Amir, a philosophical and warm English coach on unhesitated.ai.
You speak naturally and poetically.
`
  },

  layla: {
    name: 'Layla',
    voice: 'nova',
    personality: `
You are Layla, a vibrant and expressive English coach on unhesitated.ai.
You are energetic, caring and uplifting.
`
  }
};

/* ─────────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────────── */

function buildSystemPrompt(modelKey) {
  const model = MODELS[modelKey] || MODELS.nova;

  return `
${model.personality}

GENERAL RULES:
- You are an AI speaking companion on unhesitated.ai
- Keep responses short and voice-friendly
- Speak naturally like a real human conversation
- Use 2–4 short sentences maximum
- Be encouraging and engaging
- Adapt to the user's English level
- Ask follow-up questions naturally
- Never sound robotic
- If the user says goodbye, end warmly and briefly
`;
}

/* ─────────────────────────────────────────────
   REALTIME TOKEN ENDPOINT
───────────────────────────────────────────── */

app.get('/api/realtime-token', async (req, res) => {
  const modelKey = req.query.model || 'nova';

  const selectedModel =
    MODELS[modelKey] || MODELS.nova;

  try {

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          session: {
            type: 'realtime',

            model: 'gpt-4o-realtime-preview-2024-12-17',

            voice: selectedModel.voice,

            instructions: buildSystemPrompt(modelKey),

            audio: {
              input: {
                transcription: {
                  model: 'gpt-4o-transcribe'
                }
              }
            },

            turn_detection: {
              type: 'server_vad'
            }
          }
        })
      }
    );

    const data = await response.json().catch(async () => {
      return {
        raw: await response.text()
      };
    });

    if (!response.ok) {
      console.error(
        'Realtime session creation failed:',
        data
      );

      return res.status(response.status).json({
        error: data
      });
    }

    res.json(data);

  } catch (err) {

    console.error('Realtime token error:', err);

    res.status(500).json({
      error: 'Failed to create realtime session'
    });
  }
});

/* ─────────────────────────────────────────────
   TEXT CHAT FALLBACK
───────────────────────────────────────────── */

const chatHistories = {};

app.post('/api/text-chat', async (req, res) => {

  const {
    message,
    model: modelKey
  } = req.body;

  if (!message) {
    return res.status(400).json({
      message: 'No message provided'
    });
  }

  const selectedModel =
    MODELS[modelKey] || MODELS.nova;

  if (!chatHistories[modelKey]) {
    chatHistories[modelKey] = [];
  }

  try {

    const completion =
      await openai.chat.completions.create({

        model: 'gpt-4o',

        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(modelKey)
          },

          ...chatHistories[modelKey],

          {
            role: 'user',
            content: message
          }
        ],

        max_tokens: 150
      });

    const aiReply =
      completion.choices[0].message.content;

    chatHistories[modelKey].push({
      role: 'user',
      content: message
    });

    chatHistories[modelKey].push({
      role: 'assistant',
      content: aiReply
    });

    res.json({
      message: aiReply
    });

  } catch (err) {

    console.error('Chat error:', err);

    res.status(500).json({
      message: 'Something went wrong'
    });
  }
});

/* ─────────────────────────────────────────────
   TTS FALLBACK
───────────────────────────────────────────── */

app.post('/api/tts', async (req, res) => {

  const {
    text,
    model: modelKey
  } = req.body;

  if (!text) {
    return res.status(400).json({
      error: 'No text provided'
    });
  }

  const selectedModel =
    MODELS[modelKey] || MODELS.nova;

  try {

    const speech =
      await openai.audio.speech.create({

        model: 'tts-1',

        voice: selectedModel.voice,

        input: text
      });

    const buffer =
      Buffer.from(await speech.arrayBuffer());

    res.set('Content-Type', 'audio/mpeg');

    res.send(buffer);

  } catch (err) {

    console.error('TTS error:', err);

    res.status(500).json({
      error: 'TTS failed'
    });
  }
});

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(
    `🚀 unhesitated.ai running on port ${PORT}`
  );
});
```
