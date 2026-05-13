function formatControlChar(char: string): string {
  switch (char) {
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    case '\t':
      return '\\t';
    default: {
      const code = char.charCodeAt(0);
      return `\\x${code.toString(16).padStart(2, '0')}`;
    }
  }
}

/** Escape control characters so repo-controlled text cannot manipulate the terminal. */
export function sanitizeForTerminal(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, formatControlChar);
}
