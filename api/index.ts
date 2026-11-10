import type { Request, Response } from 'express';
import { app } from '../server.js';

/**
 * Vercel Serverless Function Handler
 * Wraps Express application to handle serverless requests and guarantees JSON responses.
 * Compatible with Vercel Node runtime without requiring optional @vercel/node types.
 */
export default async function handler(req: Request, res: Response) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Error]', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: err.message || 'Internal Serverless Execution Error',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
