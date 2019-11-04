import { logger } from './utils';
import ora from 'ora';
import * as path from 'path';
import { Downloader } from './Downloader';
import { StructuredStreamWriter, StructuredFormat } from './utils/structuredStreamWriter';

const validErrorTypes = ['crash', 'ANR'];

export async function scrapeErrors(argv: any) {
    if (!argv.accountId) {
        throw new Error(`No [--accountId] set, this is required`);
    }
    if (!argv.packageName) {
        throw new Error(`No [--packageName] set, this is required`);
    }

    const errorTypes: string[] = (argv.errorType || 'crash,ANR').split(',');
    if (!argv.errorType) {
        logger.log(`[--errorType] is not set, defaulting to [${errorTypes.join(',')}] (options: crash,ANR)`);
    } else {
        const invalidErrorType = errorTypes.find((et: string) => !validErrorTypes.includes(et));
        if (invalidErrorType) {
            throw new Error(`An invalid errorType was specified (${invalidErrorType}), valid options are [crash,ANR]`);
        }
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
    } else {
        logger.log(`scraping for [${daysToScrape}]`);
    }

    if (![1, 7, 14, 30, 60].includes(daysToScrape)) {
        throw new Error(`[--days=${argv.days}] is invalid, please supply one of: [1, 7, 14, 30, 60]`);
    }

    const format = argv.format || 'json';
    if (!argv.format) {
        logger.log(
            `[--format] is not set, defaulting to [${format}] (options: json | csv)`
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
        logger.log(`[--numExceptions] specified, [${numExceptions}] will be retrieved`);
    }

    console.log('\n\n');

    const downloader = new Downloader(
        parallel,
        argv.accountId,
    );

    await downloader.init();

    const loginProgress = ora(`Logging In(see popped Chromium window)`).start();
    await downloader.login();
    loginProgress.succeed('Logging In');

    const availablePackages = await downloader.getOverview();
    // Remove any suspended and draft apps from the set of available packages as these aren't in use.
    const publishedPackages = availablePackages.filter(p => p.status === 'Published');
    const publishedPackageNames = publishedPackages.map(p => p.packageName);
    let packageNamesToScrape = argv.packageName.split(',');
    if (packageNamesToScrape.includes('*')) {
        packageNamesToScrape = publishedPackageNames;
    } else {
        for (const packageName of packageNamesToScrape) {
            if (!publishedPackageNames.includes(packageName)) {
                downloader.close();
                throw new Error(`Package name [${packageName}]is not available`);
            }
        }
    }

    for (const packageName of packageNamesToScrape) {
        console.info(`Scraping package [${packageName}]`);

        for (const errorType of errorTypes) {
            await scrapeErrorClusters(
                errorType as 'crash' | 'ANR',
                downloader,
                outputDir,
                packageName,
                daysToScrape,
                numExceptions,
                format,
            );
        }

        console.log('\n\n');
        console.info(`Successfully scraped [${packageName}]`);
    }
    downloader.close();
}

async function scrapeErrorClusters(
    errorType: 'crash' | 'ANR',
    downloader: Downloader,
    outputDir: string,
    packageName: string,
    daysToScrape: number,
    numExceptions: number | 'all',
    format: StructuredFormat) {
    const outFilePath = path.join(outputDir, `android-${errorType}-clusters-${packageName}_${Date.now()}.${format}`);
    const clustersProgress = ora(`[${packageName}] Getting and writing ${errorType} clusters to [${outFilePath}]`).start();

    try {
        const clusterIds = await downloader.getErrorClusterIds(errorType, packageName, daysToScrape);
        if (clusterIds.length > 0) {
            const fileWriter = new StructuredStreamWriter(format, outFilePath);
            let completedScrapeIndex = 0;
            await Promise.all(
                clusterIds.map(id => downloader.getErrorCluster(errorType, packageName, id, numExceptions, daysToScrape).then((ret) => {
                    const progressPercentage = Math.round(completedScrapeIndex / clusterIds.length * 100);
                    clustersProgress.info(`Getting and writing ${errorType} clusters to [${outFilePath}] [${completedScrapeIndex}/${clusterIds.length}] [${progressPercentage}%]`);
                    logger.info(`Got ${errorType} cluster detail [${completedScrapeIndex}/${clusterIds.length}] [${progressPercentage}%]`);
                    completedScrapeIndex += 1;
                    return fileWriter.writeItem(ret);
                }))
            );
            fileWriter.done();
        }
        clustersProgress.succeed();

    } catch (err) {
        clustersProgress.fail();
        console.info(`Failed to scrape [${packageName}]`);
        throw err;
    }
}
