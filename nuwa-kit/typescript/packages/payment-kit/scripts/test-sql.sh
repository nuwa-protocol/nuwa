#!/bin/bash

# SQL Storage Tests Runner
# Starts test database and runs SQL-specific tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Payment Kit SQL Storage Tests${NC}"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is required but not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is required but not installed${NC}"
    exit 1
fi

# Set test environment variables
export NODE_ENV=test
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5433
export TEST_DB_NAME=nuwa_test
export TEST_DB_USER=test_user
export TEST_DB_PASSWORD=test_password

# Function to cleanup on exit
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up test environment...${NC}"
    docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Start test database
echo -e "${YELLOW}🐘 Starting PostgreSQL test database...${NC}"
docker-compose -f docker-compose.test.yml up -d postgres-test

# Wait for database to be ready
echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
timeout=60
elapsed=0
while ! docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test_user -d nuwa_test > /dev/null 2>&1; do
    if [ $elapsed -ge $timeout ]; then
        echo -e "${RED}❌ Database failed to start within ${timeout} seconds${NC}"
        exit 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -n "."
done

echo -e "\n${GREEN}✅ Database is ready!${NC}"

# Run the tests
echo -e "${YELLOW}🧪 Running SQL storage tests...${NC}"
if npm test -- --testPathPattern="sql.*test" --verbose; then
    echo -e "${GREEN}✅ All SQL tests passed!${NC}"
else
    echo -e "${RED}❌ Some SQL tests failed${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 SQL Storage Tests Completed Successfully!${NC}" 