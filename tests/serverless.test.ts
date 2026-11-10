import { describe, it, expect } from 'vitest';
import { app } from '../server';

describe('Vercel Serverless Handler & JSON API Error Routing Tests', () => {
  it('exports valid Express application function', () => {
    expect(typeof app).toBe('function');
  });

  it('handles /api/health with structured JSON and request ID', async () => {
    // Simulate express request using standard node mock / invocation
    let statusCode = 0;
    let headers: Record<string, string> = {};
    let responseBody: any = null;

    const mockReq = {
      method: 'GET',
      originalUrl: '/api/health',
      url: '/api/health',
      headers: {},
    } as any;

    const mockRes = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
      on: () => { },
    } as any;

    await new Promise<void>((resolve) => {
      mockRes.json = (data: any) => {
        responseBody = data;
        resolve();
        return mockRes;
      };
      app(mockReq, mockRes);
    });

    expect(responseBody).toBeDefined();
    expect(responseBody.status).toBe('OK');
    expect(responseBody.app).toBe('Quotex AI Vision Assistant');
    expect(responseBody.geminiKeyConfigured).toBe(true);
    expect(responseBody.activeProvider).toBe('gemini');
    expect(headers['x-request-id']).toBeDefined();
  });

  it('guarantees structured JSON on unrecognized /api/ 404 route instead of HTML error', async () => {
    let statusCode = 0;
    let responseBody: any = null;

    const mockReq = {
      method: 'GET',
      originalUrl: '/api/non-existent-route-xyz',
      url: '/api/non-existent-route-xyz',
      path: '/api/non-existent-route-xyz',
      headers: {},
    } as any;

    const mockRes = {
      setHeader: () => { },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
      on: () => { },
    } as any;

    await new Promise<void>((resolve) => {
      mockRes.json = (data: any) => {
        responseBody = data;
        resolve();
        return mockRes;
      };
      app(mockReq, mockRes);
    });

    expect(statusCode).toBe(404);
    expect(responseBody).toBeDefined();
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toContain('API route not found');
  });

  it('returns 400 error when /api/analyze-vision receives no image', async () => {
    let statusCode = 0;
    let responseBody: any = null;

    const mockReq = {
      method: 'POST',
      originalUrl: '/api/analyze-vision',
      url: '/api/analyze-vision',
      headers: {},
      body: {},
    } as any;

    const mockRes = {
      setHeader: () => { },
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        responseBody = data;
        return mockRes;
      },
      on: () => { },
    } as any;

    await new Promise<void>((resolve) => {
      mockRes.json = (data: any) => {
        responseBody = data;
        resolve();
        return mockRes;
      };
      app(mockReq, mockRes);
    });

    expect(statusCode).toBe(400);
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toContain('No chart frame provided');
  });
});
