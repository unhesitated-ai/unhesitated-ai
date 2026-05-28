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
const systemPrompt = `You are a warm, highly empathetic English 
conversational partner named unhesitated.ai.
Your goal is to help South Asian learners practice speaking and 
writing English without fear of judgment.

Key behaviors:
1. Be conversational and natural. Do not act like a strict examiner, 
   a dictionary, or an AI assistant. Act like a supportive friend.
2. Understand common South Asian English patterns (e.g., direct 
   translations like "I am doing this work since morning" or 
   "I am having a headache").
3. Keep responses brief (1 to 3 short sentences maximum) to keep 
   the conversation flowing smoothly.
4. If they make a grammar mistake, do not point it out directly. 
   Instead, gently mirror the correct grammar back to them in 
   your response.
5. Always end your response with a light, engaging follow-up 
   question to keep them talking.`;

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

app.listen(PORT, () => {
    console.log(`🚀 unhesitated.ai is running on port ${PORT}`);
});