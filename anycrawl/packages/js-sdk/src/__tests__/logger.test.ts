import { jest } from '@jest/globals';
import { Logger, LogLevel } from '../logger.js';

describe('Logger', () => {
    let testLogger: Logger;
    let consoleSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        testLogger = new Logger(LogLevel.DEBUG);
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('constructor', () => {
        it('should initialize with default log level', () => {
            const defaultLogger = new Logger();
            expect(defaultLogger).toBeInstanceOf(Logger);
        });

        it('should initialize with specified log level', () => {
            const warnLogger = new Logger(LogLevel.WARN);
            expect(warnLogger).toBeInstanceOf(Logger);
        });
    });

    describe('shouldLog', () => {
        it('should log when current level is lower or equal to message level', () => {
            const debugLogger = new Logger(LogLevel.DEBUG);
            const infoLogger = new Logger(LogLevel.INFO);
            const warnLogger = new Logger(LogLevel.WARN);
            const errorLogger = new Logger(LogLevel.ERROR);

            // Debug level should log all
            debugLogger.debug('debug message');
            debugLogger.info('info message');
            debugLogger.warn('warn message');
            debugLogger.error('error message');
            expect(consoleSpy).toHaveBeenCalledTimes(4);

            consoleSpy.mockClear();

            // Info level should log info, warn, error
            infoLogger.debug('debug message');
            infoLogger.info('info message');
            infoLogger.warn('warn message');
            infoLogger.error('error message');
            expect(consoleSpy).toHaveBeenCalledTimes(3);

            consoleSpy.mockClear();

            // Warn level should log warn, error
            warnLogger.debug('debug message');
            warnLogger.info('info message');
            warnLogger.warn('warn message');
            warnLogger.error('error message');
            expect(consoleSpy).toHaveBeenCalledTimes(2);

            consoleSpy.mockClear();

            // Error level should log only error
            errorLogger.debug('debug message');
            errorLogger.info('info message');
            errorLogger.warn('warn message');
            errorLogger.error('error message');
            expect(consoleSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('debug', () => {
        it('should log debug messages when level is DEBUG', () => {
            testLogger.debug('Test debug message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG] Test debug message')
            );
        });

        it('should not log debug messages when level is higher', () => {
            const infoLogger = new Logger(LogLevel.INFO);
            infoLogger.debug('Test debug message');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should log debug messages with multiple arguments', () => {
            testLogger.debug('Debug message', { data: 'test' }, 123);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG] Debug message {"data":"test"} 123')
            );
        });
    });

    describe('info', () => {
        it('should log info messages', () => {
            testLogger.info('Test info message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Test info message')
            );
        });

        it('should not log info messages when level is higher', () => {
            const warnLogger = new Logger(LogLevel.WARN);
            warnLogger.info('Test info message');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should log info messages with multiple arguments', () => {
            testLogger.info('Info message', { data: 'test' }, 123);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Info message {"data":"test"} 123')
            );
        });
    });

    describe('warn', () => {
        it('should log warning messages', () => {
            testLogger.warn('Test warning message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[WARN] Test warning message')
            );
        });

        it('should not log warn messages when level is higher', () => {
            const errorLogger = new Logger(LogLevel.ERROR);
            errorLogger.warn('Test warning message');
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should log warn messages with multiple arguments', () => {
            testLogger.warn('Warning message', { data: 'test' }, 123);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[WARN] Warning message {"data":"test"} 123')
            );
        });
    });

    describe('error', () => {
        it('should log error messages', () => {
            testLogger.error('Test error message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Test error message')
            );
        });

        it('should always log error messages regardless of level', () => {
            const debugLogger = new Logger(LogLevel.DEBUG);
            const infoLogger = new Logger(LogLevel.INFO);
            const warnLogger = new Logger(LogLevel.WARN);
            const errorLogger = new Logger(LogLevel.ERROR);

            debugLogger.error('Error message');
            infoLogger.error('Error message');
            warnLogger.error('Error message');
            errorLogger.error('Error message');

            expect(consoleSpy).toHaveBeenCalledTimes(4);
        });

        it('should log error messages with multiple arguments', () => {
            testLogger.error('Error message', { data: 'test' }, 123);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Error message {"data":"test"} 123')
            );
        });
    });

    describe('formatMessage', () => {
        it('should format messages with timestamp and level', () => {
            testLogger.info('Test message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test message$/)
            );
        });

        it('should include additional arguments', () => {
            testLogger.info('Test message', { key: 'value' }, 'extra');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Test message {"key":"value"} extra')
            );
        });

        it('should handle empty additional arguments', () => {
            testLogger.info('Test message');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test message$/)
            );
        });

        it('should handle complex objects in arguments', () => {
            const complexObject: any = {
                nested: { value: 'test' },
                array: [1, 2, 3],
                nullValue: null,
                // undefined fields are dropped by JSON.stringify by design
                undefinedValue: undefined,
            };

            testLogger.info('Complex message', complexObject);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Complex message {"nested":{"value":"test"},"array":[1,2,3],"nullValue":null}')
            );
        });

        it('should handle circular references in objects', () => {
            const circularObject: any = { name: 'test' };
            circularObject.self = circularObject;

            testLogger.info('Circular message', circularObject);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Circular message {"name":"test","self":"[Circular]"}')
            );
        });
    });

    describe('LogLevel enum', () => {
        it('should have correct numeric values', () => {
            expect(LogLevel.DEBUG).toBe(0);
            expect(LogLevel.INFO).toBe(1);
            expect(LogLevel.WARN).toBe(2);
            expect(LogLevel.ERROR).toBe(3);
        });
    });

    // Default logger instance tests removed to avoid importing singleton across ESM in Jest
});
