import { describe, expect, it } from 'vite-plus/test';

import { Script } from '#signals';

import { Lectio } from './lectio.ts';

class TestScript extends Script.WithMeta({
  name: 'Test text',
  description: 'Synthetic text used by Lectio tests',
}) {}

class OtherScript extends Script.WithMeta({
  name: 'Other text',
  description: 'A different text signal',
}) {}

describe('Lectio', () => {
  it('requires a signal created with metadata', () => {
    expect(() => new Lectio(Script)).toThrow('Script must define non-empty context meta');
  });

  it('aligns Script as Reading with its signal metadata', () => {
    const lectio = new Lectio(TestScript);
    const results: import('#percepts').Reading[] = [];
    lectio.on('data', reading => results.push(reading));

    const timestamp = new Date('2026-08-11T00:00:00.000Z');
    lectio.process(new TestScript({ content: 'hello', timestamp }));

    expect(results[0]).toMatchObject({
      content: 'hello',
      timestamp,
      originSignal: TestScript,
    });
  });

  it('rejects Script instances from a different signal', () => {
    const lectio = new Lectio(TestScript);
    const errors: Error[] = [];
    lectio.on('error', error => errors.push(error));

    lectio.process(new OtherScript({ content: 'hello', timestamp: new Date(0) }));

    expect(errors[0]?.message).toContain('bound signal');
  });
});
