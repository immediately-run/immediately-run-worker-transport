import {
  WorkerMessageBus,
  type RequestHandlerFn,
  type NotificationHandlerFn,
  type ErrorHandlerFn,
} from './WorkerMessageBus';

export interface BindWorkerMessageBusOpts {
  /** channel name — must match the main-thread bus (e.g. 'sandpack-babel') */
  channel: string;
  handleRequest: RequestHandlerFn;
  handleNotification?: NotificationHandlerFn;
  handleError?: ErrorHandlerFn;
  timeoutMs?: number;
}

// The one-time `{ type: 'connect' }` MessagePort handshake, extracted verbatim
// from sandbox's babel-worker.ts so every worker-owning package (transpiler's
// Babel worker, later the authoring services) installs it identically.
//
// This worker is created by the *parent* page (not the sandboxed iframe) so the
// iframe can drop `allow-same-origin`. The parent hands the worker a `MessagePort`
// entangled with one transferred into the iframe, so transform requests flow
// directly between the iframe and this worker without the parent relaying them.
// We wait for that one-time `{ type: 'connect' }` handshake, then talk over the
// transferred port instead of `self`.
export function bindWorkerMessageBus(
  self: {
    addEventListener(type: string, listener: (ev: any) => any): any;
    removeEventListener(type: string, listener: (ev: any) => any): any;
  },
  opts: BindWorkerMessageBusOpts,
): void {
  const {
    channel,
    handleRequest,
    handleNotification = () => Promise.resolve(),
    handleError = () => Promise.resolve(),
    timeoutMs = 30000,
  } = opts;

  self.addEventListener('message', function onConnect(evt: MessageEvent) {
    if (evt.data && evt.data.type === 'connect') {
      const port = evt.ports && evt.ports[0];
      if (port) {
        self.removeEventListener('message', onConnect);
        port.start();
        new WorkerMessageBus({
          channel,
          endpoint: port,
          handleRequest,
          handleNotification,
          handleError,
          timeoutMs,
        });
      }
    }
  });
}
