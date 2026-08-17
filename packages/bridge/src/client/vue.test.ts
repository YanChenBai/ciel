import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const onBeforeUnmount = vi.fn();
const disconnect = vi.fn();
const off = vi.fn();
const release = vi.fn();
let listener: ((message: unknown) => void) | undefined;

const client = {
  connect: vi.fn(),
  disconnect,
  onMessage: vi.fn((next: (message: unknown) => void) => {
    listener = next;
    return off;
  }),
  retain: vi.fn(() => {
    listener?.({ type: 'vigilia.bootstrap' });
    return release;
  }),
};

vi.mock('vue', () => ({ onBeforeUnmount }));
vi.mock('./client.ts', () => ({ createClient: vi.fn(() => client) }));

describe('createBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listener = undefined;
  });

  it('subscribes before connecting so the bootstrap message is not missed', async () => {
    const { createBridge } = await import('./vue.ts');
    const bridge = createBridge('http://localhost:3000');
    const receive = vi.fn();

    bridge.onMessage(receive);

    expect(client.onMessage).toHaveBeenCalledBefore(client.retain);
    expect(receive).toHaveBeenCalledWith({ type: 'vigilia.bootstrap' });
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('releases both the listener and connection on unmount', async () => {
    const { createBridge } = await import('./vue.ts');
    const bridge = createBridge('http://localhost:3000');

    const dispose = bridge.onMessage(vi.fn());
    dispose();

    expect(off).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});
