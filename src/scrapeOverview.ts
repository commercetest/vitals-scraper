import { logger } from './utils';
import * as path from 'path';
import { Downloader } from './Downloader';
import ora from 'ora';
import { StructuredStreamWriter, StructuredFormat } from './utils/structuredStreamWriter';

export async function scrapeOverview(argv: any) {
    if (!argv.accountId) {
        throw new Error(`No [--accountId] set, this is required`);
    }

    let outputDir;
    if (!argv.outDir) {
        outputDir = process.cwd();
        logger.log(`[--outDir] is not set, using [${outputDir}]`);
    } else {
        outputDir = path.join(process.cwd(), argv.outDir);
        logger.log(`Writing data to [${outputDir}]`);
    }

    const downloader = new Downloader(
        1,
        argv.accountId,
    );

    await downloader.init();

    const loginProgress = ora(`Logging In (see popped Chromium window)`).start();
    await downloader.login();
    loginProgress.succeed('Logging In');

    const runTimestamp = Date.now();
    const outFilePath = path.join(outputDir, `android-overview_${argv.accountId}_${runTimestamp}.csv`);
    const overviewProgress = ora(`Getting and writing overview to [${outFilePath}]`).start();

    const overview = await downloader.getOverview();
    await downloader.saveScreenshot(`android-overview_${argv.accountId}_${runTimestamp}.png`);
    const headers = Object.keys(overview[0]);

    const ssw = new StructuredStreamWriter(StructuredFormat.CSV, outFilePath, headers);
    for (const row of overview) {
        ssw.writeItem(row);
    }
    ssw.done();

    for (const row of overview) {
        if (row.status !== 'Published') {
            continue;
        }
        const dashboardUrl = `https://play.google.com/apps/publish/?account=${argv.accountId}#AppDashboardPlace:p=${row.packageName}&appid=${row.appId}`;
        const dashboardFilename = `AppDashboardPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(dashboardUrl, dashboardFilename);

        const vitalsOverviewUrl = `https://play.google.com/apps/publish/?account=${argv.accountId}#AppHealthOverviewPlace:p=${row.packageName}&appid=${row.appId}&ts=THIRTY_DAYS&ahbt=_CUSTOM`;
        const vitalsOverviewFilename = `AppHealthOverviewPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(vitalsOverviewUrl, vitalsOverviewFilename);

        const vitalsCrashOverviewUrl = `https://play.google.com/apps/publish/?account=${argv.accountId}#AppHealthDetailsPlace:p=${row.packageName}&appid=${row.appId}&aho=APP_HEALTH_OVERVIEW&ahdt=CRASHES&ts=THIRTY_DAYS&ahbt=_CUSTOM`;
        const vitalsCrashOverviewFilename = `AppHealthDetailsPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(vitalsCrashOverviewUrl, vitalsCrashOverviewFilename);
    }

    downloader.close();

    overviewProgress.succeed(`Got and written overview to [${outFilePath}]`);
}
