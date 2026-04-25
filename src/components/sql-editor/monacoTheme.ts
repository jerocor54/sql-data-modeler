import type { OnMount } from '@monaco-editor/react';
import type { ThemeMode } from '../../types/erd';

type MonacoInstance = Parameters<OnMount>[1];

export function getEditorTheme(theme: ThemeMode): string {
  if (theme === 'light') return 'vs';
  if (theme === 'dark') return 'vs-dark';
  return 'sql-deepblue';
}

export function defineEditorThemes(monaco: MonacoInstance) {
  monaco.editor.defineTheme('sql-deepblue', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '58A6FF' },
      { token: 'number', foreground: '79C0FF' },
      { token: 'string', foreground: 'A5D6FF' },
      { token: 'comment', foreground: '7D97C6' },
    ],
    colors: {
      'editor.background': '#0C1636',
      'editor.foreground': '#D8E7FF',
      'editorLineNumber.foreground': '#6B89BF',
      'editorLineNumber.activeForeground': '#9FC2FF',
      'editor.selectionBackground': '#2F64D966',
      'editor.inactiveSelectionBackground': '#2F64D944',
      'editorCursor.foreground': '#9BC3FF',
      'editor.findMatchBackground': '#f59e0b55',
      'editor.findMatchHighlightBackground': '#f59e0b33',
    },
  });
}
