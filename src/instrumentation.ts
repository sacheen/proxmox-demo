export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    try {
      const { runMigrations } = await import('./db/index');
      runMigrations();
      const { pingAllTargets } = await import('./lib/pinger');
      await pingAllTargets();
      setInterval(pingAllTargets, 30_000);
    } catch (err) {
      console.error('[instrumentation] ping loop failed to start:', err);
    }
  }
}
