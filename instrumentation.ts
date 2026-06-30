export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./src/db/index');
    runMigrations();

    const { pingAllTargets } = await import('./src/lib/pinger');
    await pingAllTargets();
    setInterval(pingAllTargets, 30_000);
  }
}
