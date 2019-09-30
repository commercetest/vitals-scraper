///<reference path="./types.d.ts" />

import ora from 'ora';
import minimist from 'minimist';
import * as path from 'path';
import { logger } from './utils';
import { Downloader } from './Downloader';
import { StructuredStreamWriter } from './utils/structuredStreamWriter';

const argv = minimist(process.argv.slice(2), {
  string: [
    'accountId',
  ]
});

async function app(argv: any) {
  if (!argv.accountId) {
    throw new Error(`No [--accountId] set, this is required`);
  }
  if (!argv.packageName) {
    throw new Error(`No [--packageName] set, this is required`);
  }

  const verbose = argv.verbose || false;
  if (!argv.verbose) {
    logger.log(`[--verbose] is not set, defaulting to [${verbose}]`);
  }
  (process as any).verbose = verbose;

  const parallel = argv.parallel || 1;
  if (!argv.parallel) {
    logger.log(`[--parallel] is not set, defaulting to [${parallel}]`);
  }

  const daysToScrape = argv.days || 7;
  if (!argv.days) {
    logger.log(`[--days] is not set, defaulting to [${daysToScrape}]`);
  }
  if (![1, 7, 14, 30, 60].includes(daysToScrape)) {
    throw new Error(`[--days=${argv.days}] is invalid, please supply one of: [1, 7, 14, 30, 60]`);
  }

  const format = argv.format || 'json';
  if (!argv.format) {
    logger.log(
      `[--format] is not set, defaulting to [${format}] (options: json|csv)`
    );
  }
  if (format !== 'json') {
    throw new Error(`Currently only supports [--format=json]`);
  }

  let outputDir;
  if (!argv.outDir) {
    outputDir = process.cwd();
    logger.log(`[--outDir] is not set, using [${outputDir}]`);
  } else {
    outputDir = path.join(process.cwd(), argv.outDir);
    logger.log(`Writing data to [${outputDir}]`);
  }

  let numExceptions: 'all' | number = 'all';
  if (!argv.numExceptions) {
    logger.log(`[--numExceptions] is not set, using [${numExceptions}]`);
  } else {
    const nE = Number(argv.numExceptions);
    if (isNaN(nE)) {
      if (argv.numExceptions !== 'all') {
        logger.warn(`[--numExceptions] is invalid, please set a number or "all"`);
      } else {
        numExceptions = argv.numExceptions;
      }
    } else {
      numExceptions = nE;
    }
  }

  console.log('\n\n');

  const downloader = new Downloader(
    parallel,
    argv.accountId,
    daysToScrape,
    numExceptions,
  );

  await downloader.init();

  const loginProgress = ora(`Logging In (see popped Chromium window)`).start();
  await downloader.login();
  loginProgress.succeed('Logging In');

  const availablePackageNames = await downloader.getAvailablePackages();
  let packageNamesToScrape = argv.packageName.split(',');
  if (packageNamesToScrape === '*') {
    packageNamesToScrape = availablePackageNames;
  }

  for (const packageName of packageNamesToScrape) {
    if (!availablePackageNames.includes(packageName)) {
      downloader.close();
      throw new Error(`Package name [${packageName}] is not available`);
    }
  }

  for (const packageName of packageNamesToScrape) {
    console.info(`Scraping package [${packageName}]`);

    const outFilePath = path.join(outputDir, `android-crash-clusters_${Date.now()}.${format}`);
    const clustersProgress = ora(`[${packageName}] Getting and writing crash clusters to [${outFilePath}]`).start();

    try {
      const fileWriter = new StructuredStreamWriter(format, outFilePath);
      const clusterIds = await downloader.getCrashClusterIds(packageName);
      let completedScrapeIndex = 0;
      await Promise.all(
        clusterIds.map(id => downloader.getCrashCluster(packageName, id).then((ret) => {
          const progressPercentage = Math.round(completedScrapeIndex / clusterIds.length * 100);
          clustersProgress.info(`Getting and writing crash clusters to [${outFilePath}] [${completedScrapeIndex}/${clusterIds.length}] [${progressPercentage}%]`);
          logger.info(`Got crash cluster detail [${completedScrapeIndex}/${clusterIds.length}] [${progressPercentage}%]`);
          completedScrapeIndex += 1;
          return fileWriter.writeItem(ret);
        }))
      );

      fileWriter.done();

      clustersProgress.succeed();

    } catch (err) {
      clustersProgress.fail();
      console.info(`Failed to scrape [${packageName}]`);
      throw err;
    }

    console.log('\n\n');
    console.info(`Successfully scraped [${packageName}]`);
  }
  downloader.close();
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
