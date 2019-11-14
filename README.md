# Vitals Scraper
![npm](https://img.shields.io/npm/v/vitals-scraper.svg)
[![Build Status](https://travis-ci.org/commercetest/vitals-scraper.svg?branch=master)](https://travis-ci.org/commercetest/vitals-scraper)
[![codecov](https://codecov.io/gh/commercetest/vitals-scraper/branch/master/graph/badge.svg)](https://codecov.io/gh/commercetest/vitals-scraper)
[![CodeFactor](https://www.codefactor.io/repository/github/commercetest/vitals-scraper/badge)](https://www.codefactor.io/repository/github/commercetest/vitals-scraper)
![NPM License](https://img.shields.io/npm/l/vitals-scraper.svg)

> 🤖 A simple Android Vitals scraper

## Usage
```bash
# Install
npm i -g vitals-scraper

# Run
vitals-scraper --accountId=XXX --packageName=XXX --mode=overview
```
The program can run in two modes: 

1. to obtain an overview of various data about one or more of the apps on your Google Play developer account. The program outputs a csv file of summary data together with several screenshots of various reports per app you specify.
2. to download error data for one or more of your apps on your Google Play developer account. for the Java packagenames specified in the `--packageName` command-line parameter. 

### Options
- `--accountId` required
- `--packageName` required (`*` would download data for all the apps on the account)
- `--days` (default `7`)
- `--mode` (default `errors`)
- `--errorType` (default `crash,ANR`)
- `--numExceptions=2` (default `all`)
- `--format` (default: `csv`)
- `--outDir` (default: `./`)
- `--parallel` (default: `1`)
- `--verbose` (default: `false`)

### Examples of command-lines
`npm run start:dev -- --accountId=<add-your-accountId> --mode=overview`

## Contributing
### Running
#### VSCode Debugger
If you use VSCode, there is a pre-configured launch config: [`.vscode/launch.json`](.vscode/launch.json). Note: this contains several examples of how to run the program so it may be worth reading even if you are not using VSCode.

This is preferable as no compilation step is required, and breakpoints can be used.

#### CLI
CLI typescript execution is provided by the `start:dev` npm script in [`package.json`](package.json). When executing with these scripts, `--` is required to tell bash to pass on the arguments.

E.g.
```bash
> npm run start:dev -- --accountId=XXX --packageName=XXX --format=json
```

### Data Playground
There is a data playground.
If you have VSCode installed, there is a preset in `.vscode/launch.json` which allows you to debug your data processing code.
Otherwise, you can call it form the command line like so:

```bash
> npm run playground -- --data=./android-crash-clusters_1557226424411.json
```

### Building
```bash
> npm install
> npm run build
```

### Testing
```bash
> npm t
```

### Installing modified version
```bash
> npm run build && npm i -g .
```

## License
[MIT](./LICENSE)

## Learn more
A helpful article provides an overview and a worked example of using a similar approach that scrapes a booking website and generates JSON results. https://www.scrapehero.com/how-to-build-a-web-scraper-using-puppeteer-and-node-js/
