#!/bin/bash

# verification_custom.sh
# Verifies that the expected security headers are present

URL="http://localhost:3000"

echo "Testing security headers on $URL..."

HEADERS=$(curl -s -I "$URL")

# Function to check header
check_header() {
    HEADER_NAME=$1
    HEADER_VALUE=$2
    if echo "$HEADERS" | grep -i "$HEADER_NAME" > /dev/null; then
        echo "✅ $HEADER_NAME found"
        if [ ! -z "$HEADER_VALUE" ]; then
             if echo "$HEADERS" | grep -i "$HEADER_VALUE" > /dev/null; then
                  echo "   - Value match: OK"
             else
                  echo "   ⚠️ Value mismatch. Expected containing: $HEADER_VALUE"
                  echo "   Actual: $(echo "$HEADERS" | grep -i "$HEADER_NAME")"
             fi
        fi
    else
        echo "❌ $HEADER_NAME MISSING"
    fi
}

check_header "Strict-Transport-Security" "max-age=63072000"
check_header "X-Frame-Options" "SAMEORIGIN"
check_header "X-Content-Type-Options" "nosniff"
check_header "X-XSS-Protection" "1; mode=block"
check_header "Referrer-Policy" "strict-origin-when-cross-origin"

echo "Done."
