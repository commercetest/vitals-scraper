# MP Scraper
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
vitals-scraper --accountId=XXX --packageName=XXX
```

### Options
- `--accountId` required
- `--packageName` required
- `--format` (default: `csv`)
- `--outDir` (default: `./`)
- `--parallel` (default: `1`)
- `--verbose` (default: `false`)


## Contributing
### Building
```bash
> npm run build
```

### Testing
```bash
> npm t
```

## License
[MIT](./LICENSE)