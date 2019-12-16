#!/bin/bash
set -e
set -o pipefail

npm run test:lint
npm run prettier:ci
npm run test
