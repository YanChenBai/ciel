import { describe, expect, it } from 'vite-plus/test';

import { EventEmitter, EventHost, toError } from '../src/index.ts';

interface TestEvents {
  value(value: number): void;
  message(value: string, urgent: boolean): void;
}

describe('toError', () => {
  it('preserves errors and converts other thrown values', () => {
    const error = new Error('failed');

    expect(toError(error)).toBe(error);
    expect(toError('failed')).toEqual(new Error('failed'));
  });
});

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

  it('supports event-named subscription and emission helpers', async () => {
    const emitter = new EventEmitter<TestEvents>();
    const values: number[] = [];
    emitter.$on.value(value => values.push(value));
    emitter.$once.value(value => values.push(value * 10));

    emitter.$emit.value(1);
    await emitter.$emitAsync.value(2);

    expect(values).toEqual([1, 10, 2]);
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

  it('removes all event listeners', () => {
    class Host extends EventHost<TestEvents> {
      publish(value: number): void {
        this.emit('value', value);
      }
    }

    const host = new Host();
    const values: number[] = [];
    host.on('value', value => values.push(value));
    host.clearAllEvents();
    host.publish(1);

    expect(values).toEqual([]);
  });

  it('subscribes through event-named helpers and returns an unsubscribe function', () => {
    class Host extends EventHost<TestEvents> {
      publish(value: number): void {
        this.emit('value', value);
      }
    }

    const host = new Host();
    const { $on } = host;
    const values: number[] = [];
    const unsubscribe = $on.value(value => values.push(value));

    host.publish(1);
    unsubscribe();
    host.publish(2);

    expect(values).toEqual([1]);
  });

  it('subscribes once through an event-named helper', () => {
    class Host extends EventHost<TestEvents> {
      publish(value: string, urgent: boolean): void {
        this.emit('message', value, urgent);
      }
    }

    const host = new Host();
    const messages: Array<[string, boolean]> = [];
    host.$once.message((value, urgent) => messages.push([value, urgent]));

    host.publish('first', true);
    host.publish('second', false);

    expect(messages).toEqual([['first', true]]);
  });

  it('emits through a protected event-named helper', () => {
    class Host extends EventHost<TestEvents> {
      publish(value: string, urgent: boolean): void {
        this.$emit.message(value, urgent);
      }
    }

    const host = new Host();
    const messages: Array<[string, boolean]> = [];
    host.$on.message((value, urgent) => messages.push([value, urgent]));

    host.publish('hello', true);

    expect(messages).toEqual([['hello', true]]);
  });

  it('awaits listeners through a protected event-named helper', async () => {
    class Host extends EventHost<TestEvents> {
      publish(value: number): Promise<void> {
        return this.$emitAsync.value(value);
      }
    }

    const host = new Host();
    const values: number[] = [];
    host.$on.value(async value => {
      await Promise.resolve();
      values.push(value);
    });

    await host.publish(1);

    expect(values).toEqual([1]);
  });

  it('inherits compatible events from another host', () => {
    class Child extends EventHost<TestEvents> {
      publish(value: number): void {
        this.emit('value', value);
      }
    }

    class Parent extends EventHost<TestEvents> {
      private readonly stopInheriting: () => void;

      constructor(child: Child) {
        super();
        this.stopInheriting = this.inheritEvents(child, 'value');
      }

      detach(): void {
        this.stopInheriting();
      }
    }

    const child = new Child();
    const parent = new Parent(child);
    const values: number[] = [];
    parent.on('value', value => values.push(value));

    child.publish(1);
    parent.detach();
    child.publish(2);

    expect(values).toEqual([1]);
  });
});
