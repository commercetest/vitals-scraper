///<reference path="./types.d.ts" />

import { logger } from './utils';
import minimist from 'minimist';
import { scrapeCrashes } from './scrapeCrashes';
import { scrapeOverview } from './scrapeOverview';

const argv = minimist(process.argv.slice(2), {
  string: [
    'accountId',
  ]
});

async function app(argv: any) {
  let mode: 'crashes' | 'overview' = 'crashes';
  if (!argv.mode) {
    logger.log(`[--mode] is not set, defaulting to [${mode}]`);
  } else {
    mode = argv.mode;
    const validModes = ['crashes', 'overview'];
    if (!validModes.includes(mode)) {
      throw new Error(`[--mode=${mode}] is invalid, value should be one of [${validModes.join(',')}]`);
    }
  }

  logger.log(`Running scraper in [${mode}] mode`);

  if (mode === 'crashes') {
    await scrapeCrashes(argv);
  } else if (mode === 'overview') {
    await scrapeOverview(argv);
  }
}

const startTime = Date.now();
app(argv)
  .then(() => {
    logger.log(
      `Successfully ran scrape in [${Date.now() -
      startTime}ms]`
    );
  })
  .catch(err => {
    logger.error(`Failed to scrape after [${Date.now() - startTime}ms]:`, err);
  });
