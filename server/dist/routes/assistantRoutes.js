"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const openai_1 = __importDefault(require("openai"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const user_1 = __importDefault(require("../models/user"));
const Groups_1 = __importDefault(require("../models/Groups"));
const router = express_1.default.Router();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
// Set OPENAI_MODEL in the server .env to change the assistant chat model.
const assistantModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
// POST /api/assistant/chat — send message to AI assistant
router.post("/chat", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || typeof message !== "string") {
            res.status(400).json({ msg: "Message is required" });
            return;
        }
        // Fetch user's watchlist (movies they want to watch)
        const user = await user_1.default.findById(req.user.id).populate("watchlist");
        if (!user) {
            res.status(404).json({ msg: "User not found" });
            return;
        }
        const watchlistTitles = user.watchlist
            .map((m) => m.title)
            .filter(Boolean);
        // Fetch user's watched movies from their groups
        const groups = await Groups_1.default.find({ members: req.user.id }).populate("movies");
        const watchedMovies = new Set();
        for (const group of groups) {
            for (const movie of group.movies) {
                if (movie?.title)
                    watchedMovies.add(movie.title);
            }
        }
        // Build the system prompt with user context
        const systemPrompt = buildSystemPrompt(watchlistTitles, Array.from(watchedMovies));
        // Build conversation messages for OpenAI
        const messages = [
            { role: "system", content: systemPrompt },
        ];
        // Add conversation history (limit to last 20 messages to stay within token limits)
        const recentHistory = (history || []).slice(-20);
        for (const msg of recentHistory) {
            messages.push({
                role: msg.role,
                content: msg.content,
            });
        }
        // Add the new user message
        messages.push({ role: "user", content: message });
        // Set up streaming response
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        const stream = await openai.chat.completions.create({
            model: assistantModel,
            messages,
            stream: true,
            max_tokens: 1000,
            temperature: 0.7,
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    }
    catch (err) {
        console.error("Assistant chat error:", err);
        // If headers not sent yet, send JSON error
        if (!res.headersSent) {
            res.status(500).json({
                msg: "Failed to get AI response",
                error: process.env.NODE_ENV === "development" ? err.message : undefined,
            });
        }
        else {
            // If streaming already started, send error in stream format
            res.write(`data: ${JSON.stringify({ error: "An error occurred while generating the response." })}\n\n`);
            res.end();
        }
    }
});
function buildSystemPrompt(watchlist, watchedMovies) {
    let prompt = `You are a friendly and knowledgeable movie expert assistant built into a movie tracking app. You help users with anything related to movies and TV shows.

## What you can help with:
- Movie plots, summaries, and explanations (without major spoilers unless asked)
- Information about actors, directors, writers, and other crew
- Movie trivia, behind-the-scenes facts, and fun details
- Personalized movie recommendations based on user preferences
- Comparisons between movies, genres, or filmmakers
- Award history, box office info, and critical reception

## Personality:
- Friendly and enthusiastic about movies
- Concise — keep answers focused, avoid walls of text
- When recommending movies, give brief reasons why each pick fits
- Use casual, conversational tone`;
    if (watchlist.length > 0) {
        prompt += `\n\n## User's Watchlist (movies they want to watch):
${watchlist.map((t) => `- ${t}`).join("\n")}`;
    }
    if (watchedMovies.length > 0) {
        prompt += `\n\n## User's Watched Movies (movies they've already seen):
${watchedMovies.map((t) => `- ${t}`).join("\n")}`;
    }
    prompt += `\n\n## Recommendation rules:
- When suggesting movies, consider their watchlist and watched history to understand their taste
- Never suggest movies already on their watchlist or already watched
- If you don't have enough information about their preferences, ask 1-2 short questions about what genre, mood, or era they're in the mood for
- Give 3-5 suggestions at a time, with a brief reason for each`;
    return prompt;
}
exports.default = router;
