import { Database } from '@nozbe/watermelondb';
import { createAdapter } from './adapter';
import { schema } from './schema';

export const databaseName = 'eaz_community';

export function createDatabase(): Database {
  return new Database({ adapter: createAdapter(databaseName, schema), modelClasses: [] });
}

let database: Database | undefined;

export function getDatabase(): Database {
  if (!database) {
    database = createDatabase();
  }
  return database;
}
