/**
 * Tests for Chat Error Handler
 */

import { parseError, getErrorTitle, getErrorClasses } from '../chatErrorHandler';

describe('chatErrorHandler', () => {
  describe('parseError', () => {
    it('should handle 401 authentication errors', () => {
      const mockResponse = {
        status: 401,
        headers: new Headers(),
      } as Response;

      const result = parseError(new Error('Unauthorized'), mockResponse);

      expect(result.type).toBe('auth');
      expect(result.message).toContain('session has expired');
    });

    it('should handle 429 rate limit errors with retry-after header', () => {
      const headers = new Headers();
      headers.set('Retry-After', '120');
      
      const mockResponse = {
        status: 429,
        headers,
      } as Response;

      const result = parseError(new Error('Too many requests'), mockResponse);

      expect(result.type).toBe('rate_limit');
      expect(result.retryAfter).toBe(120);
      expect(result.message).toContain('120 seconds');
    });

    it('should handle 429 rate limit errors without retry-after header', () => {
      const mockResponse = {
        status: 429,
        headers: new Headers(),
      } as Response;

      const result = parseError(new Error('Too many requests'), mockResponse);

      expect(result.type).toBe('rate_limit');
      expect(result.retryAfter).toBe(60); // Default
    });

    it('should handle timeout errors', () => {
      const error = new Error('Request timeout after 30 seconds');
      const result = parseError(error);

      expect(result.type).toBe('timeout');
      expect(result.message).toContain('took too long');
    });

    it('should handle clarification requests', () => {
      const error = new Error('Please clarify which bank you are referring to');
      const result = parseError(error);

      expect(result.type).toBe('clarification');
      expect(result.message).toBe(error.message);
    });

    it('should sanitize SQL error messages', () => {
      const error = new Error('SQL error: SELECT * FROM users WHERE id = 1');
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message).not.toContain('SQL');
      expect(result.message).toContain('error occurred');
    });

    it('should sanitize stack trace messages', () => {
      const error = new Error('Error at Object.method (file.js:123)');
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message).not.toContain('at Object');
      expect(result.message).toContain('error occurred');
    });

    it('should sanitize database error messages', () => {
      const error = new Error('Database connection failed: ECONNREFUSED');
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message).not.toContain('Database');
      expect(result.message).toContain('error occurred');
    });

    it('should sanitize internal error messages', () => {
      const error = new Error('Internal server error: undefined reference');
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message).not.toContain('Internal');
      expect(result.message).not.toContain('undefined');
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(300);
      const error = new Error(longMessage);
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message.length).toBeLessThan(200);
      expect(result.message).toContain('error occurred');
    });

    it('should pass through user-friendly error messages', () => {
      const error = new Error('No data found for the specified date range');
      const result = parseError(error);

      expect(result.type).toBe('general');
      expect(result.message).toBe(error.message);
    });

    it('should handle unknown error types', () => {
      const result = parseError('string error');

      expect(result.type).toBe('general');
      expect(result.message).toContain('unexpected error');
    });
  });

  describe('getErrorTitle', () => {
    it('should return correct title for rate_limit', () => {
      expect(getErrorTitle('rate_limit')).toContain('Rate Limit');
    });

    it('should return correct title for auth', () => {
      expect(getErrorTitle('auth')).toContain('Authentication');
    });

    it('should return correct title for timeout', () => {
      expect(getErrorTitle('timeout')).toContain('Timeout');
    });

    it('should return correct title for clarification', () => {
      expect(getErrorTitle('clarification')).toContain('More Information');
    });

    it('should return correct title for general', () => {
      expect(getErrorTitle('general')).toContain('Error');
    });

    it('should return default title for null', () => {
      expect(getErrorTitle(null)).toContain('Error');
    });
  });

  describe('getErrorClasses', () => {
    it('should return orange classes for rate_limit', () => {
      const classes = getErrorClasses('rate_limit');
      expect(classes.container).toContain('orange');
      expect(classes.title).toContain('orange');
      expect(classes.message).toContain('orange');
    });

    it('should return red classes for auth', () => {
      const classes = getErrorClasses('auth');
      expect(classes.container).toContain('red');
      expect(classes.title).toContain('red');
      expect(classes.message).toContain('red');
    });

    it('should return yellow classes for timeout', () => {
      const classes = getErrorClasses('timeout');
      expect(classes.container).toContain('yellow');
      expect(classes.title).toContain('yellow');
      expect(classes.message).toContain('yellow');
    });

    it('should return blue classes for clarification', () => {
      const classes = getErrorClasses('clarification');
      expect(classes.container).toContain('blue');
      expect(classes.title).toContain('blue');
      expect(classes.message).toContain('blue');
    });

    it('should return destructive classes for general', () => {
      const classes = getErrorClasses('general');
      expect(classes.container).toContain('destructive');
      expect(classes.title).toContain('destructive');
      expect(classes.message).toContain('destructive');
    });

    it('should return destructive classes for null', () => {
      const classes = getErrorClasses(null);
      expect(classes.container).toContain('destructive');
    });
  });
});
