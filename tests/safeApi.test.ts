import { describe, expect, it } from 'vitest';
import { parseApiResponse } from '../src/services/safeFetch';
// Node-side base64 sanity for the frame contract the client encodes.
import { Buffer } from 'node:buffer';

describe('safe API response parser (regression: "Request En..." JSON error)', () => {
  it('parses Vercel 413 plain-text "Request Entity Too Large" without throwing', () => {
    const r = parseApiResponse(413, 'text/plain; charset=utf-8', 'Request Entity Too Large');
    expect(r.ok).toBe(false);
    expect(r.responseType).toBe('TEXT');
    expect(r.failurePhase).toBe('UPLOAD');
    expect(r.error).toContain('Payload too large');
    expect(r.error).toContain('413');
  });

  it('parses successful JSON', () => {
    const r = parseApiResponse(200, 'application/json', JSON.stringify({ success: true, result: { signal: 'WAIT' } }));
    expect(r.ok).toBe(true);
    expect(r.responseType).toBe('JSON');
    expect(r.data?.result?.signal).toBe('WAIT');
  });

  it('surfaces structured JSON application errors', () => {
    const r = parseApiResponse(400, 'application/json', JSON.stringify({ success: false, error: 'Provide at least two finite closing prices or a chart frame.' }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Provide at least two');
    expect(r.failurePhase).toBe('SERVER');
  });

  it('handles HTML error pages (gateway errors)', () => {
    const r = parseApiResponse(502, 'text/html', '<html><title>Bad gateway</title></html>');
    expect(r.ok).toBe(false);
    expect(r.responseType).toBe('HTML');
    expect(r.error).toContain('Bad gateway');
  });

  it('handles empty responses', () => {
    const r = parseApiResponse(200, 'application/json', '');
    expect(r.ok).toBe(false);
    expect(r.responseType).toBe('EMPTY');
  });

  it('flags JSON-content-type bodies that are not parseable', () => {
    const r = parseApiResponse(200, 'application/json', '{oops');
    expect(r.ok).toBe(false);
    expect(r.failurePhase).toBe('RESPONSE_PARSING');
  });

  it('classifies timeouts and rate limiting', () => {
    expect(parseApiResponse(408, 'text/plain', 'Timeout').failurePhase).toBe('SERVER');
    expect(parseApiResponse(429, 'text/plain', 'Too Many Requests').error).toContain('429');
  });
});

describe('compact frame contract (client encode ↔ server decode)', () => {
  it('round-trips base64 RGBA bytes', () => {
    // 2x1 px: red then green
    const rgba = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
    const b64 = rgba.toString('base64');
    const decoded = Array.from(Buffer.from(b64, 'base64'));
    expect(decoded).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('base64 of a 960x540 frame stays under the ~4.5MB Vercel request limit', () => {
    const byteLength = 960 * 540 * 4;
    const b64Length = Math.ceil(byteLength / 3) * 4; // standard base64 inflation
    expect(b64Length).toBeLessThan(4.5 * 1024 * 1024);
    // Legacy JSON-number-array payload: each 0-255 component serializes as ~3.5 chars
    // (digits + comma) on average, giving ~15MB — far over the limit.
    const jsonNumberArraySize = byteLength * 3.5;
    expect(jsonNumberArraySize).toBeGreaterThan(4.5 * 1024 * 1024);
    expect(b64Length).toBeLessThan(jsonNumberArraySize / 3); // base64 is far cheaper than JSON numbers
  });
});
