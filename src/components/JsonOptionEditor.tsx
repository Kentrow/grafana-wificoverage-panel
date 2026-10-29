import React, { useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Alert, CodeEditor } from '@grafana/ui';

export interface JsonEditorSettings {
  /** Returns the errors in a parsed value, empty when valid. */
  validate?: (value: unknown) => string[];
  height?: number;
}

const toText = (value: unknown) => (value === undefined ? '' : JSON.stringify(value, null, 2));

/** Edit an option as JSON. The value is stored as an object, so dashboard generators can write it directly. */
export const JsonOptionEditor = ({ value, onChange, item }: StandardEditorProps<unknown, JsonEditorSettings>) => {
  const [text, setText] = useState(() => toText(value));
  const [errors, setErrors] = useState<string[]>([]);
  const [shown, setShown] = useState(value);

  // The option changed elsewhere (undo, JSON model edit): show the new value.
  if (value !== shown) {
    setShown(value);
    setText(toText(value));
  }

  const commit = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setErrors([]);
      onChange(undefined);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(next);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Invalid JSON.']);
      return;
    }
    const problems = item.settings?.validate?.(parsed) ?? [];
    setErrors(problems);
    if (problems.length === 0) {
      onChange(parsed);
    }
  };

  return (
    <>
      <CodeEditor
        language="json"
        value={text}
        height={item.settings?.height ?? 200}
        showMiniMap={false}
        showLineNumbers={false}
        onBlur={commit}
      />
      {errors.length > 0 && (
        <Alert severity="error" title="Not applied">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Alert>
      )}
    </>
  );
};
