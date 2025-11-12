/**
 * Secure Logger Utility
 * Automatically redacts sensitive data from logs to prevent security leaks
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

interface LogData {
  [key: string]: any;
}

// Sensitive fields that should never be logged
const REDACTED_FIELDS = new Set([
  'sessionID',
  'session',
  'cookie',
  'cookies',
  'authorization',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'stripeSecretKey',
  'clientSecret',
  'paymentMethod',
  'card',
]);

// Fields that should be hashed before logging
const HASH_FIELDS = new Set([
  'email',
  'phone',
  'phoneNumber',
]);

/**
 * Simple hash function for PII redaction (not cryptographic, just obfuscation)
 */
function hashPII(value: string): string {
  if (!value) return '[empty]';
  const length = value.length;
  const prefix = value.substring(0, Math.min(2, length));
  return `${prefix}***[${length} chars]`;
}

/**
 * Recursively sanitize an object, removing or redacting sensitive fields
 */
function sanitize(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item));
  }
  
  if (typeof data === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Redact sensitive fields
      if (REDACTED_FIELDS.has(key) || REDACTED_FIELDS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      
      // Hash PII fields
      if (HASH_FIELDS.has(key) || HASH_FIELDS.has(lowerKey)) {
        sanitized[key] = typeof value === 'string' ? hashPII(value) : value;
        continue;
      }
      
      // Recursively sanitize nested objects
      sanitized[key] = sanitize(value);
    }
    
    return sanitized;
  }
  
  return data;
}

/**
 * Format log message with timestamp and level
 */
function formatMessage(level: LogLevel, message: string, data?: LogData): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${level}][${timestamp}]`;
  
  if (!data || Object.keys(data).length === 0) {
    return `${prefix} ${message}`;
  }
  
  const sanitizedData = sanitize(data);
  return `${prefix} ${message} ${JSON.stringify(sanitizedData)}`;
}

/**
 * Secure logging functions
 */
export const secureLog = {
  info(message: string, data?: LogData) {
    console.log(formatMessage('INFO', message, data));
  },
  
  warn(message: string, data?: LogData) {
    console.warn(formatMessage('WARN', message, data));
  },
  
  error(message: string, error?: Error | LogData, data?: LogData) {
    // Handle both error objects and data objects
    if (error instanceof Error) {
      const errorData = {
        message: error.message,
        stack: error.stack,
        ...data,
      };
      console.error(formatMessage('ERROR', message, errorData));
    } else {
      console.error(formatMessage('ERROR', message, error));
    }
  },
  
  success(message: string, data?: LogData) {
    console.log(formatMessage('SUCCESS', message, data));
  },
};

/**
 * Safe user context for logging (only non-sensitive fields)
 */
export function safeUserContext(user: any) {
  if (!user) return null;
  
  return {
    userId: user.id,
    userType: user.type,
    approved: user.approved,
    status: user.status,
  };
}
