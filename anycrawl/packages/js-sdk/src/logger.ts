export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

function coerceLogLevelFromEnv(value: string | undefined): LogLevel {
    const normalized = (value || '').toLowerCase();
    switch (normalized) {
        case 'debug':
            return LogLevel.DEBUG;
        case 'info':
            return LogLevel.INFO;
        case 'warn':
        case 'warning':
            return LogLevel.WARN;
        case 'error':
            return LogLevel.ERROR;
        default:
            return LogLevel.INFO;
    }
}

function safeStringify(input: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(
        input,
        (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value as object)) return '[Circular]';
                seen.add(value as object);
            }
            return value;
        }
    );
}

function formatMessage(level: keyof typeof LogLevel, message: unknown, extra: unknown[]): string {
    const timestamp = new Date().toISOString();
    const levelText = level.toUpperCase();
    const parts: string[] = [
        `[${timestamp}] [${levelText}]`,
        typeof message === 'string' ? message : safeStringify(message),
    ];
    for (const arg of extra) {
        if (typeof arg === 'string') parts.push(arg);
        else parts.push(safeStringify(arg));
    }
    return parts.join(' ');
}

export class Logger {
    private currentLevel: LogLevel;

    constructor(level?: LogLevel) {
        this.currentLevel = level ?? coerceLogLevelFromEnv(process.env.LOG_LEVEL);
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.currentLevel;
    }

    // Use console.error for deterministic test interception
    debug(message: unknown, ...args: unknown[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        // eslint-disable-next-line no-console
        console.error(formatMessage('DEBUG', message, args));
    }

    info(message: unknown, ...args: unknown[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        // eslint-disable-next-line no-console
        console.error(formatMessage('INFO', message, args));
    }

    warn(message: unknown, ...args: unknown[]): void {
        if (!this.shouldLog(LogLevel.WARN)) return;
        // eslint-disable-next-line no-console
        console.error(formatMessage('WARN', message, args));
    }

    error(message: unknown, ...args: unknown[]): void {
        // Always log errors
        // eslint-disable-next-line no-console
        console.error(formatMessage('ERROR', message, args));
    }
}

// No default singleton export to avoid duplicate declarations in Jest ESM env

export const logger = {
    warn: (...args: unknown[]) => { if (process.env.NODE_ENV !== 'test') console.warn(...args); },
    info: (...args: unknown[]) => { if (process.env.NODE_ENV !== 'test') console.info(...args); },
    error: (...args: unknown[]) => { if (process.env.NODE_ENV !== 'test') console.error(...args); },
};


