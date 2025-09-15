/**
 * Cloudflare Worker for MCP Gateway
 * 
 * 这个 Worker 将根据子域名路由请求到对应的 MCP 实例
 * 部署到 Cloudflare Workers，几乎免费且无需维护服务器
 */

// MCP 实例配置
const MCP_INSTANCES = {
  'amap': 'https://amap-proxy.railway.app',
  'context7': 'https://context7-proxy.railway.app',
  'github': 'https://github-proxy.railway.app',
  // 添加更多实例...
};

// 默认目标（可选）
const DEFAULT_TARGET = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    // 提取子域名
    const subdomain = extractSubdomain(hostname);
    
    // 处理网关管理端点
    if (url.pathname.startsWith('/gateway/')) {
      return handleGatewayEndpoints(url.pathname, request);
    }
    
    // 路由到对应实例
    const targetUrl = getTargetUrl(subdomain);
    if (!targetUrl) {
      return new Response(JSON.stringify({
        error: `No instance configured for subdomain: ${subdomain}`,
        availableSubdomains: Object.keys(MCP_INSTANCES),
        gateway: 'MCP Gateway (Cloudflare Workers)'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 转发请求
    return forwardRequest(request, targetUrl);
  }
};

/**
 * 提取子域名
 */
function extractSubdomain(hostname) {
  // 假设基础域名是 mcpproxy.xyz
  const baseDomain = 'mcpproxy.xyz';
  
  if (hostname === baseDomain) {
    return null; // 根域名
  }
  
  if (hostname.endsWith('.' + baseDomain)) {
    const subdomain = hostname.replace('.' + baseDomain, '');
    return subdomain;
  }
  
  return null;
}

/**
 * 获取目标 URL
 */
function getTargetUrl(subdomain) {
  if (!subdomain) {
    return DEFAULT_TARGET;
  }
  
  return MCP_INSTANCES[subdomain];
}

/**
 * 转发请求到目标服务
 */
async function forwardRequest(request, targetUrl) {
  const url = new URL(request.url);
  const targetURL = new URL(url.pathname + url.search, targetUrl);
  
  // 创建新的请求
  const modifiedRequest = new Request(targetURL.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  
  // 添加转发头
  modifiedRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  modifiedRequest.headers.set('X-Forwarded-Proto', 'https');
  modifiedRequest.headers.set('X-Forwarded-Host', url.hostname);
  
  try {
    const response = await fetch(modifiedRequest);
    
    // 创建新的响应，保持原有头部
    const modifiedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
    // 添加 CORS 头（如果需要）
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return modifiedResponse;
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Bad Gateway',
      message: 'Failed to proxy request to upstream server',
      target: targetUrl,
      details: error.message
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理网关管理端点
 */
function handleGatewayEndpoints(pathname, request) {
  switch (pathname) {
    case '/gateway/status':
      return new Response(JSON.stringify({
        gateway: {
          version: '1.0.0',
          platform: 'Cloudflare Workers',
          baseDomain: 'mcpproxy.xyz',
          instanceCount: Object.keys(MCP_INSTANCES).length,
        },
        instances: Object.entries(MCP_INSTANCES).map(([subdomain, targetUrl]) => ({
          name: `${subdomain}-proxy`,
          subdomain,
          targetUrl,
          url: `https://${subdomain}.mcpproxy.xyz`,
          enabled: true,
        })),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    case '/gateway/instances':
      return new Response(JSON.stringify({
        baseDomain: 'mcpproxy.xyz',
        instances: Object.entries(MCP_INSTANCES).map(([subdomain, targetUrl]) => ({
          name: `${subdomain}-proxy`,
          subdomain,
          url: `https://${subdomain}.mcpproxy.xyz`,
          targetUrl,
          enabled: true,
        })),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    case '/gateway/health':
      return new Response(JSON.stringify({
        status: 'healthy',
        platform: 'Cloudflare Workers',
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    default:
      return new Response('Not Found', { status: 404 });
  }
}
