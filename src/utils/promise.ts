import { logger } from './logger';

export function fallbackPromise<T>(promise: Promise<T>, fallbackValue: T) {
    return promise.catch(err => {
        logger.warn(`Promise errored, falling back to [${fallbackValue}]`, err);
        return fallbackValue;
    });
}

export function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms * (1 + (Math.random() * 2)));
    });
}
