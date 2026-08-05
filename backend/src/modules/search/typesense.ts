import type {
  Client,
  CollectionCreateSchema,
  FieldType,
  DocumentSchema,
  SearchResponse,
} from 'typesense';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../errors/AppError.js';

export interface SearchCollectionSchema {
  name: string;
  defaultSortingField?: string;
  fields: Array<{
    name: string;
    type: string;
    facet?: boolean;
    sort?: boolean;
    optional?: boolean;
  }>;
}

export interface SearchDocument {
  id: string;
  [key: string]: unknown;
}

export interface SearchQuery {
  q: string;
  queryBy: string;
  filterBy?: string;
  sortBy?: string;
  page?: number;
  perPage?: number;
}

export interface SearchResult {
  hits: Array<{ document: SearchDocument }>;
  found: number;
  page: number;
  perPage: number;
}

export interface SearchProvider {
  ping(): Promise<void>;
  createCollection(schema: SearchCollectionSchema): Promise<void>;
  upsertDocuments(collection: string, documents: SearchDocument[]): Promise<void>;
  deleteDocument(collection: string, id: string): Promise<void>;
  search(collection: string, query: SearchQuery): Promise<SearchResult>;
}

interface TypesenseModule {
  Client: typeof Client;
}

function toCollectionSchema(schema: SearchCollectionSchema): CollectionCreateSchema {
  return {
    name: schema.name,
    default_sorting_field: schema.defaultSortingField,
    fields: schema.fields.map((field) => ({
      name: field.name,
      type: field.type as FieldType,
      facet: field.facet,
      sort: field.sort,
      optional: field.optional,
    })),
  };
}

function toAppError(code: string, message: string, error: unknown): AppError {
  return new AppError(502, code, message, {
    details: [error instanceof Error ? error.message : 'unknown error'],
  });
}

/**
 * Real Typesense provider. The client is lazily imported so the dependency
 * stays out of code paths that never index or search (mirrors the OTP and
 * media storage providers).
 */
class TypesenseProvider implements SearchProvider {
  private async client(): Promise<Client> {
    const { Client: TypesenseClient } = (await import('typesense')) as unknown as TypesenseModule;
    const url = new URL(env.TYPESENSE_URL);
    return new TypesenseClient({
      apiKey: env.TYPESENSE_API_KEY,
      nodes: [
        {
          host: url.hostname,
          port: Number(url.port || 8108),
          protocol: url.protocol.replace(':', ''),
        },
      ],
      connectionTimeoutSeconds: 5,
    });
  }

  async ping(): Promise<void> {
    const client = await this.client();
    try {
      await client.health.retrieve();
    } catch (error) {
      throw toAppError('SEARCH_UNAVAILABLE', 'Typesense is not reachable', error);
    }
  }

  async createCollection(schema: SearchCollectionSchema): Promise<void> {
    const client = await this.client();
    try {
      const exists = await client.collections(schema.name).exists();
      if (!exists) {
        await client.collections().create(toCollectionSchema(schema));
      }
    } catch (error) {
      throw toAppError('SEARCH_COLLECTION_FAILED', 'Failed to prepare search collection', error);
    }
  }

  async upsertDocuments(collection: string, documents: SearchDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    const client = await this.client();
    try {
      const results = await client
        .collections(collection)
        .documents()
        .import(documents as Array<DocumentSchema>, { action: 'upsert', batch_size: 200 });
      const failures = (Array.isArray(results) ? results : []).filter((r) => !r.success);
      if (failures.length > 0) {
        throw new Error(
          `import failed for ${failures.length} of ${documents.length} documents: ${failures[0]?.error ?? 'unknown'}`,
        );
      }
    } catch (error) {
      throw toAppError('SEARCH_UPSERT_FAILED', 'Failed to index search documents', error);
    }
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    const client = await this.client();
    try {
      await client.collections(collection).documents(id).delete();
    } catch (error) {
      const status = (error as { httpStatus?: number }).httpStatus;
      if (status === 404) {
        return;
      }
      throw toAppError('SEARCH_DELETE_FAILED', 'Failed to remove search document', error);
    }
  }

  async search(collection: string, query: SearchQuery): Promise<SearchResult> {
    const client = await this.client();
    try {
      const response = (await client
        .collections(collection)
        .documents()
        .search({
          q: query.q,
          query_by: query.queryBy,
          ...(query.filterBy ? { filter_by: query.filterBy } : {}),
          ...(query.sortBy ? { sort_by: query.sortBy } : {}),
          page: query.page ?? 1,
          per_page: query.perPage ?? 20,
        })) as SearchResponse<SearchDocument>;
      return {
        hits: (response.hits ?? []).map((hit) => ({ document: hit.document })),
        found: response.found ?? 0,
        page: response.page ?? query.page ?? 1,
        perPage: query.perPage ?? 20,
      };
    } catch (error) {
      throw toAppError('SEARCH_FAILED', 'Search failed', error);
    }
  }
}

/**
 * Dev/test fallback used when search is disabled (mirrors the logging OTP and
 * media storage providers). Logs intended operations and returns empty results
 * so callers behave deterministically without a Typesense instance.
 */
class LoggingSearchProvider implements SearchProvider {
  async ping(): Promise<void> {
    logger.info('[SEARCH] Typesense disabled — ping skipped');
  }

  async createCollection(schema: SearchCollectionSchema): Promise<void> {
    logger.info(
      { collection: schema.name },
      '[SEARCH] Collection create skipped — Typesense disabled',
    );
  }

  async upsertDocuments(collection: string, documents: SearchDocument[]): Promise<void> {
    logger.info(
      { collection, count: documents.length },
      '[SEARCH] Index upsert skipped — Typesense disabled',
    );
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    logger.info({ collection, id }, '[SEARCH] Index delete skipped — Typesense disabled');
  }

  async search(): Promise<SearchResult> {
    logger.info('[SEARCH] Search skipped — Typesense disabled');
    return { hits: [], found: 0, page: 1, perPage: 20 };
  }
}

export function buildSearchProvider(): SearchProvider {
  if (env.TYPESENSE_ENABLED) {
    return new TypesenseProvider();
  }
  return new LoggingSearchProvider();
}

export const searchProvider: SearchProvider = buildSearchProvider();
