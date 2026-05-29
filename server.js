const express = require('express');
const cors    = require('cors');
const path    = require('path');
const multer  = require('multer');
require('dotenv').config();
const OpenAI  = require('openai');

const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `
IDENTITY & PURPOSE:
You are Aria, the highly intelligent, empathetic conversational engine of unhesitated.ai.
You are designed to help learners master spoken English.

INTELLECTUAL CAPABILITY & REASONING:
- You can effortlessly discuss any complex topic with absolute fluency, depth, and nuance.
- Break down difficult concepts using clear, intuitive analogies. Be dynamic and insightful. 

CONVERSATIONAL DYNAMICS (THE "REAL HUMAN" RULES):
1. SPOKEN, NOT WRITTEN: Limit responses to 2-4 short, punchy sentences. 
2. NATURAL VOCAL CUES: Use natural conversational fillers ("Hmm," "Yeah," "Actually...").
3. FLUENCY & ADAPTABILITY: Match the user's intellectual level.
4. IMPLICIT CORRECTION: Never interrupt to correct grammar. Mirror the correct phrasing naturally.
5. ENGAGEMENT: End your thoughts by naturally passing the conversational ball back to the user.
`;

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────
// ⚡ REALTIME WEBRTC TOKEN ENDPOINT (BULLETPROOF)
// ─────────────────────────────────────────────
app.get('/api/realtime-token', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            // Structured exactly to OpenAI's strict General Availability rules
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                session: {
                    type: 'realtime',
                    instructions: systemPrompt,
                    audio: {
                        output: {
                            voice: 'shimmer'
                        }
                    }
                }
            }),
        });
        
        const data = await response.json();
        if (!response.ok) console.error("OpenAI API Error:", data);
        res.json(data);

    } catch (error) {
        console.error('Token fetch error:', error);
        res.status(500).json({ error: 'Backend failed to fetch token.' });
    }
});

// Fallback TTS endpoint for text chat
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided." });
    try {
        const speech = await openai.audio.speech.create({
            model : 'tts-1', 
            voice : 'nova',    
            input : text
        });
        const buffer = Buffer.from(await speech.arrayBuffer());
        res.set('Content-Type', 'audio/mpeg');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: "TTS failed." });
    }
});

// Fallback Text chat endpoint
let chatHistory = [];
app.post('/api/text-chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: "No message provided." });
    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: message }
        ];
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            max_tokens: 150
        });
        const responseText = completion.choices[0].message.content;
        chatHistory.push({ role: 'user', content: message });
        chatHistory.push({ role: 'assistant', content: responseText });
        res.json({ message: responseText });
    } catch (error) {
        res.status(500).json({ message: "Sorry, something went wrong!" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 unhesitated.ai is running on port ${PORT}`);
});