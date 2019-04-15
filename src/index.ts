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

  const format = argv.format || 'csv';
  if (!argv.format) {
    logger.log(
      `[--format] is not set, defaulting to [${format}] (options: json|csv)`
    );
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

  const overviewProgress = ora(`Getting Vitals Overview`).start();
  const {
    androidVersions
  } = await downloader.getVitalsOverview();
  overviewProgress.succeed();
  const crashesXversion = (await Promise.all(
    Object.values(androidVersions)
      .map(async item => {
        const versionProgress = ora(`Getting crash clusters for [androidVersion=${item.androidVersion}] (${item['Android version']})\n`).start();
        try {
          if (!item.androidVersion) {
            throw new Error(`[androidVersion=${item.androidVersion}] does not look like a valid version (For version [${item['Android version']}])`);
          }
          const crashes = await downloader.getCrashClustersForAndroidVersion(item);
          versionProgress.succeed();
          return {
            androidVersion: item.androidVersion,
            crashes
          };
        } catch (err) {
          versionProgress.fail(`Failed to get crash clusters for [androidVersion=${item.androidVersion}] (${item['Android version']})\n${err}`);
        }
      })
  )).filter(a => a);

  for (const { androidVersion, crashes } of crashesXversion) {
    const outFilePath = path.join(outputDir, `android-${androidVersion}_${Date.now()}.${format}`);
    const writeFileProgress = ora(`Writing crashes for [androidVersion=${androidVersion}] to [${outFilePath}]`).start();

    try {
      const headerItems = Object.keys(Object.assign({}, ...crashes));
      const fileWriter = new StructuredStreamWriter(format, outFilePath, headerItems);

      for (const crash of crashes) {
        await fileWriter.writeItem(crash);
      }

      fileWriter.done();

      writeFileProgress.succeed();
    } catch (err) {
      writeFileProgress.fail();
      throw err;
    }
  }

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
