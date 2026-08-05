import { appSchema } from '@nozbe/watermelondb';

export const databaseVersion = 1;

export const schema = appSchema({
  version: databaseVersion,
  tables: [],
});
