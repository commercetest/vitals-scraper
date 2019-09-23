import puppeteer, { Page, Browser } from 'puppeteer';
import { fallbackPromise, sleep } from './utils';

export class Downloader {
    private browser: Browser;
    private pages: Page[] = [];
    private parallel: number = 1;
    private accountId: string;
    private packageName: string;
    private daysToScrape: number;
    private numExceptions: 'all' | number;
    private claimRequest: Promise<Page> = Promise.resolve(null);

    constructor(parallel: number, packageName: string, accountId: string, daysToScrape: number, numExceptions: 'all' | number) {
        this.parallel = Math.abs(Math.max(1, parallel));
        this.accountId = accountId;
        this.packageName = packageName;
        this.daysToScrape = daysToScrape;
        this.numExceptions = numExceptions;
    }

    public async init() {
        this.browser = await puppeteer.launch({ headless: false });

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
        } finally {
            this.releasePage(page);
        }
    }

    public async getCrashClusterIds() {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}&appVersion${this.lastReportedRangeStr()}&errorType=CRASH`);
            const crashClusterIds = await getCrashClusterIds(page);

            return crashClusterIds;
        } finally {
            this.releasePage(page);
        }
    }

    public async getCrashCluster(clusterId: string) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}&appVersion${this.lastReportedRangeStr()}&clusterName=${clusterId}&detailsAppVersion`)
            await page.waitForSelector('.gwt-viz-container'); // loading
            await sleep(1000);

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

            const exceptions = await readExceptionsFromCrashPage(page, this.numExceptions);

            return {
                ...summaryData,
                ...detailData,
                exceptions,
            };
        } finally {
            this.releasePage(page);
        }
    }

    public async getVitalsOverview() {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AppHealthDetailsPlace:p=${this.packageName}&aho=APP_HEALTH_OVERVIEW&ahdt=CRASHES&ts=THIRTY_DAYS&ahbt=BOOKS_AND_REFERENCE`, { waitUntil: 'networkidle0' });
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

    public async getCrashClustersForAndroidVersion(androidVersion: AndroidVersion) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}${this.lastReportedRangeStr()}&appVersion&androidVersion=${androidVersion.androidVersion}`, { waitUntil: 'networkidle0' });
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

    private lastReportedRangeStr() {
        let reportedRange = '';
        let detailsSpan = `&detailsSpan=${this.daysToScrape}`;
        if (this.daysToScrape === 1) {
            reportedRange = '&lastReportedRange=LAST_24_HRS';
            detailsSpan = '&detailsSpan=7';
        } else if (this.daysToScrape === 7) {
            reportedRange = '';
        } else {
            reportedRange = `&lastReportedRange=LAST_${this.daysToScrape}_DAYS`;
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

function parseHash(hash: string) {
    return hash.split('&')
        .reduce((acc, kvPair) => {
            const [key, value] = kvPair.split('=');
            return {
                ...acc,
                [key]: value
            };
        }, {});
}

async function getCrashClusterIds(page: Page): Promise<string[]> {
    await page.waitForSelector('[data-type="errorLocation"]'); // loading

    const clusterHrefs = await page.$$eval('section table tbody tr a', (as: any[]) => as.map(a => a.href));

    const crashClusterIds = clusterHrefs
        .map(href => {
            return (parseHash(href) as any).clusterName;
        });

    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
        await nextPageButton.click();
        await sleep(1000);
        return crashClusterIds.concat(
            await getCrashClusterIds(page)
        );
    } catch (err) {
        return crashClusterIds;
    }
}

async function readExceptionsFromCrashPage(page: Page, numExceptions: 'all' | number, pageNum: number = 0): Promise<Array<{ trace: string, title: string, device: string }>> {

    await page.waitForSelector('section[role=article] .gwt-HTML'); // loading
    await sleep(1000);

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
            await readExceptionsFromCrashPage(page, numExceptions, pageNum + 1)
        );
    } else {
        return [exception];
    }
}

async function readCrashClusters(page: Page): Promise<CrashCluster[]> {
    await page.waitForSelector('[data-type="errorLocation"]'); // loading
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

    await sleep(1000);
    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
    } catch (err) { /* NOOP */ }

    if (nextPageButton) {
        await nextPageButton.click();
        await sleep(1000);
        return crashClusters.concat(
            await readCrashClusters(page)
        );
    } else {
        return crashClusters;
    }
}
