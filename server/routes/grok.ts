// routes/grok.ts
import { Router } from "express";
import fetch from "node-fetch";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limit: 5 calls per minute
const grokLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many AI requests. Wait 1 minute." },
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(grokLimiter);

// 1. FULL PROMPT: For unlocked kits
router.post("/grok-prompt", async (req, res) => {
  const { kitId, userPrompt } = req.body;

  if (!userPrompt) {
    return res.status(400).json({ error: "userPrompt required" });
  }

  // UNLOCK CHECK (use your session)
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }

  // TODO: Replace with real DB check
  // const ownsKit = await db.kitPurchase.findFirst({ where: { userId, kitId } });
  // if (!ownsKit) return res.status(403).json({ error: 'Kit not purchased' });

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-beta",
        messages: [
          {
            role: "system",
            content:
              "You are a 24/7 print-on-demand expert. Be concise, professional, and actionable.",
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("xAI Error:", data);
      return res.status(500).json({ error: "AI service error" });
    }

    res.json({ output: data.choices[0].message.content });
  } catch (err: any) {
    console.error("Grok error:", err.message);
    res.status(500).json({ error: "Network error" });
  }
});

// 2. PUBLIC PREVIEW: No login needed
router.get("/grok-preview", async (req, res) => {
  const { kitId } = req.query as { kitId: string };
  if (!kitId) return res.status(400).json({ error: "kitId required" });

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-beta",
        messages: [
          {
            role: "system",
            content:
              "You are a print-on-demand expert. Give a short, exciting preview.",
          },
          {
            role: "user",
            content: `Preview Kit #${kitId}: 3 steps to win in 2025.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.6,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Failed");

    res.json({ output: data.choices[0].message.content });
  } catch (err: any) {
    console.error("Preview error:", err.message);
    res.status(500).json({ error: "Preview unavailable" });
  }
});

export default router;
