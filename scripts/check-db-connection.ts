import {
  db,
  dbClient,
  ensureDatabaseReady,
  getDatabaseConnectionDiagnostics,
} from '@/lib/db/index';

async function main(): Promise<void> {
  try {
    await ensureDatabaseReady({
      label: 'db check',
    });

    const diagnostics = getDatabaseConnectionDiagnostics();
    const rows = await db.execute('select 1 as ok');

    console.log(
      JSON.stringify(
        {
          ok: true,
          active: diagnostics.active,
          fallbacks: diagnostics.fallbackSources,
          result: rows,
        },
        null,
        2
      )
    );
  } finally {
    await dbClient.end({ timeout: 0 });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db-check] ${message}`);
  process.exit(1);
});
