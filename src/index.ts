// @immediately-run/worker-transport — the leaf package that owns the same-origin
// worker MessagePort transport, so a worker-owning service package (the transpiler's
// Babel worker; later tsc/eslint/prettier per R3-107) can ship its own worker entry
// without depending on `sandbox`. A leaf package, NOT the SDK: routing the transport
// through the SDK would pull the *host* (immediately-run-site-main) into a build
// dependency on the app-facing client lib, which the host↔SDK design deliberately
// avoids (SDK_PACKAGING_SPEC §5). See SIMPLIFIED_DEPLOYMENT_SPEC §14 / R3-149.

export {
  WorkerMessageBus,
  type MessageEndpoint,
  type WorkerMessageBusOpts,
  type RequestHandlerFn,
  type NotificationHandlerFn,
  type ErrorHandlerFn,
  type PendingRequest,
} from './WorkerMessageBus';

export {
  bindWorkerMessageBus,
  type BindWorkerMessageBusOpts,
} from './connect';
