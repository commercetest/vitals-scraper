import puppeteer, { Page, Browser } from 'puppeteer';
import { fallbackPromise } from './utils';

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

    public async getVitalsOverview() {
        const page = await this.claimPage();
        try {
            await page.goto(`https://play.google.com/apps/publish/?account=${this.accountId}#AppHealthDetailsPlace:p=${this.packageName}&aho=APP_HEALTH_OVERVIEW&ahdt=CRASHES&ts=THIRTY_DAYS&ahbt=BOOKS_AND_REFERENCE`, { waitUntil: 'networkidle0' });
            const tableEl = await page.evaluateHandle(`document.querySelector("body > div:nth-child(5) > div > div:nth-child(2) > div > div:nth-child(2) > div > div.NNCHDVB-T-c > div > div.NNCHDVB-G-m > div > div:nth-child(1) > div > div > div.NNCHDVB-j-z > div:nth-child(2) > fox-app-health-details").shadowRoot.querySelector("div > fox-loading-overlay > fox-app-health-details-breakdown:nth-child(4)").shadowRoot.querySelector("fox-dashboard-async-card > fox-app-health-details-table").shadowRoot.querySelector("table")`);
            const columnTitles: string[] = await tableEl.asElement().$$eval('thead th', els => els.map(th => th.innerText.trim()).filter(a => a)) as any;
            const rows = await tableEl.asElement().$$('tbody tr');

            const androidVersions: AndroidVersion[] = await Promise.all(
                rows.map(async row => {
                    const cells: string[] = await row.$$eval('th,td', els => els.map(el => el.innerText.trim())) as any;
                    const ret: AndroidVersion = columnTitles.reduce((acc: any, key, index) => {
                        acc[key] = cells[index];
                        return acc;
                    }, {});
                    const crashUrl: string = await row.$eval('.related-link', el => el.href) as any;
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

async function readCrashClusters(page: Page): Promise<CrashCluster[]> {
    await page.waitForSelector('[data-type="errorLocation"]'); // loading
    const tableEl = await page.$(`section table`);
    const rows = await tableEl.asElement().$$('tbody tr');

    const crashClusters: CrashCluster[] = await Promise.all(
        rows.map(async row => {
            const cells: string[] = await row.$$eval('th,td', els => els.map(el => el.innerText.trim())) as any;
            const description = await fallbackPromise(row.$eval('[data-type="errorDescription"]', el => el.innerText) as any, '');
            const location = await fallbackPromise(row.$eval('[data-type="errorLocation"]', el => el.innerText) as any, '');
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
