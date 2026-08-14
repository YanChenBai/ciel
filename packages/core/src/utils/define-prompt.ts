/**
 * 拼接提示词片段、移除首尾空行，并统一消除多行模板的公共缩进。
 */
export function definePrompt(...lines: string[]): string {
  const values = lines.join('\n').replaceAll('\r\n', '\n').split('\n');

  while (values[0]?.trim() === '') values.shift();
  while (values.at(-1)?.trim() === '') values.pop();

  const indentation = Math.min(
    ...values.filter(line => line.trim() !== '').map(line => line.match(/^\s*/)![0].length),
  );
  return values.map(line => line.slice(indentation)).join('\n');
}
