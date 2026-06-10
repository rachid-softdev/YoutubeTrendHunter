/**
 * Shared API response types.
 *
 * Canonical source for PaginatedResponse<T> and ApiError.
 */

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
