import minimist from 'minimist';
import { join } from 'path';
import { writeFileSync } from 'fs';

const start = Date.now();

process.on('exit', onExit);
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);

const argv = minimist(process.argv.slice(2));

if (!argv.data) {
    throw new Error(`No data argument set, this is required [--data=./file.json]`);
}
const dataPath = join(process.cwd(), argv.data);
console.info(`Reading data file from [${dataPath}]`);
let data = require(dataPath);

const crashes: ScrapeData = data.map((item: any) => {
    if (item['Last reported']) {
        item['Last reported'] = new Date(item['Last reported']);
    }
    return item;
});

interface ExceptionData {
    title: string;
    trace: string;
    device: string;
}

interface CrashData {
    'Reports': number;
    'Reports total': number;
    'Impacted users': number;
    'Last reported': Date;
    'By app version': {
        [versionId: string]: {
            'value': number,
            'percentage': number
        }
    };
    'By Android version': {
        [versionId: string]: {
            'value': number,
            'percentage': number
        }
    };
    'By device': {
        [deviceName: string]: {
            'value': number,
            'percentage': number
        }
    };
    'exceptions': ExceptionData[];
}

type ScrapeData = CrashData[];









console.info(`Found [${crashes.length}] crashes`);

// Sanity check data
const itemsWithNoReports = find(crashes, crash => !crash.Reports);
const itemsWithNoReportsTotal = find(crashes, crash => !crash['Reports total']);
const itemsWithNoImpactedUsers = find(crashes, crash => !crash['Impacted users']);
const itemsWithNoLastReported = find(crashes, crash => !crash['Last reported']);

console.assert(itemsWithNoReports.length === 0, 'All crashes have [Reports] field', itemsWithNoReports.length);
console.assert(itemsWithNoReportsTotal.length === 0, 'All crashes have [Reports Total] field', itemsWithNoReportsTotal.length);
console.assert(itemsWithNoImpactedUsers.length === 0, 'All crashes have [Impacted Users] field', itemsWithNoImpactedUsers.length);
console.assert(itemsWithNoLastReported.length === 0, 'All crashes have [Last Reported] field', itemsWithNoLastReported.length);

const recentItems = find(crashes, crash => crash['Last reported'] > new Date(Date.now() - 1000 * 60 * 60));
console.log('Recent Items:');
console.table(recentItems);

const manyReports = find(crashes, crash => crash.Reports > 600);
console.log('Many Reports:');
console.table(manyReports);

const totalReports = sum(crashes, 'Reports');
console.log(`Total number of reports is [${totalReports}]`);


const someCrashes = find(crashes, crash => crash.Reports > 500);
const newTabularOutput = pluck(someCrashes, { Reports: 'Reports', '182160-Percentage': 'By app version.182160.percentage', numExceptions: (c) => c.exceptions.length });

writeToCSV(`./playground-output-${Date.now()}.csv`, newTabularOutput);






type PluckFunc<T> = (c: T) => string | number | boolean | Date;
type PluckSource<T> = string | PluckFunc<T>;
interface PluckKeys<T> {
    [targetKey: string]: PluckSource<T>;
}
function pluck<T>(data: T[], keys: PluckKeys<T>) {
    return data.map(item => {
        return Object.entries(keys)
            .reduce((acc, [targetKey, source]) => {

                let value = null;
                if (typeof source === 'string') {
                    value = get(item, source);
                } else {
                    value = source(item);
                }

                return {
                    ...acc,
                    [targetKey]: value,
                };
            }, {});
    });
}

function find<T>(data: T[], predicate: (o: T) => boolean) {
    return data.filter(predicate);
}

function sum<T>(data: T[], path: string) {
    return data.reduce((acc, item) => {
        const val = get(item, path);
        const num = Number(val || 0);
        if (isNaN(num)) {
            throw new Error(`Trying to sum [${path}], but value [${val}] could not be turned into a number`);
        }
        return acc + num;
    }, 0);
}

function get<T extends any>(obj: any, key: string): T | null {
    if (!obj) {
        return null;
    }
    const dot = '.';
    let word = '';
    let value = obj;

    for (let char of key) {
        if (char != dot) {
            word += char;
        } else {
            value = value[word];
            if (value === undefined || value === null) return <any>value;
            word = '';
        }
    }
    return value[word];
}

function writeToCSV(filePath: string, data: Array<{ [key: string]: string | number | boolean | Date }>) {
    const outFilePath = join(process.cwd(), filePath);
    console.info(`Writing CSV data to [${outFilePath}]`);

    const keys = data.reduce((acc, item) => acc.concat(Object.keys(item)), []).sort().filter((a, i, arr) => a !== arr[i - 1]);
    const headerRow = keys.join(',');
    const dataRows = data.map(item => {
        return keys.map((key) => {
            return JSON.stringify(item[key]);
        }).join(',');
    }).join('\n');

    writeFileSync(
        outFilePath,
        headerRow + '\n' + dataRows,
        'utf8'
    );
}

function onExit() {
    const end = Date.now();

    console.log(`***\n\nExited after [${end - start}ms]\n\n***`);
}
