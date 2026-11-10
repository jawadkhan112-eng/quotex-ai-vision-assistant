/**
 * Robust, production-grade API Client for Quotex AI Vision Assistant.
 * 
 * Features:
 * - Never blindly calls response.json() on unknown or failing HTTP responses
 * - Inspects Content-Type, HTTP status, and response bodies
 * - Handles unexpected HTML/plain-text Vercel error pages (e.g. 504, 502, 404, "A server error...")
 * - Formats meaningful, structured errors with status codes and request tracking
 * - Automatic timeout support
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  isHtmlError?: boolean;
}

export class ApiError extends Error {
  statusCode: number;
  isHtmlError: boolean;
  details?: any;

  constructor(message: string, statusCode: number, isHtmlError = false, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isHtmlError = isHtmlError;
    this.details = details;
  }
}

export async function safeFetch<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    // Check if response is HTML or plain text error page
    const isJson = contentType.includes('application/json');

    let parsedData: any = null;

    if (isJson && rawText.trim().length > 0) {
      try {
        parsedData = JSON.parse(rawText);
      } catch (parseErr) {
        console.warn(`[ApiClient] Failed to parse expected JSON from ${url}:`, rawText.slice(0, 150));
        throw new ApiError(
          `Server returned malformed response (${response.status})`,
          response.status,
          false
        );
      }
    } else {
      // Non-JSON response (e.g. Vercel 500/504 HTML error page, "A server error occurred...")
      if (!response.ok) {
        let cleanMessage = 'Server error occurred during request';
        if (rawText.includes('A server error') || rawText.includes('FUNCTION_INVOCATION_FAILED')) {
          cleanMessage = 'Vercel Serverless Function encountered an error. Backend is initializing or temporarily unavailable.';
        } else if (response.status === 504) {
          cleanMessage = 'Server Gateway Timeout (504): The request took too long to complete.';
        } else if (response.status === 404) {
          cleanMessage = `API endpoint not found (404): ${url}`;
        } else if (rawText.length > 0 && rawText.length < 200) {
          cleanMessage = rawText.replace(/<[^>]*>?/gm, '').trim();
        }

        throw new ApiError(cleanMessage, response.status, true);
      }
    }

    if (!response.ok) {
      const errorMessage = parsedData?.error || parsedData?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new ApiError(errorMessage, response.status, false, parsedData);
    }

    return parsedData as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs / 1000}s. Please check your connection and retry.`, 408);
    }
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err.message || 'Network request failed. Please check backend connection.', 0);
  } finally {
    clearTimeout(id);
  }
}
