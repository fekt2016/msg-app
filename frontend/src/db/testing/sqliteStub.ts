import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import type { AppSchema } from '@nozbe/watermelondb';

export default class SQLiteStubAdapter extends LokiJSAdapter {
  constructor(options: { dbName: string; schema: AppSchema }) {
    super({
      ...options,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
    });
  }
}
