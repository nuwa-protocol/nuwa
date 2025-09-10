import winston from 'winston';

export interface LoggerConfig {
  level?: string;
  format?: 'json' | 'simple';
  silent?: boolean;
}

export class Logger {
  private static instance: Logger;
  public winston: winston.Logger;

  private constructor(config: LoggerConfig = {}) {
    const level = config.level || process.env.LOG_LEVEL || 'info';
    const format = config.format || 'simple';
    const silent = config.silent || false;

    const logFormat = format === 'json' 
      ? winston.format.json()
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        );

    this.winston = winston.createLogger({
      level,
      format: logFormat,
      transports: [
        new winston.transports.Console({
          silent
        })
      ]
    });
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, meta);
  }

  child(meta: any): Logger {
    const childLogger = new Logger();
    childLogger.winston = this.winston.child(meta);
    return childLogger;
  }
}

export const logger = Logger.getInstance();
