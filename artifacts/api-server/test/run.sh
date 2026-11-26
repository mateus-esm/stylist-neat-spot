#!/usr/bin/env bash
set -euo pipefail

# Always create a fresh cluster. Never seed or clean up the app's database.
if ! command -v pg_ctl >/dev/null || ! command -v initdb >/dev/null; then
  echo "The clinic tests need PostgreSQL server tools (pg_ctl and initdb) on PATH." >&2
  exit 1
fi

work_dir=$(mktemp -d /tmp/clinic-tests.XXXXXXXX)
cleanup() {
  if ! pg_ctl -D "$work_dir/data" status >/dev/null 2>&1 ||
    pg_ctl -D "$work_dir/data" -m fast -w stop >/dev/null; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

initdb -D "$work_dir/data" -U clinic_test -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$work_dir/data" -l "$work_dir/postgres.log" \
  -o "-c listen_addresses='' -k $work_dir -p 5432" -w start >/dev/null

export CLINIC_TEST_DATABASE_URL="postgresql://clinic_test@localhost:5432/postgres?host=$work_dir&sslmode=disable"
DATABASE_URL="$CLINIC_TEST_DATABASE_URL" pnpm --filter @workspace/db run push
pnpm exec vitest "$@"
