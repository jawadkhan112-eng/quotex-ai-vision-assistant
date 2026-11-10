import { describe, it, expect } from 'vitest';
import { safeFetch, ApiError } from '../src/apiClient';

describe('Safe API Client Tests', () => {
  it('throws ApiError with clean message on network failure', async () => {
    await expect(safeFetch('http://localhost:9999/unreachable')).rejects.toThrow();
  });

  it('ApiError preserves status code and HTML flags', () => {
    const err = new ApiError('A server error occurred...', 500, true);
    expect(err.statusCode).toBe(500);
    expect(err.isHtmlError).toBe(true);
    expect(err.message).toBe('A server error occurred...');
  });
});
