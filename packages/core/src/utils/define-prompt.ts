export function definePrompt(...lines: string[]): string {
  return lines.join('\n').trim();
}
