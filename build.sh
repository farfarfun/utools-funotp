#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
npm ci
npm test
npm run build

echo "构建完成，请在 uTools 开发者工具中导入：$(pwd)/plugin.json"
