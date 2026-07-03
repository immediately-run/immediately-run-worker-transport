# @immediately-run/worker-transport

The same-origin **worker MessagePort transport** for immediately.run: the
`WorkerMessageBus` request/response protocol and the one-time `{ type: 'connect' }`
MessagePort handshake, extracted into a leaf package so a **worker-owning service
package** can ship its own worker entry without depending on `sandbox`.

## Why a dedicated leaf package (not the SDK)

The transport is imported by the worker-owning packages (today
`@immediately-run/transpiler`'s Babel worker; later the `tsc`/`eslint`/`prettier`
authoring services per R3-107) **and** by `sandbox`. Routing it through the SDK would
pull the *host* (`immediately-run-site-main`) into a build dependency on the app-facing
client library — which the host↔SDK design deliberately avoids (the SDK is fetched at
runtime, never a host build input; `SDK_PACKAGING_SPEC §5`). A leaf package keeps the
transport entanglement-free. See `SIMPLIFIED_DEPLOYMENT_SPEC §14` / roadmap **R3-149**.

## API

- `WorkerMessageBus` — the channel-scoped request/response bus over any
  `MessageEndpoint` (a `Worker`, a `MessagePort`, or `self` in a worker).
- `bindWorkerMessageBus(self, opts)` — installs the `{ type: 'connect' }` handshake on a
  worker's `self`: waits for the parent to transfer a `MessagePort`, starts it, and binds
  a `WorkerMessageBus` on it. This is the exact handshake sandbox's `babel-worker.ts` used,
  generalized so every worker entry installs it identically.

```ts
import { bindWorkerMessageBus } from '@immediately-run/worker-transport';

bindWorkerMessageBus(self, {
  channel: 'sandpack-babel',
  handleRequest: (method, data) =>
    method === 'transform' ? doTransform(data) : Promise.reject(new Error('Unknown method')),
});
```

## Runtime topology

The worker is spawned by the **parent page** (not the sandboxed iframe) so the iframe can
drop `allow-same-origin`. The parent transfers a `MessagePort` entangled with one handed
into the iframe, so transform requests flow directly between the iframe and the worker
(the MessagePort identity rule, `HOST_ORIGIN_HARDENING_SPEC §2.4`). This package only owns
the wire protocol; where the bytes are served from is the consumer's concern.
