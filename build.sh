#!/bin/bash
rm -rf bin
tsc --build tsconfig.build.json
echo "#!/usr/bin/env node" | cat - ./bin/index.js > /tmp/vitalsscraper && mv /tmp/vitalsscraper ./bin/vitalsscraper