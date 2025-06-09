import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger.js';

/**
 * Middleware to validate request body against a Zod schema
 */
export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      logger.debug('Validating request body', {
        path: req.path,
        method: req.method,
        body: req.body,
        schema: schema.description || 'No schema description',
      });

      // Validate the request body
      req.body = schema.parse(req.body);

      logger.debug('Request body validation successful', {
        path: req.path,
        method: req.method,
        validatedBody: req.body,
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request body validation failed', {
          path: req.path,
          method: req.method,
          body: req.body,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });

        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }
      
      // Handle other validation errors
      logger.error('Unexpected validation error', {
        path: req.path,
        method: req.method,
        body: req.body,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(400).json({
        error: 'Validation failed',
        message: error instanceof Error ? error.message : 'Invalid request data',
      });
    }
  };
};

/**
 * Middleware to validate request parameters against a Zod schema
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      logger.debug('Validating request parameters', {
        path: req.path,
        method: req.method,
        params: req.params,
        schema: schema.description || 'No schema description',
      });

      req.params = schema.parse(req.params);

      logger.debug('Request parameters validation successful', {
        path: req.path,
        method: req.method,
        validatedParams: req.params,
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request parameters validation failed', {
          path: req.path,
          method: req.method,
          params: req.params,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });

        res.status(400).json({
          error: 'Parameter validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }
      
      logger.error('Unexpected parameter validation error', {
        path: req.path,
        method: req.method,
        params: req.params,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(400).json({
        error: 'Parameter validation failed',
        message: error instanceof Error ? error.message : 'Invalid request parameters',
      });
    }
  };
};

/**
 * Middleware to validate request query parameters against a Zod schema
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      logger.debug('Validating request query', {
        path: req.path,
        method: req.method,
        query: req.query,
        schema: schema.description || 'No schema description',
      });

      req.query = schema.parse(req.query);

      logger.debug('Request query validation successful', {
        path: req.path,
        method: req.method,
        validatedQuery: req.query,
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request query validation failed', {
          path: req.path,
          method: req.method,
          query: req.query,
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });

        res.status(400).json({
          error: 'Query validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }
      
      logger.error('Unexpected query validation error', {
        path: req.path,
        method: req.method,
        query: req.query,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(400).json({
        error: 'Query validation failed',
        message: error instanceof Error ? error.message : 'Invalid query parameters',
      });
    }
  };
}; 