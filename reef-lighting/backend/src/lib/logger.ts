import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    // Never log credentials or tokens.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.newPassword',
      '*.wifiPassword',
      '*.refreshToken',
      '*.code',
    ],
    censor: '[REDACTED]',
  },
});
