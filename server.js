const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini Connection
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🧠 THE BRAIN UPGRADE: System Instructions tailored for South Asian Learners
const systemPrompt = `You are a warm, highly empathetic English conversational partner named unhesitated.ai. 
Your goal is to help South Asian learners practice speaking and writing English without fear of judgment.
Key behaviors:
1. Be conversational and natural. Do not act like a strict examiner, a dictionary, or an AI assistant. Act like a supportive friend.
2. Understand common South Asian English patterns (e.g., direct translations from native languages like "I am doing this work since morning" or "I am having a headache").
3. Keep responses brief (1 to 3 short sentences maximum) to keep the conversation flowing smoothly.
4. If they make a grammar mistake, do not point it out directly. Instead, gently mirror the correct grammar back to them in your response.
5. Always end your response with a light, engaging follow-up question to keep them talking.`;

// 🛠️ THE FIX: Initialize the model properly with the System Instructions
const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash",
    systemInstruction: systemPrompt 
});

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 📚 THE MEMORY: A temporary array to store the conversation history
let chatHistory = [];

// The receiving dock for Audio
app.post('/api/chat', upload.single('audio'), async (req, res) => {
    console.log("🎉 Audio received! Asking Gemini...");
    
    try {
        const audioPath = req.file.path;
        const audioData = fs.readFileSync(audioPath);
        
        const audioPart = {
            inlineData: {
                data: audioData.toString("base64"),
                mimeType: req.file.mimetype || "audio/webm" // Dynamic mimetype based on frontend
            }
        };

        // Start a chat with MEMORY
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage([audioPart]);
        const responseText = result.response.text();
        
        console.log("🤖 Gemini says:", responseText);
        fs.unlinkSync(audioPath);
        
        // Save this exchange so the AI remembers it next time
        chatHistory.push({ role: "user", parts: [{ text: "Sent an audio message." }] });
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

        res.json({ message: responseText });

    } catch (error) {
        console.error("Error talking to Gemini:", error);
        res.status(500).json({ message: "Sorry, my brain glitched!" });
    }
});

// The receiving dock for Text
app.post('/api/text-chat', async (req, res) => {
    const { message } = req.body;
    console.log("💬 Text message received:", message);

    try {
        // Start a chat with MEMORY
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(message);
        const responseText = result.response.text();
        
        console.log("🤖 Gemini says:", responseText);
        
        // Save this exchange to the history array
        chatHistory.push({ role: "user", parts: [{ text: message }] });
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

        res.json({ message: responseText });
    } catch (error) {
        console.error("Error talking to Gemini:", error);
        res.status(500).json({ message: "Sorry, my brain glitched!" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 unhesitated.ai server is running! Open your browser and go to: http://localhost:${PORT}`);
});