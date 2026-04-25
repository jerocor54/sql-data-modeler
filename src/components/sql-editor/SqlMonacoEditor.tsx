import { Editor, loader, type OnMount } from '@monaco-editor/react';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { ThemeMode } from '../../types/erd';
import { defineEditorThemes, getEditorTheme } from './monacoTheme';

export type MonacoEditorInstance = Parameters<OnMount>[0];
export type MonacoInstance = Parameters<OnMount>[1];

let monacoRuntimePromise: Promise<void> | null = null;

export async function ensureSqlMonacoRuntime(): Promise<void> {
  monacoRuntimePromise ??= (async () => {
    self.MonacoEnvironment = {
      getWorker() {
        return new editorWorker();
      },
    };

    const monaco = await import('monaco-editor');
    defineEditorThemes(monaco);
    loader.config({ monaco });
  })();

  return monacoRuntimePromise;
}

interface SqlMonacoEditorProps {
  sqlText: string;
  resolvedTheme: ThemeMode;
  onSqlChange: (value: string) => void;
  onEditorMount: OnMount;
}

export default function SqlMonacoEditor({
  sqlText,
  resolvedTheme,
  onSqlChange,
  onEditorMount,
}: SqlMonacoEditorProps) {
  return (
    <Editor
      height="100%"
      defaultLanguage="sql"
      language="sql"
      value={sqlText}
      loading={<div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Cargando editor…</div>}
      onChange={(value) => onSqlChange(value ?? '')}
      beforeMount={defineEditorThemes}
      onMount={onEditorMount}
      theme={getEditorTheme(resolvedTheme)}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        roundedSelection: false,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'JetBrains Mono, Fira Code, Menlo, Consolas, monospace',
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'off',
        smoothScrolling: true,
        find: {
          addExtraSpaceOnTop: false,
          autoFindInSelection: 'never',
          seedSearchStringFromSelection: 'always',
          loop: true,
        },
      }}
    />
  );
}
