import { Database } from '@nozbe/watermelondb';
import { createDatabase, databaseName } from '../database';
import { databaseVersion } from '../schema';

describe('database scaffold', () => {
  it('creates a WatermelonDB database with the app schema', () => {
    const database = createDatabase();

    expect(database).toBeInstanceOf(Database);
    expect(database.schema.version).toBe(databaseVersion);
    expect(databaseName).toBe('eaz_community');
  });
});
