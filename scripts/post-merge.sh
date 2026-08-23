#!/bin/bash
set -e

pnpm install --frozen-lockfile

# push-force لا يطلب تأكيداً تفاعلياً — آمن في بيئة CI
pnpm --filter db push-force
