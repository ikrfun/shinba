// Keep writes in order and retain the latest edit when an earlier write fails.
export function createAutosave(write, onStatus, delay = 700) {
  let pending = null;
  let timer = null;
  let running = null;
  let error = null;
  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (running) await running;
    if (!pending) return;
    const value = pending;
    pending = null;
    onStatus("saving");
    running = (async () => {
      try {
        await write(value);
        error = null;
      } catch (e) {
        pending ??= value;
        error = e;
        throw e;
      }
    })();
    try {
      await running;
    } finally {
      running = null;
      onStatus(error ? "error" : pending ? "pending" : "saved", error);
    }
    if (pending) return flush();
  }
  return {
    schedule(value) {
      pending = value;
      error = null;
      clearTimeout(timer);
      onStatus("pending");
      timer = setTimeout(() => {
        flush().catch(() => {});
      }, delay);
    },
    flush,
    hasChanges: () => Boolean(pending || running || error),
  };
}
