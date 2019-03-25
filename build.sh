#!/bin/bash
rm -rf bin
tsc --build tsconfig.build.json
echo "#!/usr/bin/env node" | cat - ./bin/index.js > /tmp/mpscraper && mv /tmp/mpscraper ./bin/mpscraper