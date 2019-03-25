import { logger } from './logger';

export function fallbackPromise<T>(promise: Promise<T>, fallbackValue: T) {
    return promise.catch(err => {
        logger.warn(`Promise errored, falling back to [${fallbackValue}]`, err);
        return fallbackValue;
    });
}
