import puppeteer, { Page, Browser } from 'puppeteer';
import { fallbackPromise, sleep } from './utils';

export class Downloader {
    private browser: Browser;
    private pages: Page[] = [];
    private parallel: number = 1;
    private accountId: string;
    private packageName: string;

    constructor(parallel: number, packageName: string, accountId: string) {
        this.parallel = Math.abs(Math.max(1, parallel));
        this.accountId = accountId;
        this.packageName = packageName;
    }

    public async init() {
        this.browser = await puppeteer.launch({ headless: false });

        for (let i = 0; i < this.parallel; i++) {
            this.pages.push(await this.browser.newPage());
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
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}&appVersion&lastReportedRange=LAST_60_DAYS`);
            const crashClusterIds = await getCrashClusterIds(page);

            return crashClusterIds;
        } finally {
            this.releasePage(page);
        }
    }

    public async getCrashCluster(clusterId: string) {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}&appVersion&lastReportedRange=LAST_60_DAYS&clusterName=${clusterId}&detailsAppVersion`)
            await page.waitForSelector('.gwt-viz-container'); // loading
            // const summaryItems = [...await page.$$('body > div:nth-child(7) > div > div:nth-child(2) > div > div:nth-child(2) > div > div.IP4Y5NB-T-c > div > div.IP4Y5NB-G-m > div > div:nth-child(1) > div > div > div.IP4Y5NB-j-z.IP4Y5NB-j-U > div:nth-child(2) > section > div.IP4Y5NB-E-h.IP4Y5NB-j-E.IP4Y5NB-jj-a > div')]
            const summaryData: any = await page.$$eval('[role=article]', els => {
                const summaryItemsCont = els[0] as any;
                const summaryItems = [...summaryItemsCont.children];
                const data = summaryItems
                    .map((el: any) => [...el.querySelectorAll('.gwt-Label')].map((el: any) => el.textContent).slice(0, 2))
                    .reduce((acc, [key, value]) => {
                        return {
                            ...acc,
                            [key]: value
                        };
                    }, {});
                return data;
            });

            // Trigger show all items
            await page.$$eval('body > div:nth-child(7) > div > div:nth-child(2) > div > div:nth-child(2) > div > div.IP4Y5NB-T-c > div > div.IP4Y5NB-G-m > div > div:nth-child(1) > div > div > div.IP4Y5NB-j-z.IP4Y5NB-j-U > div:nth-child(2) > section > div:nth-child(5) > div.IP4Y5NB-E-d .gwt-Anchor', els => els.forEach((el: any) => el.click()));

            const detailData = await page.$$eval('[role=article]', articles => {
                return articles.slice(2, 5)
                    .reduce((acc, el) => {
                        const title = el.querySelector('h3').textContent;
                        const table = [...el.querySelectorAll('table') as any].slice(-1)[0];

                        const tableData = [...table.querySelectorAll('tr')]
                            .reduce((acc, row) => {
                                const [key, value, percentage] = [...row.querySelectorAll('td')].map(el => el.textContent);

                                return {
                                    ...acc,
                                    [key]: { value, percentage }
                                };
                            }, {});

                        return {
                            ...acc,
                            [title]: tableData
                        };
                    }, {});
            });

            return {
                ...summaryData,
                ...detailData,
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
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AndroidMetricsErrorsPlace:p=${this.packageName}&lastReportedRange=LAST_60_DAYS&appVersion&androidVersion=${androidVersion.androidVersion}`, { waitUntil: 'networkidle0' });
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

    private async claimPage(): Promise<Page> {
        const unusedPages = this.pages.filter((p: any) => !p.claimed);
        if (unusedPages.length) {
            const page = unusedPages[0];
            (page as any).claimed = true;
            return page;
        } else {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.claimPage().then(resolve, reject);
                }, 100);
            });
        }
    }

    private async releasePage(page: Page) {
        (page as any).claimed = false;
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
    } catch (err) { /* NOOP */ }

    if (nextPageButton) {
        await nextPageButton.click();
        await page.waitFor(1000);
        return crashClusterIds.concat(
            await getCrashClusterIds(page)
        );
    } else {
        return crashClusterIds;
    }
}

// async function getCrashClusterTraces(page:Page): Promise<any> {

// }

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

    let nextPageButton;
    try {
        nextPageButton = await page.$('[aria-label="Next page"]:not(:disabled)');
    } catch (err) { /* NOOP */ }

    if (nextPageButton) {
        await nextPageButton.click();
        await page.waitFor(1000);
        return crashClusters.concat(
            await readCrashClusters(page)
        );
    } else {
        return crashClusters;
    }
}
