import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  let statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : 500);
  let message = err.message || 'An unexpected internal server error occurred.';

  if (err instanceof ZodError) {
    statusCode = 400;
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Smart business exception mapping
  if (statusCode === 500 && err.message) {
    const msg = err.message.toLowerCase();
    if (msg.includes('not found')) {
      statusCode = 404;
    } else if (msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('access restricted')) {
      statusCode = 403;
    } else if (msg.includes('conflict') || msg.includes('concurrency')) {
      statusCode = 409;
    } else if (
      msg.includes('required') ||
      msg.includes('cannot') ||
      msg.includes('invalid') ||
      msg.includes('must have') ||
      msg.includes('outdated') ||
      msg.includes('already finalized') ||
      msg.includes('already exists') ||
      msg.includes('agreement') ||
      msg.includes('does not have approval authority')
    ) {
      statusCode = 400;
    }
  }

  // Structured server logging
  if (statusCode >= 500) {
    console.error(`[SERVER ERROR] [${req.method} ${req.originalUrl}] [${statusCode}]:`, err.message || err);
    if (!isProduction && err.stack) {
      console.error(err.stack);
    }
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
