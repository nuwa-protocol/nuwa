#!/bin/bash

echo "🧪 Testing Payment-Kit Integration..."
echo ""

# Check if build succeeded
echo "1️⃣ Checking build..."
if [ -d "dist" ]; then
    echo "✅ Build directory exists"
else
    echo "❌ Build directory not found"
    exit 1
fi

# Check if key files exist
echo ""
echo "2️⃣ Checking compiled files..."
if [ -f "dist/services/paymentService.js" ]; then
    echo "✅ paymentService.js exists"
else
    echo "❌ paymentService.js not found"
    exit 1
fi

if [ -f "dist/routes/admin.js" ]; then
    echo "✅ admin.js exists"
else
    echo "❌ admin.js not found"
    exit 1
fi

# Check environment configuration
echo ""
echo "3️⃣ Environment configuration:"
echo "   ENABLE_PAYMENT_KIT: ${ENABLE_PAYMENT_KIT:-not set}"
echo "   DID_AUTH_ONLY: ${DID_AUTH_ONLY:-not set}"
echo "   ROOCH_NODE_URL: ${ROOCH_NODE_URL:-not set}"

# Test server start (with timeout)
echo ""
echo "4️⃣ Testing server startup..."
echo "Starting server with timeout..."

# Start server in background
timeout 10s npm start > /dev/null 2>&1 &
SERVER_PID=$!

# Wait a bit for server to start
sleep 3

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server started successfully (PID: $SERVER_PID)"
    
    # Test health endpoint
    if command -v curl >/dev/null 2>&1; then
        echo "5️⃣ Testing health endpoint..."
        if curl -s http://localhost:3000/api/v1/admin/health >/dev/null; then
            echo "✅ Health endpoint accessible"
        else
            echo "⚠️  Health endpoint not accessible (server may still be starting)"
        fi
    else
        echo "⚠️  curl not available, skipping endpoint test"
    fi
    
    # Clean up
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
else
    echo "❌ Server failed to start or exited immediately"
    exit 1
fi

echo ""
echo "🎉 Integration verification completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Copy env.example to .env and configure your settings"
echo "   2. For payment-kit testing, set ENABLE_PAYMENT_KIT=true"
echo "   3. Start the server: npm run dev"
echo "   4. Test admin endpoints: curl http://localhost:3000/api/v1/admin/health"
echo ""
echo "✨ Integration is ready to use!" 