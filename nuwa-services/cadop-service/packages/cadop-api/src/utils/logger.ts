import winston from 'winston';

// Create logger instance
export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'cadop-service' },
  transports: [
    new winston.transports.Console({
      format:
        process.env['NODE_ENV'] !== 'production'
          ? winston.format.combine(winston.format.colorize(), winston.format.simple())
          : winston.format.simple(),
    }),
  ],
});
