export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function apiResponse<T>(data: T, meta?: PaginationMeta) {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function apiCreated<T>(data: T) {
  return { success: true, data };
}
