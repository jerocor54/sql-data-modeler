export function downloadTextFile(fileName: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(fileName: string, dataUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}

export function getCursorIndexForLine(text: string, targetLine: number): number {
  if (targetLine <= 1) return 0;
  const lines = text.split('\n');
  let index = 0;

  for (let i = 0; i < Math.min(targetLine - 1, lines.length); i += 1) {
    index += lines[i].length + 1;
  }

  return index;
}
