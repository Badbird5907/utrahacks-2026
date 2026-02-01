#!/bin/bash
# Run Snowflake connection with OCSP disabled
# This bypasses certificate validation that can hang

echo "Setting OCSP environment variables..."
export SF_OCSP_RESPONSE_CACHE_SERVER_ENABLED=false
export SF_OCSP_DO_RETRY=false

echo "Running minimal connection test..."
echo ""

npx tsx scripts/test-minimal-connection.ts
