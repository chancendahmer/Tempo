/** Serializes heartbeat writes and joins an in-flight write before retirement. */
export function createHeartbeatLifecycle(write: () => Promise<void>) {
  let stopping = false;
  let pending: Promise<void> | null = null;
  return {
    pulse() {
      if (stopping) return Promise.resolve();
      pending ??= Promise.resolve().then(write).finally(() => { pending = null; });
      return pending;
    },
    async stop() {
      stopping = true;
      await pending;
    },
  };
}
