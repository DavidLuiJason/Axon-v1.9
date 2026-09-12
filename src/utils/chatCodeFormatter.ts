import { WorkspaceMode } from '../types';

/**
 * Checks if the user explicitly requested to see code printed directly in the chat interface.
 */
export function isExplicitCodeInChatRequested(userPrompt: string): boolean {
  if (!userPrompt || typeof userPrompt !== 'string') return false;
  const lower = userPrompt.toLowerCase();

  return (
    /show\s+(?:me\s+)?(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /print\s+(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /display\s+(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /paste\s+(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /put\s+(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /output\s+(?:the\s+)?code\s+(?:in|on|to|into|inside)\s+(?:the\s+)?chat/i.test(lower) ||
    /code\s+in\s+(?:the\s+)?chat/i.test(lower) ||
    /show\s+(?:me\s+)?(?:the\s+)?code\s+(?:here|in-line|inline)/i.test(lower) ||
    /print\s+(?:the\s+)?code\s+(?:here|in-line|inline)/i.test(lower) ||
    /display\s+(?:the\s+)?code\s+(?:here|in-line|inline)/i.test(lower) ||
    /show\s+(?:me\s+)?(?:the\s+)?full\s+code/i.test(lower) ||
    /show\s+(?:me\s+)?(?:the\s+)?source\s+code/i.test(lower) ||
    /let\s+me\s+see\s+(?:the\s+)?code/i.test(lower) ||
    /print\s+(?:out\s+)?(?:the\s+)?code/i.test(lower) ||
    /give\s+me\s+(?:the\s+)?raw\s+code/i.test(lower)
  );
}

export interface FormattedChatCodeResult {
  displayText: string;
  detectedCode: string | null;
  detectedLang: WorkspaceMode;
  hasBuildRunResult: boolean;
  showFullCodeInChat: boolean;
}

/**
 * Parses response text for code blocks, auto-loads the code for Workspace ingestion,
 * and strips large code blocks from the conversational chat response unless explicitly requested.
 */
export function formatChatCodeResponse(
  rawText: string,
  userPrompt: string
): FormattedChatCodeResult {
  if (!rawText || typeof rawText !== 'string') {
    return {
      displayText: '',
      detectedCode: null,
      detectedLang: 'javascript',
      hasBuildRunResult: false,
      showFullCodeInChat: false,
    };
  }

  // Check for fenced code block: ```lang\ncode```
  const codeMatch = rawText.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
  if (!codeMatch || !codeMatch[2].trim()) {
    return {
      displayText: rawText,
      detectedCode: null,
      detectedLang: 'javascript',
      hasBuildRunResult: false,
      showFullCodeInChat: false,
    };
  }

  const detectedCode = codeMatch[2].trim();
  const rawLang = (codeMatch[1] || 'javascript').toLowerCase();
  let detectedLang: WorkspaceMode = 'javascript';
  if (rawLang.includes('html') || detectedCode.includes('<html') || detectedCode.includes('<!DOCTYPE')) {
    detectedLang = 'html';
  } else if (rawLang.includes('json')) {
    detectedLang = 'json';
  }

  const wantsCodeInChat = isExplicitCodeInChatRequested(userPrompt);

  if (wantsCodeInChat) {
    return {
      displayText: rawText,
      detectedCode,
      detectedLang,
      hasBuildRunResult: true,
      showFullCodeInChat: true,
    };
  }

  // Strip large code blocks (>3 lines or >100 characters)
  const cleaned = rawText
    .replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (fullMatch, _lang, blockCode) => {
      const lines = blockCode.trim().split('\n');
      if (lines.length <= 3 && blockCode.trim().length <= 100) {
        // Keep tiny command/snippet
        return fullMatch;
      }
      return '';
    })
    // Remove dangling sentences introducing code
    .replace(/(?:here\s+is\s+(?:the\s+)?(?:code|implementation|script|component|file|snippet)[^:\n.]*[:.]?)/gi, '')
    .replace(/(?:below\s+is\s+(?:the\s+)?(?:code|implementation|script|component|file|snippet)[^:\n.]*[:.]?)/gi, '')
    .replace(/(?:i\s+have\s+provided\s+the\s+code\s+(?:below|here)[:.]?)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const displayText =
    cleaned.length > 5
      ? cleaned
      : `I have generated the ${
          detectedLang === 'html' ? 'HTML document' : detectedLang === 'json' ? 'JSON structure' : 'script'
        } and loaded it directly into the Workspace.`;

  return {
    displayText,
    detectedCode,
    detectedLang,
    hasBuildRunResult: true,
    showFullCodeInChat: false,
  };
}
