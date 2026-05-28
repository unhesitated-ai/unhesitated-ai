const express = require('express');
const cors    = require('cors');
const path    = require('path');
const multer  = require('multer');
const fs      = require('fs');
require('dotenv').config();
const OpenAI  = require('openai');

// ✅ Initialize OpenAI (replaces GoogleGenerativeAI)
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 Your existing system prompt — kept exactly as you had it (it's great)
const systemPrompt = `
IDENTITY & PURPOSE:
You are Aria, the highly intelligent, empathetic conversational engine of unhesitated.ai.
You are designed to help South Asian learners master spoken English, but your capabilities extend far beyond simple language tutoring. You possess world-class intellect, analytical reasoning, and vast knowledge on par with the most advanced AI systems in the world.

INTELLECTUAL CAPABILITY & REASONING:
- You can effortlessly discuss any complex topic—from quantum physics, coding, and global economics to philosophy and psychology—with absolute fluency, depth, and nuance.
- If a user asks a highly technical, analytical, or abstract question, answer it brilliantly. 
- Break down difficult concepts using clear, intuitive analogies. Be dynamic, intellectually stimulating, and insightful. Do not give generic, encyclopedic, or robotic summaries. 

CULTURAL INTELLIGENCE (SOUTH ASIA):
- You inherently understand the cultural, economic, and daily realities of Pakistan, India, Bangladesh, and Sri Lanka.
- You understand localized English perfectly (e.g., "doing the needful," "revert back," "out of station," "passing out").
- Relate high-level intellectual concepts back to local contexts when helpful (e.g., explaining supply and demand using local bazaars, or tech infrastructure using local load-shedding realities).

CONVERSATIONAL DYNAMICS (THE "REAL HUMAN" RULES):
1. SPOKEN, NOT WRITTEN: No matter how complex the topic is, you must sound like a brilliant human speaking in real-time, not a textbook. Limit responses to 2-4 short, punchy sentences. 
2. NATURAL VOCAL CUES: Use natural conversational fillers ("Hmm," "Yeah," "That's a fascinating question," "Actually...") to make the interaction feel organic and unscripted.
3. FLUENCY & ADAPTABILITY: Match the user's intellectual level. If they want a deep philosophical debate, debate them warmly. If they are confused, guide them patiently. 
4. IMPLICIT CORRECTION: Never interrupt to correct grammar. Mirror the correct phrasing naturally in your brilliant response.
5. ENGAGEMENT: End your thoughts by naturally passing the conversational ball back to the user to keep the high-level dialogue flowing effortlessly.
`;

const upload  = multer({ dest: 'uploads/' });
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Conversation history — now in OpenAI format
// (Gemini used "model", OpenAI uses "assistant")
let chatHistory = [];

// ─────────────────────────────────────────────
// 🎤 AUDIO ENDPOINT
// Whisper transcribes your voice → GPT-4o replies
// ─────────────────────────────────────────────
app.post('/api/chat', upload.single('audio'), async (req, res) => {
    console.log("🎤 Audio received! Transcribing with Whisper...");

    try {
        // Step 1: Transcribe audio using Whisper
        const transcription = await openai.audio.transcriptions.create({
            file  : fs.createReadStream(req.file.path),
            model : 'whisper-1'
        });

        const userText = transcription.text;
        console.log("📝 Whisper heard:", userText);

        // Clean up the temp audio file
        fs.unlinkSync(req.file.path);

        // Step 2: Send transcription to GPT-4o
        const messages = [
            { role: 'system',    content: systemPrompt },
            ...chatHistory,
            { role: 'user',      content: userText }
        ];

        const completion = await openai.chat.completions.create({
            model      : 'gpt-4o',
            messages   : messages,
            max_tokens : 150
        });

        const responseText = completion.choices[0].message.content;
        console.log("🤖 GPT-4o says:", responseText);

        // Save to history
        chatHistory.push({ role: 'user',      content: userText });
        chatHistory.push({ role: 'assistant', content: responseText });

        res.json({ message: responseText });

    } catch (error) {
        console.error("Error in /api/chat:", error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Sorry, something went wrong!" });
    }
});

// ─────────────────────────────────────────────
// 💬 TEXT CHAT ENDPOINT
// GPT-4o handles text messages
// ─────────────────────────────────────────────
app.post('/api/text-chat', async (req, res) => {
    const { message } = req.body;
    console.log("💬 Text received:", message);

    if (!message) {
        return res.status(400).json({ message: "No message provided." });
    }

    try {
        const messages = [
            { role: 'system',    content: systemPrompt },
            ...chatHistory,
            { role: 'user',      content: message }
        ];

        const completion = await openai.chat.completions.create({
            model      : 'gpt-4o',
            messages   : messages,
            max_tokens : 150
        });

        const responseText = completion.choices[0].message.content;
        console.log("🤖 GPT-4o says:", responseText);

        // Save to history
        chatHistory.push({ role: 'user',      content: message });
        chatHistory.push({ role: 'assistant', content: responseText });

        res.json({ message: responseText });

    } catch (error) {
        console.error("Error in /api/text-chat:", error);
        res.status(500).json({ message: "Sorry, something went wrong!" });
    }
});

// ─────────────────────────────────────────────
// 🔊 TTS ENDPOINT (NEW)
// Converts AI text reply → human-like OpenAI voice
// ─────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    console.log("🔊 TTS request for:", text?.substring(0, 50) + "...");

    if (!text) {
        return res.status(400).json({ error: "No text provided." });
    }

    try {
        const speech = await openai.audio.speech.create({
            model : 'tts-1',   // use 'tts-1-hd' for even better quality
            voice : 'nova',    // warm, clear female voice
            input : text
        });

        const buffer = Buffer.from(await speech.arrayBuffer());
        res.set('Content-Type', 'audio/mpeg');
        res.send(buffer);

    } catch (error) {
        console.error("Error in /api/tts:", error);
        res.status(500).json({ error: "TTS failed." });
    }
});

// ─────────────────────────────────────────────
// 🗑️ CLEAR HISTORY ENDPOINT (optional but useful)
// Call this to reset conversation memory
// ─────────────────────────────────────────────
app.post('/api/clear-history', (req, res) => {
    chatHistory = [];
    console.log("🗑️ Chat history cleared.");
    res.json({ message: "History cleared." });
});
// ─────────────────────────────────────────────
// ⚡ REALTIME WEBRTC TOKEN ENDPOINT
// Generates a temporary, secure token so the browser 
// can stream audio directly to OpenAI with zero latency.
// ─────────────────────────────────────────────
app.get('/api/realtime-token', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                voice: 'nova',
                instructions: systemPrompt,
            }),
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Token fetch error:', error);
        res.status(500).json({ error: 'Failed to get Realtime token' });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 unhesitated.ai is running on port ${PORT}`);
});