// POST /api/chat — Project AI's secure backend (Vercel serverless function).
// Browser -> this function -> Project AI config -> Groq -> this function -> browser.
// The API key and system prompt never leave the server.

const {
  buildSystemMessage,
  PROJECT_AI_MODEL,
  PROJECT_AI_LIMITS,
} = require("./_config");

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message) {
  send(res, status, { error: { code: code, message: message } });
}

// Best-effort rate limiter (in memory, per serverless instance). See README for
// a production-grade option.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [key, entry] of hits) {
      if (entry.reset <= now) hits.delete(key);
    }
  }
  const entry = hits.get(ip);
  if (!entry || entry.reset <= now) {
    hits.set(ip, { count: 1, reset: now + PROJECT_AI_LIMITS.rateLimitWindowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > PROJECT_AI_LIMITS.rateLimitMax;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

// Only user/assistant turns are accepted from the browser. Any "system" role
// is dropped, so the client can never inject or replace instructions.
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(function (m) {
      return (
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
      );
    })
    .slice(-PROJECT_AI_LIMITS.maxHistoryMessages)
    .map(function (m) {
      return {
        role: m.role,
        content: m.content.slice(0, PROJECT_AI_LIMITS.maxHistoryMessageChars),
      };
    });
}

function readBody(req) {
  let body;
  try {
    body = req.body; // Vercel parses JSON; accessing it throws on malformed JSON
  } catch (e) {
    return null;
  }
  if (typeof body === "string") {
    if (body.length > PROJECT_AI_LIMITS.maxBodyChars) return null;
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }
  if (body && typeof body === "object") {
    if (JSON.stringify(body).length > PROJECT_AI_LIMITS.maxBodyChars) return null;
    return body;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method_not_allowed", "Method not allowed.");
  }

  if (!sameOrigin(req)) {
    return fail(res, 403, "forbidden", "This request was not allowed.");
  }

  const fwd = req.headers["x-forwarded-for"];
  const ip = (typeof fwd === "string" && fwd.split(",")[0].trim()) || "unknown";
  if (rateLimited(ip)) {
    return fail(res, 429, "rate_limited", "Too many requests. Please wait a moment.");
  }

  // 1. Parse + validate
  const data = readBody(req);
  if (!data) {
    return fail(res, 400, "bad_json", "The request could not be read.");
  }
  const message = typeof data.message === "string" ? data.message.trim() : "";
  if (!message) {
    return fail(res, 400, "empty_message", "Please enter a message.");
  }
  if (message.length > PROJECT_AI_LIMITS.maxMessageChars) {
    return fail(res, 400, "message_too_long", "That message is too long.");
  }

  // 2. Server-side secret (never sent to the browser)
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[Project AI] GROQ_API_KEY is not configured.");
    return fail(res, 500, "not_configured", "Project AI is not configured yet.");
  }
  const model = process.env.GROQ_MODEL || PROJECT_AI_MODEL.defaultModel;

  // 3. The SERVER builds the final message array; system message is always first.
  const messages = [buildSystemMessage()]
    .concat(sanitizeHistory(data.messages))
    .concat([{ role: "user", content: message }]);

  // 4. Call the inference provider
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, PROJECT_AI_MODEL.timeoutMs);

  let upstream;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: PROJECT_AI_MODEL.temperature,
        max_tokens: PROJECT_AI_MODEL.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    console.error("[Project AI] Provider request failed:", (err && err.name) || "error");
    return fail(res, 503, "unavailable", "Project AI is temporarily unavailable.");
  }
  clearTimeout(timer);

  // 5. Safe error mapping (details stay in server logs only)
  if (!upstream.ok) {
    console.error("[Project AI] Provider returned status", upstream.status);
    if (upstream.status === 429) {
      return fail(res, 429, "rate_limited", "Project AI is busy. Please try again shortly.");
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return fail(res, 500, "not_configured", "Project AI is not configured correctly.");
    }
    if (upstream.status === 400 || upstream.status === 404) {
      return fail(res, 500, "server_error", "Project AI hit a problem.");
    }
    return fail(res, 503, "unavailable", "Project AI is temporarily unavailable.");
  }

  let result;
  try {
    result = await upstream.json();
  } catch (e) {
    return fail(res, 503, "unavailable", "Project AI is temporarily unavailable.");
  }

  const choice = result && result.choices && result.choices[0];
  let text = choice && choice.message && choice.message.content;
  if (typeof text !== "string" || !text.trim()) {
    return fail(res, 503, "unavailable", "Project AI did not return a response.");
  }

  // Defence in depth: the key itself must never leave the server.
  text = text.split(apiKey).join("[redacted]");

  // 6. Return only what the frontend needs
  return send(res, 200, { reply: text.trim() });
};
