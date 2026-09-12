import { FormattedTraceback, WorkspaceMode } from '../types';

export function formatPyDroidTraceback(
  err: any,
  code: string,
  mode: WorkspaceMode
): FormattedTraceback {
  const fileName = mode === 'html' ? 'index.html' : mode === 'json' ? 'data.json' : 'script.js';
  const errName = err?.name || 'RuntimeError';
  const errMsg = err?.message || String(err || 'Unknown execution error');
  const stack = String(err?.stack || '');

  let lineNum: number | null = null;
  let colNum: number | null = null;

  // Extract line/column from stack traces
  // Matches <anonymous>:line:col, eval at <anonymous>:line:col, or script.js:line:col
  const stackMatch =
    stack.match(/(?:<anonymous>|eval|script\.js|Function):(\d+):(\d+)/i) ||
    stack.match(/<anonymous>:(\d+)/i) ||
    errMsg.match(/line\s*(\d+)/i);

  if (stackMatch) {
    const parsed = parseInt(stackMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      const lines = code.split('\n');
      lineNum = Math.min(parsed, lines.length);
      if (stackMatch[2]) {
        colNum = parseInt(stackMatch[2], 10) || null;
      }
    }
  }

  // Handle JSON parse error positions e.g. "at position 42"
  if (mode === 'json' && !lineNum) {
    const jsonPosMatch = errMsg.match(/position\s*(\d+)/i);
    if (jsonPosMatch) {
      const pos = parseInt(jsonPosMatch[1], 10);
      const linesBefore = code.substring(0, pos).split('\n');
      lineNum = linesBefore.length;
      colNum = linesBefore[linesBefore.length - 1].length + 1;
    }
  }

  const codeLines = code.split('\n');
  const offendingLine =
    lineNum !== null && lineNum <= codeLines.length && lineNum > 0
      ? codeLines[lineNum - 1].trim()
      : '';

  let fullTraceback = `Traceback (most recent call last):\n`;
  if (lineNum !== null) {
    fullTraceback += `  File "${fileName}", line ${lineNum}`;
    if (colNum !== null) fullTraceback += `, col ${colNum}`;
    fullTraceback += `, in <module>\n`;
    if (offendingLine) {
      fullTraceback += `    ${offendingLine}\n`;
    }
  } else {
    fullTraceback += `  File "${fileName}", in <module>\n`;
  }
  fullTraceback += `${errName}: ${errMsg}`;

  return {
    errorName: errName,
    errorMessage: errMsg,
    lineNumber: lineNum,
    columnNumber: colNum,
    fileName,
    codeSnippet: offendingLine,
    fullTraceback,
  };
}
