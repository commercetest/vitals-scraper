import puppeteer, { Page, Browser } from 'puppeteer';
import { fallbackPromise, sleep } from './utils';

type NumExceptions = 'all' | number;
export class Downloader {
    private browser: Browser;
    private pages: Page[] = [];
    private parallel: number = 1;
    private accountId: string;
    private claimRequest: Promise<Page> = Promise.resolve(null);

    constructor(parallel: number, accountId: string) {
        this.parallel = Math.abs(Math.max(1, parallel));
        this.accountId = accountId;
    }

    public async init() {
        this.browser = await puppeteer.launch({ headless: false, defaultViewport: null });

        for (let i = 0; i < this.parallel; i++) {
            const page = await this.browser.newPage();
            (page as any).currentRequest = Promise.resolve();
            this.pages.push(page);
        }
    }

    public async login() {
        const page = await this.claimPage();
        try {
            await page.goto('https://play.google.com/apps/publish');
            await page.waitForResponse(response => response.url().includes('AppListPlace'), { timeout: null });
            await pageLoadFinished(page);
        } finally {
            this.releasePage(page);
        }
    }

    public async getOverview() {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}`);
            await pageLoadFinished(page);
            const packageDetails = await page.$$eval('[role=article] table tbody:nth-of-type(1) tr', (trs) => {
                return trs.map(tr => {
                    const cols = Array.from(tr.querySelectorAll('td')).filter(td => td.textContent);
                    const anchor = tr.querySelector<HTMLAnchorElement>('[aria-label*="package"]');
                    const href = anchor ? anchor.href : null;

                    const [$appName, $activeInstalls, $newGooglePlayRating, $lastUpdate, $status] = cols;
                    return {
                        appName: $appName.querySelector('a > div > div').textContent.trim(),
                        packageName: $appName.querySelector('a > div > div:nth-child(2)').textContent.trim(),
                        activeInstalls: Number($activeInstalls.textContent.replace(/[^0-9]/g, '')),
                        newGooglePlayRating: Number($newGooglePlayRating.textContent.replace(/[^0-9\.]/g, '')) || 'n/a',
                        lastUpdate: $lastUpdate.textContent.trim(),
                        status: $status.textContent.trim(),
                        href,
                    };
                });
            });
            return packageDetails.map(detail => {
                const href = detail.href;
                delete detail.href;
                return {
                    ...detail,
                    appId: href ? parseHash(href).appid : null,
                };
            });
        } finally {
            this.releasePage(page);
        }
    }

    public async saveScreenshot(filename: string) {
        const page = await this.claimPage();
        try {
            await page.screenshot({ path: filename, fullPage: true });
        } finally {
            this.releasePage(page);
        }
    }

    public async takeScreenshotOfUrl(url: string, filename: string) {
        const page = await this.claimPage();
        try {
            await page.goto(url);
            await pageLoadFinished(page);
            await page.screenshot({ path: filename, fullPage: true });
        } finally {
            this.releasePage(page);
        }
    }

    public async getErrorClusterIds(errorType: 'crash' | 'ANR', packageName: string, daysToScrape: number) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${packageName}&appVersion${this.lastReportedRangeStr(daysToScrape)}&errorType=${errorType}`);
            await pageLoadFinished(page);
            const errorClusterCount = await checkForErrorClusters(errorType, page);

            if (errorClusterCount === 0) {
                console.log('0 error clusters: no scraping needed.');
                return [];
            }

            const errorClusterIds = await getErrorClusterIds(errorType, page);
            console.log('Retrieved [' + errorClusterIds.length + '] error cluster ids');
            return errorClusterIds;

        } finally {
            this.releasePage(page);
        }
    }

    public async getErrorCluster(errorType: 'crash' | 'ANR', packageName: string, clusterId: string, numExceptions: NumExceptions, daysToScrape: number) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${packageName}&appVersion${this.lastReportedRangeStr(daysToScrape)}&clusterName=${clusterId}&detailsAppVersion`);
            await pageLoadFinished(page);

            const summaryData: any = await page.$eval('[role=article]', (summaryItemsCont: any) => {
                const summaryItems = [...summaryItemsCont.children];
                const data = summaryItems
                    .map(a => [...a.children].slice(0, 3).map(a => a.textContent.trim()).filter(a => a))
                    .reduce((acc, [key, value]) => {
                        const processedKey = key.replace(/\./g, '_').trim();
                        return {
                            ...acc,
                            [processedKey]: (value || '').trim()
                        };
                    }, {});
                return data;
            });

            // Trigger show all items
            await page.$$eval('[role=article] .gwt-Anchor[href="javascript:"]', els => els.forEach((el: any) => el.click()));

            const detailData = await page.$$eval('[role=article]', articles => {
                return articles.slice(2, 5)
                    .reduce((acc, el) => {
                        const title = el.querySelector('h3').textContent;
                        const table = [...el.querySelectorAll('table') as any].slice(-1)[0];

                        const tableData = [...table.querySelectorAll('tr')]
                            .reduce((acc, row) => {
                                const [key, value, percentage] = [...row.querySelectorAll('td')].map(el => el.textContent);

                                const processedKey = key.replace(/\./g, '_').trim();

                                return {
                                    ...acc,
                                    [processedKey]: { value: (value || '').trim(), percentage: (percentage || '').trim() }
                                };
                            }, {});

                        return {
                            ...acc,
                            [title]: tableData
                        };
                    }, {});
            });

            const exceptions = await readExceptionsFromErrorPage(page, numExceptions);

            return {
                ...summaryData,
                ...detailData,
                exceptions,
            };
        } finally {
            this.releasePage(page);
        }
    }

    public async getVitalsOverview(packageName: string) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AppHealthDetailsPlace:p=${packageName}&aho=APP_HEALTH_OVERVIEW&ahdt=CRASHES&ts=THIRTY_DAYS&ahbt=BOOKS_AND_REFERENCE`, { waitUntil: 'networkidle0' });
            await pageLoadFinished(page);
            const tableEl = await page.evaluateHandle(`document.querySelector("body > div:nth-child(5) > div > div:nth-child(2) > div > div:nth-child(2) > div > div.IP4Y5NB-T-c > div > div.IP4Y5NB-G-m > div > div:nth-child(1) > div > div > div.IP4Y5NB-j-z > div:nth-child(2) > fox-app-health-details").shadowRoot.querySelector("div > fox-loading-overlay > fox-app-health-details-breakdown:nth-child(4)").shadowRoot.querySelector("fox-dashboard-async-card > fox-app-health-details-table").shadowRoot.querySelector("table")`);
            const columnTitles: string[] = await tableEl.asElement().$$eval('thead th', els => els.map((th: any) => th.innerText.trim()).filter(a => a)) as any;
            const rows = await tableEl.asElement().$$('tbody tr');

            const androidVersions: AndroidVersion[] = await Promise.all(
                rows.map(async row => {
                    const cells: string[] = await row.$$eval('th,td', els => els.map((el: any) => el.innerText.trim())) as any;
                    const ret: AndroidVersion = columnTitles.reduce((acc: any, key, index) => {
                        acc[key] = cells[index];
                        return acc;
                    }, {});
                    const crashUrl: string = await row.$eval('.related-link', (el: any) => el.href) as any;
                    const androidVersion = crashUrl.split('&androidVersion=')[1];
                    ret.androidVersion = androidVersion;
                    return ret;
                })
            );
            const androidVersionXName: KVS<AndroidVersion> = androidVersions.reduce((acc: KVS<AndroidVersion>, item) => {
                acc[item['Android version']] = item;
                return acc;
            }, {});
            this.releasePage(page);
            return {
                androidVersions: androidVersionXName
            };
        } catch (err) {
            this.releasePage(page);
            throw err;
        }
    }

    public async getCrashClustersForAndroidVersion(packageName: string, androidVersion: AndroidVersion, daysToScrape: number) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${packageName}${this.lastReportedRangeStr(daysToScrape)}&appVersion&androidVersion=${androidVersion.androidVersion}`, { waitUntil: 'networkidle0' });
            await pageLoadFinished(page);
            const crashClusters = await readCrashClusters(page);
            this.releasePage(page);
            return crashClusters;
        } catch (err) {
            this.releasePage(page);
            throw err;
        }
    }

    public close() {
        this.browser.close();
    }

    private lastReportedRangeStr(daysToScrape: number) {
        let reportedRange = '';
        let detailsSpan = `&detailsSpan=${daysToScrape}`;
        if (daysToScrape === 1) {
            reportedRange = '&lastReportedRange=LAST_24_HRS';
            detailsSpan = '&detailsSpan=7';
        } else if (daysToScrape === 7) {
            reportedRange = '';
        } else {
            reportedRange = `&lastReportedRange=LAST_${daysToScrape}_DAYS`;
        }
        return reportedRange + detailsSpan;
    }

    private async claimPage(): Promise<Page> {
        const claimRequest = this.claimRequest.then(() => {
            return new Promise<Page>(async (resolve) => {
                const page = await Promise.race(this.pages.map((p: any) => p.currentRequest.then(() => p)));
                page.currentRequest = page.currentRequest.then(() => {
                    return new Promise((resolve) => {
                        page.release = resolve;
                    });
                });
                resolve(page);
            });
        });

        this.claimRequest = claimRequest;
        return claimRequest;
    }

    private async releasePage(page: Page) {
        const sleepMult = 1 + Math.random() * 5;
        await sleep(1000 * sleepMult);
        (page as any).release();
    }
}

async function pageLoadFinished(page: Page, remainingRetries = 3): Promise<any> {
    await page.waitForSelector(`[role=status][aria-hidden=true]`);
    const errorBanner = await page.$('[data-notification-type="FAILURE"]:not([aria-hidden=true])');
    if (errorBanner) {
        if (remainingRetries <= 0) {
            throw new Error(`Page Error Notification found`);
        }
        console.warn(`Page Error Notification found, retrying`);
        await sleep(3000);
        await page.reload();
        return pageLoadFinished(page, remainingRetries - 1);
    }
    return;
}

function parseHash(hash: string): any {
    return hash.split('#').slice(1).join('#').split('&')
        .reduce((acc, kvPair) => {
            const [key, value] = kvPair.split('=');
            return {
                ...acc,
                [key]: value
            };
        }, {});
}

async function checkForErrorClusters(errorType: 'crash' | 'ANR', page: Page): Promise<number> {
    await pageLoadFinished(page);

    let clusters = 0;
    const labels = await page.$$eval('.gwt-Label', (el: any[]) => el.map(el => el.textContent));
    const realTimeCrashesText = labels.filter(textContent => textContent.includes(`Real-time ${errorType}`));
    const screenshotFilename = `realtime-errors-screenshot_${Date.now()}.png`;
    if (realTimeCrashesText.length === 0) {
        console.log(`Warning, \'Real-time ${errorType}\' message not found, is something wrong? see [${screenshotFilename}]`);
        await page.screenshot({ path: screenshotFilename, fullPage: true });
    } else {
        console.info(`'Real-time ${errorType}' message found, see ${screenshotFilename}`);
        await page.screenshot({ path: screenshotFilename, fullPage: true });

        const clusterText = labels.filter(textContent => textContent.includes(`${errorType} clusters`)).toString();

        if (clusterText.length > 0) {
            clusters = parseInt(clusterText);
            console.log(`Found [${clusters}] crash clusters`);
        } else {
            console.log('No count available, assuming at least a page of crash clusters.');
            // Could we also save the contents of the page for post-hoc analysis? I've seen 1 crash cluster
            // shown in  realtime-crashes-screenshot_1572475282166.png yet our code didn't find a match.
            clusters = -1;  // We assume there are plenty but don't know for sure.
        }
    }

    return clusters;
}

async function getErrorClusterIds(errorType: 'crash' | 'ANR', page: Page): Promise<string[]> {
    await pageLoadFinished(page);

    const clusterHrefs = await page.$$eval('section table tbody tr a', (as: any[]) => as.map(a => a.href));

    const crashClusterIds = clusterHrefs
        .map(href => {
            return (parseHash(href) as any).clusterName;
        });

    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
        await nextPageButton.click();
        await sleep(20);
        await pageLoadFinished(page);
        return crashClusterIds.concat(
            await getErrorClusterIds(errorType, page)
        );
    } catch (err) {
        return crashClusterIds;
    }
}

async function readExceptionsFromErrorPage(page: Page, numExceptions: 'all' | number, pageNum: number = 0): Promise<Array<{ trace: string, title: string, device: string }>> {

    await pageLoadFinished(page);

    const title = await page.$eval('section[role=article] .gwt-Label', el => el.textContent);
    const device = await page.$eval('section[role=article] .gwt-HTML', el => el.textContent);
    const name = await page.$$eval('section[role=article] .gwt-HTML', ([_, el]) => el.textContent);
    const trace = await page.$$eval('section[role=article] .gwt-Label', els => els.slice(1).map(el => el.textContent).join('\n'));

    const exception = {
        title,
        trace: name + '\n' + trace,
        device,
    };

    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
    } catch (err) { /* NOOP */ }

    const shouldLoadNextPage = numExceptions === 'all' || (numExceptions - 1) > pageNum;
    if (nextPageButton && shouldLoadNextPage) {
        await nextPageButton.click();
        return [exception].concat(
            await readExceptionsFromErrorPage(page, numExceptions, pageNum + 1)
        );
    } else {
        return [exception];
    }
}

async function readCrashClusters(page: Page): Promise<CrashCluster[]> {
    await pageLoadFinished(page);
    const tableEl = await page.$(`section table`);
    const rows = await tableEl.asElement().$$('tbody tr');

    const crashClusters: CrashCluster[] = await Promise.all(
        rows.map(async row => {
            const cells: string[] = await row.$$eval('th,td', els => els.map((el: any) => el.innerText.trim())) as any;
            const description = await fallbackPromise(row.$eval('[data-type="errorDescription"]', (el: any) => el.innerText) as any, '');
            const location = await fallbackPromise(row.$eval('[data-type="errorLocation"]', (el: any) => el.innerText) as any, '');
            return {
                'Error description': description,
                'Error location': location.replace('in ', ''),
                'Reports': cells[1],
                'Impacted users': cells[2],
                'Last reported': cells[3],
            };
        })
    );

    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
    } catch (err) { /* NOOP */ }

    if (nextPageButton) {
        await nextPageButton.click();
        await sleep(500);
        return crashClusters.concat(
            await readCrashClusters(page)
        );
    } else {
        return crashClusters;
    }
}
