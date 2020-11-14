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
    const appDetails: any[] = [];
    for (const appOverview of overview) {
        if (appOverview.status === 'Draft') {
            appDetails.push(appOverview);
        } else {
            const appDetail = await downloader.getAppInfo(appOverview.packageName);
            appDetails.push({
                ...appOverview,
                ...appDetail,
            });
        }
    }
    await downloader.saveScreenshot(`android-overview_${argv.accountId}_${runTimestamp}.png`);
    const headers = Object.keys(appDetails[0]);

    const ssw = new StructuredStreamWriter(StructuredFormat.CSV, outFilePath, headers);
    for (const row of appDetails) {
        ssw.writeItem(row);
    }
    ssw.done();

    for (const row of appDetails) {
        if (!row.appId) {
            continue;
        }
        const dashboardUrl = `https://play.google.com/console/u/0/developers/${argv.accountId}/app/${row.appId}/app-dashboard?timespan=thirtyDays`;
        const dashboardFilename = `AppDashboardPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(dashboardUrl, dashboardFilename);

        const vitalsOverviewUrl = `https://play.google.com/console/u/0/developers/${argv.accountId}/app/${row.appId}/vitals/metrics/overview`;
        const vitalsOverviewFilename = `AppHealthOverviewPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(vitalsOverviewUrl, vitalsOverviewFilename);

        const vitalsCrashOverviewUrl = `https://play.google.com/console/u/0/developers/${argv.accountId}/app/${row.appId}/vitals/metrics/details?days=30&metric=CRASHES`;
        const vitalsCrashOverviewFilename = `AppHealthDetailsPlace_${argv.accountId}_${row.packageName}_${runTimestamp}.png`;
        await downloader.takeScreenshotOfUrl(vitalsCrashOverviewUrl, vitalsCrashOverviewFilename);
    }

    downloader.close();

    overviewProgress.succeed(`Got and written overview to [${outFilePath}]`);
}
