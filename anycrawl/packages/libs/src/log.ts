import { log } from "crawlee";

if (process.env.NODE_ENV === 'development' || process.env.ANYCRAWL_LOG_LEVEL === 'debug') {
    log.setLevel(log.LEVELS.DEBUG);
}

class ConsoleStream {
    write(line: string) {
        log.info(`\x1b[33mAPI:\x1b[0m ${line}`);
    }

    error(line: string) {
        log.error(`\x1b[31mAPI:\x1b[0m ${line}`);
    }
}
export { log, ConsoleStream };
