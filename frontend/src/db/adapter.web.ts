import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import type { AppSchema } from '@nozbe/watermelondb';

export function createAdapter(databaseName: string, schema: AppSchema): LokiJSAdapter {
  return new LokiJSAdapter({
    dbName: databaseName,
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  });
}
