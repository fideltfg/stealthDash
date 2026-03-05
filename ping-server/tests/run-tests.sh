#!/bin/sh
#
# Run the StealthDash test suite
#
# Usage:
#   ./run-tests.sh              — Run all tests
#   ./run-tests.sh security     — Run security tests only
#   ./run-tests.sh routes       — Run route tests only
#   ./run-tests.sh --watch      — Run in watch mode
#

set -e

cd "$(dirname "$0")/.."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       🛡️  StealthDash Test Suite Runner              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Determine test pattern
TEST_PATTERN=""
EXTRA_ARGS=""

case "${1}" in
  security)
    TEST_PATTERN="tests/security"
    echo "🔒 Running security tests only..."
    ;;
  routes)
    TEST_PATTERN="tests/routes"
    echo "🛣️  Running route tests only..."
    ;;
  --watch)
    EXTRA_ARGS="--watch"
    echo "👀 Running in watch mode..."
    ;;
  *)
    echo "🧪 Running all tests..."
    ;;
esac

echo ""

# Run tests
npx jest ${TEST_PATTERN} \
  --config jest.config.js \
  --colors \
  --verbose \
  ${EXTRA_ARGS} \
  2>&1

EXIT_CODE=$?

echo ""
echo "─────────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Some tests failed (exit code: $EXIT_CODE)"
fi

echo ""
echo "📊 Reports available in: test-reports/"
echo "   • test-reports/latest-report.html  (HTML)"
echo "   • test-reports/test-results.json   (JSON)"
echo "   • coverage/                        (Coverage)"
echo ""

exit $EXIT_CODE
