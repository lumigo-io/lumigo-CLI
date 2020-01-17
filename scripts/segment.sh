#!/bin/bash
set -e
set -o pipefail

cd src/lib

echo "current path:" `pwd`
echo "injecting segment key"
PATTERN="<INSERT_SEGMENT_KEY>"
sed "s/${PATTERN}/${SEGMENT_KEY}/g" analytics.js >> analytics.js.tmp
mv analytics.js.tmp analytics.js
