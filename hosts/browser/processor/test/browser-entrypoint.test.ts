import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

describe('Processor browser entrypoint', () => {
  it('owns browser effects and delegates Experience construction through generated topology', () => {
    expect(source.match(/\bstartProcessorBrowserHost\s*\(/g)).toHaveLength(1);
    expect(source).toContain("rootId: 'root'");
    expect(source).toContain('strictMode: true');
    expect(source).toContain('createProcessorBrowserApplication');
    expect(source).toContain('@pressly/generated-runtime/browser/processor');
    expect(source).not.toContain('@pressly/experience-');
    expect(source).not.toMatch(/@pressly\/.*-system/);
    expect(source).not.toContain("from 'react-dom/client'");
    expect(source).not.toMatch(/\bcreateRoot\s*\(/);
  });

  it('injects browser lifecycle values and disposes the mounted root for HMR', () => {
    for (const effect of [
      'document,',
      'history: window.history',
      'location: window.location',
      'storage: window.localStorage',
      'events: window',
    ])
      expect(source).toContain(effect);

    expect(source).toContain('import.meta.hot.dispose(lifecycle.dispose)');
  });
});
