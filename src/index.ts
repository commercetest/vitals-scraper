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

  console.log('\n\n');

  const downloader = new Downloader(
    parallel,
    argv.packageName,
    argv.accountId,
  );

  await downloader.init();
  const loginProgress = ora(`Logging In (see popped Chromium window)`).start();
  await downloader.login();
  loginProgress.succeed('Logging In');

  const outFilePath = path.join(outputDir, `android-crash-clusters_${Date.now()}.${format}`);
  const clustersProgress = ora(`Getting and writing crash clusters to [${outFilePath}]`).start();

  try {
    const fileWriter = new StructuredStreamWriter(format, outFilePath);
    const clusterIds = await downloader.getCrashClusterIds();
    let completedScrapeIndex = 0;
    await Promise.all(
      clusterIds.map(id => downloader.getCrashCluster(id).then((ret) => {
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
    throw err;
  }

  // const overviewProgress = ora(`Getting Vitals Overview`).start();
  // const {
  //   androidVersions
  // } = await downloader.getVitalsOverview();
  // overviewProgress.succeed();
  // const crashesXversion = (await Promise.all(
  //   Object.values(androidVersions)
  //     .map(async item => {
  //       if (!item.androidVersion) {
  //         switch(item['Android version']){
  //           case "8":
  //             item.androidVersion = "28"
  //             break;
  //           case "7":
  //             item.androidVersion = "27"
  //             break;
  //           }
  //       }
  //       const versionProgress = ora(`Getting crash clusters for [androidVersion=${item.androidVersion}] (${item['Android version']})\n`).start();
  //       try {
  //         if (!item.androidVersion) {
  //           throw new Error(`[androidVersion=${item.androidVersion}] does not look like a valid version (For version [${item['Android version']}])`);
  //         }
  //         const crashes = await downloader.getCrashClustersForAndroidVersion(item);
  //         versionProgress.succeed();
  //         return {
  //           androidVersion: item.androidVersion,
  //           crashes
  //         };
  //       } catch (err) {
  //         versionProgress.fail(`Failed to get crash clusters for [androidVersion=${item.androidVersion}] (${item['Android version']})\n${err}`);
  //       }
  //     })
  // )).filter(a => a);

  // for (const { androidVersion, crashes } of crashesXversion) {
  //   const outFilePath = path.join(outputDir, `android-${androidVersion}_${Date.now()}.${format}`);
  //   const writeFileProgress = ora(`Writing crashes for [androidVersion=${androidVersion}] to [${outFilePath}]`).start();

  //   try {
  //     const headerItems = Object.keys(Object.assign({}, ...crashes));
  //     const fileWriter = new StructuredStreamWriter(format, outFilePath, headerItems);

  //     for (const crash of crashes) {
  //       await fileWriter.writeItem(crash);
  //     }

  //     fileWriter.done();

  //     writeFileProgress.succeed();
  //   } catch (err) {
  //     writeFileProgress.fail();
  //     throw err;
  //   }
  // }

  console.log('\n\n');

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
