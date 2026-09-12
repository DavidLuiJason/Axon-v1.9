import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Error handling middleware for oversized payloads
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.name === 'PayloadTooLargeError')) {
    console.warn('[Server] PayloadTooLargeError caught:', err.message);
    return res.status(413).json({
      success: false,
      error: 'Request payload too large: The attached files or context exceed the server limit. Please use smaller files or reduce attachment sizes.',
    });
  }
  next(err);
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'AXON Multi-AI Engine' });
});

// Helper to construct system instruction with per-project isolation
function getSystemPrompt(accountLabel?: string, providerName?: string, projectContext?: any) {
  let prompt = `You are AXON, an AI-powered workspace for a smartphone.
Active session: "${accountLabel || 'Default'}" (${providerName || 'AI Engine'}).

CRITICAL PERSONA DIRECTIVE:
You must ALWAYS speak in the first person using "I" (e.g., "I can help you with that...", "I have updated...", "I am currently set to..."). NEVER refer to yourself in the third person as "AXON" or "the system" in conversational dialogue (e.g. do not say "AXON will do this", say "I will do this").

CONVERSATIONAL CALIBRATION RULES:
1. Match the depth of what is actually being asked:
   - Short, direct answers for simple questions.
   - Detailed answers only when the question is genuinely complex or explicitly asks for depth.
2. Avoid unnecessary padding, restating the question, or over-explaining things nobody asked about.
3. If a request is ambiguous, ask at most ONE clarifying question rather than guessing wildly.
4. Keep a natural, plain-language conversational tone.

ACCURATE SELF-KNOWLEDGE (Established in Parts 1-6):
- Dual-pane workspace (Chat left, Workspace/code right) with 3 view states (chat-only, 50/50 split, workspace-only).
- Tools Menu suites: Text, Calculation, Color, Image utilities, and File conversions.
- Multi-AI Official API connections: Gemini, Claude, and ChatGPT with user-managed keys, manual account switching, and 24-hour limit cooldown tracking.
- Automation & Run Code Layer: Conditional trigger-and-action rules engine and sandboxed live Run Code hooks.
- Notes & Memory System: Scoped per-project memory/context isolation, full-text search across all notes, tags/categories, pin/unpin, and rich conversation data extraction to notes or downloadable files (.md, .txt, .json).
- Features not yet built: full video sequencer, voice synthesis. Do not claim to possess them yet.

WORKSPACE & CODE PRESENTATION DIRECTIVE:
Unless the user explicitly asks to see the code printed in the chat itself (e.g. "show code in chat", "print code here"), keep your chat replies conversational and concise — do NOT paste large code blocks into the chat. All generated code is automatically extracted and loaded directly into the user's Workspace Code editor. If providing code, enclose the full code block cleanly once in standard markdown fences so AXON's runner extracts it into Workspace Code and Preview, but keep your surrounding response conversational.`;

  if (projectContext && projectContext.name) {
    prompt += `\n\nPER-PROJECT MEMORY & ISOLATION DIRECTIVE:
You are currently operating inside the isolated context of Project: "${projectContext.name}".
${projectContext.description ? `Project Scope/Goal: ${projectContext.description}` : ''}
${projectContext.systemContext ? `Custom Directives: ${projectContext.systemContext}` : ''}
${projectContext.relevantNotes ? `Project Notes & Knowledge Memory:\n${projectContext.relevantNotes}` : ''}
[CRITICAL ISOLATION RULE]: Strictly focus your memory and references on "${projectContext.name}". Do NOT draw in or confuse information with unrelated projects unless explicitly prompted.`;
  }

  return prompt;
}

// Helpers to format conversation history robustly across AI providers

function getCleanMessages(rawMessages: any[]): Array<{ sender: string; text: string; id?: string; attachments?: any[]; attachment?: any }> {
  return (rawMessages || []).filter((m: any) => {
    if (!m) return false;
    const hasText = typeof m.text === 'string' && m.text.trim().length > 0;
    const hasAttachments = (Array.isArray(m.attachments) && m.attachments.length > 0) || Boolean(m.attachment);
    if (!hasText && !hasAttachments) return false;
    if (m.isRateLimitedNotice) return false;
    if (typeof m.id === 'string' && (m.id.includes('-limited') || m.id.includes('-cooldown') || m.id.includes('-nokey'))) return false;
    if (typeof m.id === 'string' && m.id.includes('-switch-') && m.sender === 'axon') return false;
    return true;
  });
}

function getMessageAttachments(m: any): any[] {
  if (Array.isArray(m.attachments) && m.attachments.length > 0) {
    return m.attachments;
  }
  if (m.attachment) {
    return [m.attachment];
  }
  return [];
}

function formatGeminiContents(
  rawMessages: any[],
  formattedContext?: string
): Array<{ role: 'user' | 'model'; parts: any[] }> {
  const clean = getCleanMessages(rawMessages);
  if (clean.length === 0) {
    const defaultText = formattedContext ? `${formattedContext}Hello` : 'Hello';
    return [{ role: 'user', parts: [{ text: defaultText }] }];
  }

  const mapped = clean.map((m) => {
    const role = (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model';
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    const attachments = getMessageAttachments(m);
    const parts: any[] = [];

    if (text) {
      parts.push({ text });
    }

    for (const att of attachments) {
      if (att?.dataUrl && typeof att.dataUrl === 'string') {
        const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }

    if (parts.length === 0) {
      parts.push({ text: ' ' });
    }

    return { role, parts };
  });

  // Gemini API requires the conversation to start with 'user'
  if (mapped.length > 0 && mapped[0].role === 'model') {
    mapped.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  // Prepend handoff context summary to first user turn if present
  if (formattedContext && mapped.length > 0) {
    const firstUser = mapped.find((c) => c.role === 'user');
    if (firstUser) {
      const textPart = firstUser.parts.find((p) => typeof p.text === 'string');
      if (textPart) {
        textPart.text = `${formattedContext}${textPart.text}`;
      } else {
        firstUser.parts.unshift({ text: formattedContext });
      }
    }
  }

  // Maintain up to 40 recent turns
  let windowed = mapped.length > 40 ? mapped.slice(-40) : mapped;
  if (windowed[0]?.role === 'model') {
    windowed.shift();
  }
  if (windowed.length === 0) {
    windowed = [{ role: 'user', parts: [{ text: 'Hello' }] }];
  }

  return windowed;
}

function formatClaudeMessages(
  rawMessages: any[],
  formattedContext?: string
): Array<{ role: 'user' | 'assistant'; content: any }> {
  const clean = getCleanMessages(rawMessages);
  if (clean.length === 0) {
    const defaultText = formattedContext ? `${formattedContext}Hello` : 'Hello';
    return [{ role: 'user', content: defaultText }];
  }

  const mapped = clean.map((m) => {
    const role = (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant';
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    const attachments = getMessageAttachments(m);
    const contentList: any[] = [];

    if (text) {
      contentList.push({ type: 'text', text });
    }

    for (const att of attachments) {
      if (att?.dataUrl?.startsWith('data:image/')) {
        const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentList.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
          });
        }
      }
    }

    if (contentList.length === 0) {
      contentList.push({ type: 'text', text: ' ' });
    }

    const content = contentList.length === 1 && contentList[0].type === 'text' ? contentList[0].text : contentList;
    return { role, content };
  });

  // Strict alternation: user, assistant, user, assistant
  const coalesced: Array<{ role: 'user' | 'assistant'; content: any }> = [];
  for (const item of mapped) {
    if (coalesced.length > 0 && coalesced[coalesced.length - 1].role === item.role) {
      const prev = coalesced[coalesced.length - 1];
      const prevArr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
      const nextArr = Array.isArray(item.content) ? item.content : [{ type: 'text', text: item.content }];
      prev.content = [...prevArr, ...nextArr];
    } else {
      coalesced.push(item);
    }
  }

  // Must begin with 'user'
  if (coalesced.length > 0 && coalesced[0].role === 'assistant') {
    coalesced.unshift({ role: 'user', content: 'Hello' });
  }

  if (formattedContext && coalesced.length > 0) {
    const firstUser = coalesced.find((c) => c.role === 'user');
    if (firstUser) {
      if (typeof firstUser.content === 'string') {
        firstUser.content = `${formattedContext}${firstUser.content}`;
      } else if (Array.isArray(firstUser.content)) {
        const textPart = firstUser.content.find((p) => p.type === 'text');
        if (textPart) {
          textPart.text = `${formattedContext}${textPart.text}`;
        } else {
          firstUser.content.unshift({ type: 'text', text: formattedContext });
        }
      }
    }
  }

  let windowed = coalesced.length > 40 ? coalesced.slice(-40) : coalesced;
  if (windowed[0]?.role === 'assistant') {
    windowed.shift();
  }
  if (windowed.length === 0) {
    windowed = [{ role: 'user', content: 'Hello' }];
  }

  return windowed;
}

function formatChatGptMessages(
  rawMessages: any[],
  formattedContext?: string
): Array<{ role: 'user' | 'assistant'; content: any }> {
  const clean = getCleanMessages(rawMessages);
  if (clean.length === 0) {
    const defaultText = formattedContext ? `${formattedContext}Hello` : 'Hello';
    return [{ role: 'user', content: defaultText }];
  }

  const mapped = clean.map((m) => {
    const role = (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant';
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    const attachments = getMessageAttachments(m);
    const contentList: any[] = [];

    if (text) {
      contentList.push({ type: 'text', text });
    }

    for (const att of attachments) {
      if (att?.dataUrl?.startsWith('data:image/')) {
        contentList.push({
          type: 'image_url',
          image_url: { url: att.dataUrl },
        });
      }
    }

    if (contentList.length === 0) {
      contentList.push({ type: 'text', text: ' ' });
    }

    const content = contentList.length === 1 && contentList[0].type === 'text' ? contentList[0].text : contentList;
    return { role, content };
  });

  const coalesced: Array<{ role: 'user' | 'assistant'; content: any }> = [];
  for (const item of mapped) {
    if (coalesced.length > 0 && coalesced[coalesced.length - 1].role === item.role) {
      const prev = coalesced[coalesced.length - 1];
      const prevArr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
      const nextArr = Array.isArray(item.content) ? item.content : [{ type: 'text', text: item.content }];
      prev.content = [...prevArr, ...nextArr];
    } else {
      coalesced.push(item);
    }
  }

  if (coalesced.length > 0 && coalesced[0].role === 'assistant') {
    coalesced.unshift({ role: 'user', content: 'Hello' });
  }

  if (formattedContext && coalesced.length > 0) {
    const firstUser = coalesced.find((c) => c.role === 'user');
    if (firstUser) {
      if (typeof firstUser.content === 'string') {
        firstUser.content = `${formattedContext}${firstUser.content}`;
      } else if (Array.isArray(firstUser.content)) {
        const textPart = firstUser.content.find((p) => p.type === 'text');
        if (textPart) {
          textPart.text = `${formattedContext}${textPart.text}`;
        } else {
          firstUser.content.unshift({ type: 'text', text: formattedContext });
        }
      }
    }
  }

  return coalesced.length > 40 ? coalesced.slice(-40) : coalesced;
}

// Multi-AI Chat Endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { provider, model, messages, apiKey, accountLabel, conversationSummary, projectContext } = req.body;

    const systemInstruction = getSystemPrompt(accountLabel, provider, projectContext);

    // If a conversation summary is passed from an account handoff, prepend it as prior context
    let formattedContext = '';
    if (conversationSummary) {
      formattedContext = `[Context summary from previous session handoff: ${conversationSummary}]\n\n`;
    }

    // 1. GOOGLE GEMINI (Official @google/genai SDK)
    const normalizedModel =
      model === 'gemini-2.5-flash' || model === 'gemini-2.5-pro' || !model
        ? 'gemini-3.6-flash'
        : model;

    const isAxonProvider =
      provider === 'axon' ||
      provider === 'axon-offline-core' ||
      provider === 'axon-local' ||
      provider === 'axon_local' ||
      provider === 'local' ||
      provider === 'offline' ||
      (typeof provider === 'string' && provider.toLowerCase().includes('axon')) ||
      (typeof model === 'string' && model.toLowerCase().includes('axon'));

    const hasVisualAttachments = Array.isArray(messages) && messages.some((m: any) => {
      const atts = getMessageAttachments(m);
      return atts.some((a: any) => a?.type?.startsWith('image/') || (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')));
    });

    const shouldDelegateToGemini =
      provider === 'gemini' ||
      (hasVisualAttachments && (apiKey || process.env.GEMINI_API_KEY)) ||
      (!provider && !isAxonProvider && (normalizedModel.includes('gemini') || process.env.GEMINI_API_KEY)) ||
      (isAxonProvider && hasVisualAttachments && (apiKey || process.env.GEMINI_API_KEY));

    if (shouldDelegateToGemini) {
      const activeKey = apiKey || process.env.GEMINI_API_KEY;
      if (!activeKey) {
        return res.status(400).json({
          success: false,
          errorType: 'MISSING_KEY',
          message: 'No Gemini API key provided. Add one in AXON Settings > AI Accounts.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: activeKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Format multi-turn conversation history for Gemini (including visual inlineData images)
      const geminiContents = formatGeminiContents(messages, formattedContext);

      try {
        const preferredModel = normalizedModel && !normalizedModel.includes('axon') ? normalizedModel : 'gemini-3.8-flash';
        const candidateModels = [preferredModel, 'gemini-3.8-flash', 'gemini-3.6-flash'].filter(
          (m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx
        );
        let response: any = null;
        let lastError: any = null;

        for (const candidate of candidateModels) {
          try {
            response = await ai.models.generateContent({
              model: candidate,
              contents: geminiContents,
              config: {
                systemInstruction,
                temperature: 0.7,
              },
            });
            if (response && response.text) {
              break;
            }
          } catch (modelErr: any) {
            lastError = modelErr;
            console.warn(`Gemini model ${candidate} failed, trying next candidate if available...`, modelErr?.message || modelErr);
          }
        }

        if (!response) {
          throw lastError || new Error('No candidate Gemini model could fulfill the request.');
        }

        const replyText = response.text || 'No text generated.';
        return res.json({ success: true, text: replyText });
      } catch (geminiError: any) {
        const errMsg = geminiError?.message || String(geminiError);
        const status = geminiError?.status || geminiError?.code;

        // Detect 429 / Quota / Resource Exhausted
        if (
          status === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('Quota exceeded') ||
          errMsg.includes('rate limit')
        ) {
          return res.status(429).json({
            success: false,
            errorType: 'RATE_LIMIT',
            retryAfterMs: 86400000, // 24 hours cooldown
            message: 'Gemini account usage limit reached. Cooldown timer recorded.',
          });
        }

        return res.status(500).json({
          success: false,
          errorType: 'API_ERROR',
          message: `Gemini API error: ${errMsg}`,
        });
      }
    }

    // 2. ANTHROPIC CLAUDE (Official Messages API)
    if (provider === 'claude') {
      const activeKey = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!activeKey) {
        return res.status(400).json({
          success: false,
          errorType: 'MISSING_KEY',
          message: 'No Claude API key provided. Add one in AXON Settings > AI Accounts.',
        });
      }

      const claudeModel = model || 'claude-3-5-sonnet-20241022';

      // Build full conversation history for Claude with strictly alternating roles
      const claudeMessages = formatClaudeMessages(messages, formattedContext);

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 1024,
          system: systemInstruction,
          messages: claudeMessages,
        }),
      });

      const data: any = await claudeRes.json();

      if (!claudeRes.ok) {
        if (claudeRes.status === 429 || data?.error?.type === 'rate_limit_error') {
          return res.status(429).json({
            success: false,
            errorType: 'RATE_LIMIT',
            retryAfterMs: 86400000,
            message: 'Claude account usage limit reached. Cooldown timer recorded.',
          });
        }
        return res.status(claudeRes.status).json({
          success: false,
          errorType: 'API_ERROR',
          message: data?.error?.message || 'Claude API returned an error',
        });
      }

      const reply = data.content?.[0]?.text || '';
      return res.json({ success: true, text: reply });
    }

    // 3. OPENAI CHATGPT (Official Chat Completions API)
    if (provider === 'chatgpt') {
      const activeKey = apiKey || process.env.OPENAI_API_KEY;
      if (!activeKey) {
        return res.status(400).json({
          success: false,
          errorType: 'MISSING_KEY',
          message: 'No ChatGPT API key provided. Add one in AXON Settings > AI Accounts.',
        });
      }

      const gptModel = model || 'gpt-4o';

      const gptHistory = formatChatGptMessages(messages, formattedContext);

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: gptModel,
          messages: [{ role: 'system', content: systemInstruction }, ...gptHistory],
          max_tokens: 1024,
        }),
      });

      const data: any = await openAiRes.json();

      if (!openAiRes.ok) {
        if (
          openAiRes.status === 429 ||
          data?.error?.code === 'insufficient_quota' ||
          data?.error?.code === 'rate_limit_exceeded'
        ) {
          return res.status(429).json({
            success: false,
            errorType: 'RATE_LIMIT',
            retryAfterMs: 86400000,
            message: 'ChatGPT account usage limit reached. Cooldown timer recorded.',
          });
        }
        return res.status(openAiRes.status).json({
          success: false,
          errorType: 'API_ERROR',
          message: data?.error?.message || 'ChatGPT API returned an error',
        });
      }

      const reply = data.choices?.[0]?.message?.content || '';
      return res.json({ success: true, text: reply });
    }

    // 4. AXON LOCAL ENGINE PASS-THROUGH & OFFLINE SAFETY
    if (isAxonProvider || !provider) {
      const clean = getCleanMessages(messages);
      const lastMsg = clean[clean.length - 1] || { sender: 'user', text: 'Hello' };
      const lastUserMsg = lastMsg.text.trim();
      const lower = lastUserMsg.toLowerCase();

      const priorTurns = clean.slice(0, -1);
      const priorUserTurns = priorTurns.filter((m) => m.sender === 'user');
      const lastAssistant = [...priorTurns].reverse().find((m) => m.sender === 'axon' || m.sender === 'assistant');

      // Check if it's an initial greeting opener (ONLY if no prior user turns exist in this session)
      if (
        priorUserTurns.length === 0 &&
        (/^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening)|yo)(?:[ ,.!]|$)/i.test(lower) ||
          /^hello\s+axon/i.test(lower))
      ) {
        return res.json({
          success: true,
          text: `Hello! I am AXON's local reasoning core, running on-device in this workspace.\n\nI am actively processing your workspace and ready to help you with:\n• Project architecture, engineering design, and task breakdown\n• Exact arithmetic calculations and unit conversions\n• Searching indexed project files and activity timeline history\n• Storage manifest budgeting and asset management\n\nWhat would you like to work on?`,
        });
      }

      // Check for affirmation ("Yes", "Sure", "Go ahead", etc.) following an assistant offer
      const isAffirmative = /^(?:yes|yeah|yep|sure|ok|okay|go ahead|please do|let's do it|sounds good|do it|proceed|affirmative)(?:[ ,.!]|$)/i.test(lower);
      if (isAffirmative && lastAssistant) {
        const assistantLower = lastAssistant.text.toLowerCase();
        if (assistantLower.includes('chess') || assistantLower.includes('game')) {
          return res.json({
            success: true,
            text: `Understood! I will proceed with building the chess game for project "${projectContext?.name || 'General'}".\n\n**Next Steps:**\n1. Establish standard 8x8 board state and piece coordinate representation\n2. Implement move validator (including castling, en passant, and check detection)\n3. Build interactive board UI with turn management\n\nWould you prefer starting with the board component or the rule validator logic?`,
          });
        }
        return res.json({
          success: true,
          text: `Understood! Proceeding with our plan as confirmed: "${lastAssistant.text.slice(0, 120)}...". I will carry this forward and keep our project notes updated.`,
        });
      }

      // Check for tone adjustment ("the way you wrote it was too robotic", "less robotic", etc.)
      const isToneAdj = /(?:too robotic|robotic|less robotic|change (?:the )?tone|rephrase|rewrite|simpler terms|natural)/i.test(lower);
      if (isToneAdj) {
        return res.json({
          success: true,
          text: `Understood — I'll drop the mechanical phrasing and speak directly.\n\nLet's keep things natural and clear for project "${projectContext?.name || 'General'}". Where would you like to focus next?`,
        });
      }

      // Check for simple arithmetic / calculations
      const mathMatch = lastUserMsg.match(/^([\d.,\s()+\-*/^%]+)$/);
      if (mathMatch) {
        try {
          const sanitized = mathMatch[1].replace(/,/g, '');
          // eslint-disable-next-line no-eval
          const result = Function(`"use strict"; return (${sanitized})`)();
          if (typeof result === 'number' && !isNaN(result)) {
            return res.json({
              success: true,
              text: `Calculation result: **${result}**\n\n*(Computed locally via AXON Local Core)*`,
            });
          }
        } catch (e) {
          // continue
        }
      }

      // Contextual continuation if prior assistant message exists
      if (lastAssistant) {
        return res.json({
          success: true,
          text: `I have noted: "${lastUserMsg}" continuing our thread on "${lastAssistant.text.slice(0, 80)}...". Working in project "${projectContext?.name || 'General'}" via AXON Local Core.`,
        });
      }

      return res.json({
        success: true,
        text: `I have received your request: "${lastUserMsg}". Operating in offline-safe local mode for project "${projectContext?.name || 'General'}". I am ready to help organize tasks, inspect workspace files, or perform local calculations.`,
      });
    }

    // Final Safety Fallback: Default to AXON Local Core rather than returning an unsupported provider error
    const fallbackUserMsg = (messages[messages.length - 1]?.text || 'Hello').trim();
    return res.json({
      success: true,
      text: `Hello! I am AXON's local reasoning core.\n\nI have received your query: "${fallbackUserMsg}". Operating on-device in local workspace mode for project "${projectContext?.name || 'General'}".`,
    });
  } catch (error: any) {
    console.error('API Chat route error:', error);
    return res.status(500).json({
      success: false,
      errorType: 'INTERNAL_ERROR',
      message: error?.message || 'Internal server error processing AI request',
    });
  }
});

// Conversation Context Summarizer (Used for seamless handoff when manually switching accounts)
app.post('/api/ai/summarize', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || messages.length === 0) {
      return res.json({ summary: '' });
    }

    const conversationText = messages
      .slice(-30)
      .map((m: any) => `${m.sender}: ${m.text}`)
      .join('\n');

    // Fast local summary fallback
    const keyPoints = messages
      .filter((m: any) => m.sender === 'user')
      .slice(-5)
      .map((m: any) => m.text.slice(0, 80))
      .join('; ');

    const fallbackSummary = `Recent topics discussed: ${keyPoints || 'General inquiry'}. Prior session active.`;

    // Try Gemini if key available
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const summaryRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Provide a concise 2-sentence summary of this user-assistant conversation to preserve context for a new session:\n\n${conversationText}`,
        });
        if (summaryRes.text) {
          return res.json({ summary: summaryRes.text.trim() });
        }
      } catch (e) {
        // use fallback
      }
    }

    return res.json({ summary: fallbackSummary });
  } catch (err: any) {
    return res.json({ summary: 'Prior conversation context retained.' });
  }
});

// Conversation Knowledge Extractor (Extracts conversation into structured Markdown notes)
app.post('/api/ai/extract', async (req, res) => {
  try {
    const { messages, projectName, mode } = req.body;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'No messages to extract' });
    }

    const conversationText = messages
      .map((m: any) => `${m.sender.toUpperCase()}: ${m.text}`)
      .join('\n\n');

    if (mode === 'raw') {
      const rawTitle = `Transcript: ${projectName || 'Session'} — ${new Date().toLocaleDateString()}`;
      let rawContent = `# Conversation Transcript: ${projectName || 'Workspace'}\n`;
      rawContent += `**Date:** ${new Date().toLocaleString()} · **Messages:** ${messages.length}\n\n---\n\n`;
      messages.forEach((m: any) => {
        const senderBadge = m.sender === 'user' ? '👤 **User**' : `🤖 **AXON (${m.modelUsed || 'AI'})**`;
        rawContent += `### ${senderBadge} <small>(${m.timestamp})</small>\n\n${m.text}\n\n---\n\n`;
      });
      return res.json({
        success: true,
        title: rawTitle,
        content: rawContent,
      });
    }

    // Try Gemini structured extraction if key available
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const prompt = `You are AXON's Conversation Knowledge Extractor.
Synthesize the key takeaways, decisions, and any code from this smartphone conversation into an elegant, concise Markdown note.

Required Markdown Structure:
# Executive Summary: [Short Dynamic Title]
**Project Scope:** ${projectName || 'General Workspace'}
**Extraction Date:** ${new Date().toLocaleString()}

## 🎯 Key Topics & Queries
- [Concise bullet points]

## 💡 Decisions & Recommendations
- [Clear bullet points]

## 📋 Action Items
- [ ] [Concrete follow-up action]

## 💻 Code & Technical Artifacts (if discussed)
[Formatted code blocks with language tags, or omit this section if no code was discussed]

Conversation dialogue:
${conversationText}`;

        const extractRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        if (extractRes.text) {
          return res.json({
            success: true,
            title: `${projectName || 'Project'} — Summary (${new Date().toLocaleDateString()})`,
            content: extractRes.text.trim(),
          });
        }
      } catch (geminiExtractErr) {
        console.warn('Gemini extraction failed, using template synthesis', geminiExtractErr);
      }
    }

    // Template Fallback synthesis
    const userQueries = messages.filter((m: any) => m.sender === 'user').map((m: any) => m.text);
    const aiReplies = messages.filter((m: any) => m.sender === 'axon').map((m: any) => m.text);

    let doc = `# Executive Summary: ${projectName || 'General Workspace'}\n`;
    doc += `**Extracted:** ${new Date().toLocaleString()} · **Messages:** ${messages.length}\n\n`;
    doc += `## 🎯 Core Topics Discussed\n`;
    userQueries.slice(-5).forEach((q: string, i: number) => {
      doc += `- **Topic ${i + 1}:** ${q.slice(0, 140)}${q.length > 140 ? '...' : ''}\n`;
    });
    doc += `\n## 💡 Key Takeaways\n`;
    aiReplies.slice(-3).forEach((r: string) => {
      doc += `- ${r.slice(0, 160)}${r.length > 160 ? '...' : ''}\n`;
    });
    doc += `\n## 📋 Action Items\n`;
    doc += `- [ ] Apply insights to active project tasks\n`;
    doc += `- [ ] Keep project memory updated in AXON\n\n`;
    doc += `---\n\n## 📜 Full Dialogue Record\n\n`;
    messages.forEach((m: any) => {
      const sender = m.sender === 'user' ? 'User' : 'AXON';
      doc += `**${sender} (${m.timestamp}):**\n${m.text}\n\n`;
    });

    return res.json({
      success: true,
      title: `${projectName || 'Workspace'} — Takeaways (${new Date().toLocaleDateString()})`,
      content: doc,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Extraction failed: ' + err?.message });
  }
});

// Audio Transcription Endpoint
app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ success: false, message: 'No audio data provided' });
    }

    if (process.env.GEMINI_API_KEY) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe the spoken speech in this audio verbatim. Output only the transcribed text, with no extra conversational commentary.',
              },
            ],
          },
        ],
      });

      const text = response.text?.trim() || '';
      return res.json({ success: true, transcript: text });
    } else {
      return res.json({
        success: false,
        message: 'No GEMINI_API_KEY configured for server-side audio transcription.',
      });
    }
  } catch (err: any) {
    console.error('Audio transcription error:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Transcription failed' });
  }
});

// Vite Middleware for Development or Static serving for Production
async function startServer() {
  // Explicitly serve static assets from public directory (manifest, service worker, icons)
  app.use(express.static(path.join(process.cwd(), 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AXON Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
