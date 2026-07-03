import { WorkerMessageBus, bindWorkerMessageBus, type MessageEndpoint } from '../src/index';

// A minimal in-memory MessagePort pair: two endpoints where each one's
// postMessage delivers a `{ data }` event to the other's 'message' listeners.
// Enough to exercise the request/response + connect-handshake protocol without a
// real Worker.
function makeEndpointPair(): [MessageEndpoint & { start(): void }, MessageEndpoint & { start(): void }] {
  const listeners: [Record<string, ((ev: any) => void)[]>, Record<string, ((ev: any) => void)[]>] = [
    { message: [], error: [] },
    { message: [], error: [] },
  ];
  const make = (self: 0 | 1): MessageEndpoint & { start(): void } => {
    const other = (self === 0 ? 1 : 0) as 0 | 1;
    return {
      postMessage(message: any) {
        // async delivery, like a real port
        setTimeout(() => {
          for (const l of listeners[other].message) l({ data: message });
        }, 0);
      },
      addEventListener(type: string, listener: (ev: any) => void) {
        (listeners[self][type] ||= []).push(listener);
      },
      removeEventListener(type: string, listener: (ev: any) => void) {
        const arr = listeners[self][type] || [];
        const i = arr.indexOf(listener);
        if (i >= 0) arr.splice(i, 1);
      },
      start() {
        /* no-op for the fake */
      },
    };
  };
  return [make(0), make(1)];
}

describe('WorkerMessageBus', () => {
  it('routes a request to the worker handler and resolves with its result', async () => {
    const [main, worker] = makeEndpointPair();

    // worker side
    new WorkerMessageBus({
      channel: 'sandpack-babel',
      endpoint: worker,
      handleRequest: (method, data) =>
        method === 'transform'
          ? Promise.resolve({ echoed: data })
          : Promise.reject(new Error('Unknown method')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 1000,
    });

    // main side
    const mainBus = new WorkerMessageBus({
      channel: 'sandpack-babel',
      endpoint: main,
      handleRequest: () => Promise.reject(new Error('main has no handler')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 1000,
    });

    const result = await mainBus.request('transform', { code: 'x' });
    expect(result).toEqual({ echoed: { code: 'x' } });
  });

  it('propagates a rejected handler as a rejected request with the error message', async () => {
    const [main, worker] = makeEndpointPair();
    new WorkerMessageBus({
      channel: 'c',
      endpoint: worker,
      handleRequest: () => Promise.reject(new Error('boom')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 1000,
    });
    const mainBus = new WorkerMessageBus({
      channel: 'c',
      endpoint: main,
      handleRequest: () => Promise.reject(new Error('n/a')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 1000,
    });
    await expect(mainBus.request('anything')).rejects.toThrow('boom');
  });

  it('times out a request that is never answered', async () => {
    const [main] = makeEndpointPair();
    const mainBus = new WorkerMessageBus({
      channel: 'c',
      endpoint: main,
      handleRequest: () => Promise.reject(new Error('n/a')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 20,
    });
    await expect(mainBus.request('never')).rejects.toThrow(/timed out/);
  });
});

describe('bindWorkerMessageBus (connect handshake)', () => {
  it('binds a bus only after the {type:"connect"} handshake and then serves requests over the port', async () => {
    // Fake worker `self`: collects listeners we can drive.
    const selfListeners: ((ev: any) => void)[] = [];
    const fakeSelf = {
      addEventListener: (_t: string, l: (ev: any) => void) => selfListeners.push(l),
      removeEventListener: (_t: string, l: (ev: any) => void) => {
        const i = selfListeners.indexOf(l);
        if (i >= 0) selfListeners.splice(i, 1);
      },
    };

    let served = false;
    bindWorkerMessageBus(fakeSelf, {
      channel: 'sandpack-babel',
      handleRequest: () => {
        served = true;
        return Promise.resolve('ok');
      },
    });

    // Before the handshake, the connect listener is registered but no bus exists.
    expect(selfListeners).toHaveLength(1);

    const [mainPort, workerPort] = makeEndpointPair();
    // Deliver the one-time connect message carrying the worker's port.
    for (const l of selfListeners.slice()) {
      l({ data: { type: 'connect' }, ports: [workerPort] });
    }
    // The connect listener removed itself after binding.
    expect(selfListeners).toHaveLength(0);

    const mainBus = new WorkerMessageBus({
      channel: 'sandpack-babel',
      endpoint: mainPort,
      handleRequest: () => Promise.reject(new Error('n/a')),
      handleNotification: () => Promise.resolve(),
      handleError: () => Promise.resolve(),
      timeoutMs: 1000,
    });
    const res = await mainBus.request('transform', {});
    expect(res).toBe('ok');
    expect(served).toBe(true);
  });
});
