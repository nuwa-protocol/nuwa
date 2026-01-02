# MCP Engine Canary Rollout Guide

This document describes how to perform canary rollouts and rollbacks for the MCP engine in `mcp-server-proxy`.

## Background

The `mcp-server-proxy` service supports two MCP engines:
- **fastmcp** (default): The FastMCP engine
- **sdk**: The official MCP SDK engine

The `MCP_ENGINE` configuration allows safe service-level canary deployment of the new SDK engine.

## Configuration Methods

The MCP engine can be configured via three methods (priority from high to low):

1. **Command-line argument**: `--engine <value>`
2. **Environment variable**: `MCP_ENGINE=<value>`
3. **Configuration file**: `engine: <value>` in `config.yaml`

### Valid Values

- `fastmcp` or `legacy`: Use FastMCP engine (default)
- `sdk` or `official`: Use official MCP SDK engine

## Canary Rollout Procedure

### Phase 1: Enable SDK Engine for Testing

1. **Update environment variable** in your deployment:
   ```bash
   export MCP_ENGINE=sdk
   ```
   Or set via deployment platform (e.g., Railway, Docker env var).

2. **Restart the service** to apply the change:
   ```bash
   # For local testing
   node server.js --engine sdk

   # With existing config
   MCP_ENGINE=sdk node server.js
   ```

3. **Verify service health** (see Monitoring section below).

### Phase 2: Gradual Rollout

For production deployments, use a gradual rollout strategy:

1. **Deploy to test/staging environment first** with `MCP_ENGINE=sdk`
2. **Monitor metrics and logs** for 24-48 hours
3. **Roll out to production** using your platform's canary deployment features:
   - Set `MCP_ENGINE=sdk` for a percentage of traffic
   - Gradually increase the percentage (e.g., 10% → 50% → 100%)
   - Monitor at each stage before proceeding

### Phase 3: Full Rollout

Once confident in the SDK engine stability:

1. **Update all deployments** to use `MCP_ENGINE=sdk`
2. **Monitor for 1-2 weeks** to ensure stability
3. **Consider making SDK the default** in future releases

## Rollback Procedure

If issues are detected with the SDK engine:

### Immediate Rollback

1. **Revert the engine configuration**:
   ```bash
   # Change environment variable back
   export MCP_ENGINE=fastmcp

   # Or restart with fastmcp explicitly
   node server.js --engine fastmcp
   ```

2. **Restart the service** to apply the change.

3. **Verify service recovery** (see Monitoring section below).

### Automated Rollback

For production deployments, consider automated rollback triggers:

- **Error rate threshold**: If error rate exceeds X% for Y minutes
- **Latency threshold**: If p95 latency exceeds Z ms
- **Alert integration**: Link monitoring alerts to automated rollback scripts

Example rollback script:
```bash
#!/bin/bash
# rollback-sdk-engine.sh

# Check error rate (pseudo-code)
ERROR_RATE=$(get_metric_error_rate)

if [ "$ERROR_RATE" -gt 5 ]; then
  echo "Error rate too high, rolling back to fastmcp..."
  export MCP_ENGINE=fastmcp
  systemctl restart mcp-server-proxy
  echo "Rollback complete"
fi
```

## Monitoring

### Key Metrics to Watch

1. **Error Rate**: Monitor for increases in 5xx errors or failed tool executions
2. **Latency**: Compare p50, p95, p99 latency between engines
3. **Request Success Rate**: Ensure all MCP tools are working correctly
4. **Resource Usage**: CPU and memory consumption differences
5. **Upstream Connection Health**: Ensure upstream MCP server connections remain stable

### Log Analysis

Watch for these log patterns:

**Success indicators**:
```
✅ Successfully loaded service key
MCP Server started on http://localhost:8088/mcp
Forwarding tool <tool-name> to upstream
```

**Error indicators**:
```
❌ Error: Failed to load service key
Failed to register upstream tools
Error during server shutdown
```

### Health Checks

If your deployment exposes HTTP health check endpoints, you can verify service status with commands like:

```bash
# Example basic health check (replace host/port/path with your configuration)
curl http://localhost:8088/health

# Example MCP endpoint check (replace host/port/path with your configuration)
curl http://localhost:8088/mcp
```

## Configuration Examples

### Local Development

```bash
# Use SDK engine for testing
MCP_ENGINE=sdk node server.js

# Or via CLI
node server.js --engine sdk
```

### Docker Deployment

```yaml
# docker-compose.yml
services:
  mcp-server-proxy:
    image: nuwa-mcp-server-proxy:latest
    environment:
      - MCP_ENGINE=sdk  # Canary: SDK engine
      - PORT=8088
      - SERVICE_ID=your-service-id
```

### Railway/Platform Deployment

Set environment variable in your deployment dashboard:
```
MCP_ENGINE = sdk
```

### Config File

```yaml
# config.yaml
engine: sdk  # or 'fastmcp'
port: 8088
endpoint: /mcp
serviceId: your-service-id
```

## Troubleshooting

### Issue: Service fails to start with SDK engine

**Symptoms**: Service crashes immediately after enabling SDK engine

**Solutions**:
1. Check logs for specific error messages
2. Verify all tool schemas are compatible with SDK engine
3. Ensure upstream server is reachable and healthy
4. Try rollback to fastmcp immediately

### Issue: Increased latency after rollout

**Symptoms**: p95/p99 latency increases significantly

**Solutions**:
1. Profile the service to identify bottlenecks
2. Check if specific tools are causing issues
3. Consider partial rollback (roll back only affected services)
4. Report issue if SDK engine has performance regression

### Issue: Tools not working correctly

**Symptoms**: Specific tools fail or return incorrect results

**Solutions**:
1. Check tool schema compatibility between engines
2. Verify upstream server is functioning correctly
3. Test with fastmcp to isolate the issue
4. Check if tool parameters are being passed correctly

## Communication

When performing canary rollouts:

1. **Notify team** before starting rollout
2. **Document findings** in shared doc or issue tracker
3. **Report issues** immediately to engineering team
4. **Share metrics** after each phase of rollout

## Related Issues

- Parent issue: #485
- Canary rollout issue: #486

## Additional Resources

- [MCP Server Proxy README](../README.md)
- [Deployment Guide](../deployments/README.md)
- [Design Documentation](./DESIGN.md)
