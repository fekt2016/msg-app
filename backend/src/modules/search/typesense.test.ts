import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => {
  const env = {
    TYPESENSE_ENABLED: false,
    TYPESENSE_URL: 'http://localhost:8108',
    TYPESENSE_API_KEY: 'dev-typesense-key',
  };
  return { env };
});

vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));

const { mockCollections, mockDocuments, mockHealth } = vi.hoisted(() => {
  const mockDocuments = {
    import: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
  };
  const mockCollection = {
    exists: vi.fn(),
    documents: vi.fn(() => mockDocuments),
  };
  const mockCollections = {
    create: vi.fn(),
    collection: vi.fn(() => mockCollection),
    individual: mockCollection,
  };
  const mockHealth = { retrieve: vi.fn() };
  return { mockCollections, mockDocuments, mockHealth };
});

vi.mock('typesense', () => ({
  Client: class {
    health = mockHealth;
    collections(name?: string) {
      return name === undefined ? { create: mockCollections.create } : mockCollections.individual;
    }
  },
}));

import { buildSearchProvider, searchProvider } from './typesense.js';

beforeEach(() => {
  vi.clearAllMocks();
  env.TYPESENSE_ENABLED = false;
  mockCollections.create.mockResolvedValue({});
  mockCollections.individual.exists.mockResolvedValue(false);
  mockDocuments.import.mockResolvedValue([]);
  mockDocuments.delete.mockResolvedValue({});
  mockDocuments.search.mockResolvedValue({ found: 0, out_of: 20, page: 1, hits: [] });
  mockHealth.retrieve.mockResolvedValue({ ok: true });
});

describe('searchProvider (dev fallback)', () => {
  it('falls back to the logging provider when Typesense is disabled', async () => {
    await expect(searchProvider.ping()).resolves.toBeUndefined();
    await expect(
      searchProvider.createCollection({ name: 'products', fields: [] }),
    ).resolves.toBeUndefined();
    await expect(
      searchProvider.upsertDocuments('products', [{ id: '1' }]),
    ).resolves.toBeUndefined();
    await expect(searchProvider.deleteDocument('products', '1')).resolves.toBeUndefined();
    await expect(searchProvider.search('products', { q: 'x', queryBy: 'name' })).resolves.toEqual({
      hits: [],
      found: 0,
      page: 1,
      perPage: 20,
    });
  });

  it('never touches the Typesense client when disabled', async () => {
    await searchProvider.search('products', { q: 'x', queryBy: 'name' });
    expect(mockDocuments.search).not.toHaveBeenCalled();
  });
});

describe('searchProvider (Typesense)', () => {
  beforeEach(() => {
    env.TYPESENSE_ENABLED = true;
  });

  it('pings health', async () => {
    const provider = buildSearchProvider();
    await provider.ping();
    expect(mockHealth.retrieve).toHaveBeenCalled();
  });

  it('creates a collection only if it does not exist', async () => {
    const provider = buildSearchProvider();
    mockCollections.individual.exists.mockResolvedValue(false);
    await provider.createCollection({
      name: 'products',
      defaultSortingField: 'createdAt',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'price', type: 'float', sort: true },
      ],
    });
    expect(mockCollections.create).toHaveBeenCalledWith({
      name: 'products',
      default_sorting_field: 'createdAt',
      fields: [
        { name: 'name', type: 'string', facet: undefined, sort: undefined, optional: undefined },
        { name: 'price', type: 'float', facet: undefined, sort: true, optional: undefined },
      ],
    });
  });

  it('skips creation when the collection already exists', async () => {
    const provider = buildSearchProvider();
    mockCollections.individual.exists.mockResolvedValue(true);
    await provider.createCollection({ name: 'products', fields: [] });
    expect(mockCollections.create).not.toHaveBeenCalled();
  });

  it('upserts documents with the upsert action', async () => {
    const provider = buildSearchProvider();
    mockDocuments.import.mockResolvedValue([{ success: true }]);
    await provider.upsertDocuments('products', [{ id: '1', name: 'Phone' }]);
    expect(mockDocuments.import).toHaveBeenCalledWith([{ id: '1', name: 'Phone' }], {
      action: 'upsert',
      batch_size: 200,
    });
  });

  it('skips the import when there are no documents', async () => {
    const provider = buildSearchProvider();
    await provider.upsertDocuments('products', []);
    expect(mockDocuments.import).not.toHaveBeenCalled();
  });

  it('throws SEARCH_UPSERT_FAILED when an import fails', async () => {
    const provider = buildSearchProvider();
    mockDocuments.import.mockResolvedValue([{ success: false, error: 'bad doc' }]);
    await expect(provider.upsertDocuments('products', [{ id: '1' }])).rejects.toMatchObject({
      code: 'SEARCH_UPSERT_FAILED',
      statusCode: 502,
    });
  });

  it('deletes a document by id', async () => {
    const provider = buildSearchProvider();
    await provider.deleteDocument('products', '1');
    expect(mockDocuments.delete).toHaveBeenCalled();
  });

  it('ignores a 404 when deleting', async () => {
    const provider = buildSearchProvider();
    mockDocuments.delete.mockRejectedValue({ httpStatus: 404 });
    await expect(provider.deleteDocument('products', 'missing')).resolves.toBeUndefined();
  });

  it('maps a search error to SEARCH_FAILED', async () => {
    const provider = buildSearchProvider();
    mockDocuments.search.mockRejectedValue(new Error('boom'));
    await expect(provider.search('products', { q: 'x', queryBy: 'name' })).rejects.toMatchObject({
      code: 'SEARCH_FAILED',
      statusCode: 502,
    });
  });

  it('returns normalized search results', async () => {
    const provider = buildSearchProvider();
    mockDocuments.search.mockResolvedValue({
      found: 1,
      out_of: 20,
      page: 1,
      hits: [{ document: { id: '1', name: 'Phone' } }],
    });
    const result = await provider.search('products', { q: 'phone', queryBy: 'name', perPage: 10 });
    expect(result).toEqual({
      hits: [{ document: { id: '1', name: 'Phone' } }],
      found: 1,
      page: 1,
      perPage: 10,
    });
    expect(mockDocuments.search).toHaveBeenCalledWith({
      q: 'phone',
      query_by: 'name',
      page: 1,
      per_page: 10,
    });
  });
});
