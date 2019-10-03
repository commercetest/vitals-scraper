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

    const outFilePath = path.join(outputDir, `android-overview_${Date.now()}.csv `);
    const overviewProgress = ora(`Getting and writing overview to [${outFilePath}]`).start();

    const overview = await downloader.getOverview();
    const headers = Object.keys(overview[0]);

    const ssw = new StructuredStreamWriter(StructuredFormat.CSV, outFilePath, headers);
    for (const row of overview) {
        ssw.writeItem(row);
    }

    await downloader.close();
    ssw.done();
    overviewProgress.succeed(`Got and written overview to [${outFilePath}]`);
}
