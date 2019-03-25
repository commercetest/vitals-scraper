import * as backoff from 'backoff';
import axios from 'axios';
import { logger } from './logger';

export function get<T>(url: string, retryAttempts: number = 5) {
  logger.info(`Getting JSON from [${url}]`);
  return new Promise<T>((resolve, reject) => {
    const call = backoff.call(getCb, url, (err: any, val: any) => {
      if (err) {
        logger.warn(`Failed to get [${url}] [${call.getNumRetries()}] times`);
        reject(err);
      } else {
        resolve(val);
      }
    });
    call.setStrategy(new backoff.ExponentialStrategy());
    call.failAfter(retryAttempts);
    call.start();
  });
}

function getCb<T>(url: string, handler: any) {
  return axios.get<T>(url).then(a => handler(null, a.data), handler);
}
