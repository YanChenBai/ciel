import { describe, expect, it } from 'vite-plus/test';

import { EventEmitter, EventHost } from '../src/index.ts';

interface TestEvents {
  value(value: number): void;
}

describe('EventEmitter', () => {
  it('subscribes and unsubscribes listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const values: number[] = [];
    const unsubscribe = emitter.on('value', value => values.push(value));

    emitter.emit('value', 1);
    unsubscribe();
    emitter.emit('value', 2);

    expect(values).toEqual([1]);
  });

  it('supports once listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const values: number[] = [];
    emitter.once('value', value => values.push(value));

    emitter.emit('value', 1);
    emitter.emit('value', 2);

    expect(values).toEqual([1]);
  });

  it('awaits asynchronous listeners', async () => {
    const emitter = new EventEmitter<TestEvents>();
    const values: number[] = [];
    emitter.on('value', async value => {
      await Promise.resolve();
      values.push(value);
    });

    await emitter.emitAsync('value', 1);

    expect(values).toEqual([1]);
  });
});

describe('EventHost', () => {
  it('exposes subscription without exposing emit', () => {
    class Host extends EventHost<TestEvents> {
      publish(value: number): void {
        this.emit('value', value);
      }
    }

    const host = new Host();
    const values: number[] = [];
    host.on('value', value => values.push(value));
    host.publish(1);

    expect(values).toEqual([1]);
  });
});
