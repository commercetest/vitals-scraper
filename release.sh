#!/bin/bash
git pull && \
npm run build && \
npm version patch && \
npm publish && \
git push && \
git push --tags