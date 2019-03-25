///<reference path="./types.d.ts" />

import * as path from 'path';
import ora from 'ora';
import minimist from 'minimist';
import { mapLimit, getMpDetailUrls, getMpDetail, logger } from './utils';
import { csvHeaderRow } from './utils/const';
import {
  StructuredStreamWriter,
  StructuredFormat,
} from './utils/structuredStreamWriter';

const argv = minimist(process.argv.slice(2));

async function app(argv: any) {
  const verbose = argv.verbose || false;
  if (!argv.verbose) {
    logger.log(`[--verbose] is not set, defaulting to [${verbose}]`);
  }

  (process as any).verbose = verbose;

  const parallel = argv.parallel || 5;
  if (!argv.parallel) {
    logger.log(`[--parallel] is not set, defaulting to [${parallel}]`);
  }

  const format = argv.format || 'csv';
  if (!argv.format) {
    logger.log(
      `[--format] is not set, defaulting to [${format}] (options: json|csv)`
    );
  }

  let outputFilePath;
  if (!argv.outFile) {
    outputFilePath = path.join(process.cwd(), `mps.${format}`);
    logger.log(`[--outFile] is not set, using [${outputFilePath}]`);
  } else {
    outputFilePath = path.join(process.cwd(), argv.outFile);
    logger.log(`Writing data to [${outputFilePath}]`);
  }

  console.log('\n\n');

  const mpListSpinner = ora(
    `[${logger.getTs()}] Fetching list of MPs...`
  ).start();
  const detailUrls = await getMpDetailUrls();
  mpListSpinner.succeed(
    `[${logger.getTs()}] Found [${detailUrls.length}] MP detail pages`
  );

  const fileWriter = new StructuredStreamWriter(
    format === 'json' ? StructuredFormat.JSON : StructuredFormat.CSV,
    outputFilePath,
    csvHeaderRow
  );

  const mpDetailSpinner = ora(
    `[${logger.getTs()}] Fetching details for [${detailUrls.length}] MPs`
  ).start();
  let fetchedMPs = 0;
  await mapLimit(detailUrls, parallel, async mpUrl => {
    try {
      const mpData = await getMpDetail(mpUrl);
      fileWriter.writeItem(mpData);
      fetchedMPs += 1;
      mpDetailSpinner.text = `[${logger.getTs()}] Got details for [${fetchedMPs}/${
        detailUrls.length
      }] MPs`;
    } catch (err) {
      logger.warn(`Failed to get [${mpUrl}], skipping`);
    }
  });
  mpDetailSpinner.succeed(`[${logger.getTs()}] Got [${fetchedMPs}] MP details`);

  console.log('\n\n');

  fileWriter.done();
  return outputFilePath;
}

const startTime = Date.now();
app(argv)
  .then(outputFilePath => {
    logger.log(
      `Successfully Downloaded MPs to [${outputFilePath}] in [${Date.now() -
        startTime}ms]`
    );
  })
  .catch(err => {
    logger.error(`Failed to download MP data after [${startTime}ms]:`, err);
  });
