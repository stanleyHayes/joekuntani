#!/usr/bin/env bash

set -euo pipefail

repository_root=$(git rev-parse --show-toplevel)
generated_file="$repository_root/apps/web/lib/api/schema.d.ts"
temporary_directory=$(mktemp -d)
trap 'rm -rf "$temporary_directory"' EXIT

pnpm exec openapi-typescript \
  "$repository_root/contracts/openapi/openapi.yaml" \
  -o "$temporary_directory/schema.d.ts"

if ! cmp -s "$temporary_directory/schema.d.ts" "$generated_file"; then
  echo "Generated API types are stale. Run: pnpm contracts:generate" >&2
  diff -u "$generated_file" "$temporary_directory/schema.d.ts" || true
  exit 1
fi

echo "Generated API types match the OpenAPI source."
