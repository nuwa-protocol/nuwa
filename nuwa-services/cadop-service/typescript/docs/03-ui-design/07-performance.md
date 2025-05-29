# 性能优化

## 1. 加载优化

### 1.1 代码分割和懒加载
```typescript
// 路由级别的代码分割
import { lazy, Suspense } from 'react';
import { LoadingState } from '@/components/ui/loading-state';

const DIDCreationPage = lazy(() => import('@/pages/did-creation'));
const DIDManagementPage = lazy(() => import('@/pages/did-management'));
const AuthenticationPage = lazy(() => import('@/pages/authentication'));

export function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route 
          path="/create-did" 
          element={
            <Suspense fallback={<LoadingState type="skeleton" />}>
              <DIDCreationPage />
            </Suspense>
          } 
        />
        <Route 
          path="/manage-did" 
          element={
            <Suspense fallback={<LoadingState type="skeleton" />}>
              <DIDManagementPage />
            </Suspense>
          } 
        />
      </Routes>
    </Router>
  );
}

// 组件级别的懒加载
const HeavyComponent = lazy(() => 
  import('@/components/heavy-component').then(module => ({
    default: module.HeavyComponent
  }))
);
```

### 1.2 图片优化
```typescript
import Image from 'next/image';

// 响应式图片组件
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    />
  );
}
```

## 2. 渲染优化

### 2.1 虚拟化长列表
```typescript
import { FixedSizeList as List } from 'react-window';

interface VirtualizedListProps {
  items: any[];
  itemHeight: number;
  height: number;
  renderItem: ({ index, style }: { index: number; style: React.CSSProperties }) => React.ReactNode;
}

export function VirtualizedList({ 
  items, 
  itemHeight, 
  height, 
  renderItem 
}: VirtualizedListProps) {
  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      itemData={items}
    >
      {renderItem}
    </List>
  );
}

// 使用示例：DID 列表虚拟化
export function DIDList({ dids }: { dids: DID[] }) {
  const renderDIDItem = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <DIDDisplay did={dids[index]} />
    </div>
  );

  return (
    <VirtualizedList
      items={dids}
      itemHeight={120}
      height={600}
      renderItem={renderDIDItem}
    />
  );
}
```

### 2.2 防抖和节流
```typescript
import { useMemo, useCallback } from 'react';
import { debounce, throttle } from 'lodash-es';

// 搜索防抖
export function useSearchDebounce(
  searchFn: (query: string) => void,
  delay: number = 300
) {
  return useMemo(
    () => debounce(searchFn, delay),
    [searchFn, delay]
  );
}

// 滚动节流
export function useScrollThrottle(
  scrollFn: () => void,
  delay: number = 100
) {
  return useMemo(
    () => throttle(scrollFn, delay),
    [scrollFn, delay]
  );
}

// [更多实现代码见原文档]
```

## 3. 缓存策略

### 3.1 React Query 缓存
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// DID 数据缓存
export function useDIDList() {
  return useQuery({
    queryKey: ['dids'],
    queryFn: fetchDIDList,
    staleTime: 5 * 60 * 1000, // 5分钟
    cacheTime: 10 * 60 * 1000, // 10分钟
  });
}

// 认证状态缓存
export function useAuthStatus(didId: string) {
  return useQuery({
    queryKey: ['auth-status', didId],
    queryFn: () => fetchAuthStatus(didId),
    staleTime: 1 * 60 * 1000, // 1分钟
    refetchInterval: 30 * 1000, // 30秒轮询
  });
}

// 乐观更新
export function useUpdateDID() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateDID,
    onMutate: async (newDID) => {
      await queryClient.cancelQueries({ queryKey: ['dids'] });
      const previousDIDs = queryClient.getQueryData(['dids']);
      queryClient.setQueryData(['dids'], (old: DID[]) =>
        old.map(did => did.id === newDID.id ? { ...did, ...newDID } : did)
      );
      return { previousDIDs };
    },
    onError: (err, newDID, context) => {
      queryClient.setQueryData(['dids'], context?.previousDIDs);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['dids'] });
    },
  });
}
```

### 3.2 Service Worker 缓存
```typescript
// service-worker.ts
const CACHE_NAME = 'cadop-ui-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
```

## 4. 性能监控和优化

### 4.1 性能指标
- **First Contentful Paint (FCP)**: < 1.8s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1
- **Time to Interactive (TTI)**: < 3.8s

### 4.2 性能监控工具
```typescript
// Web Vitals 监控
import { onCLS, onFID, onLCP } from 'web-vitals';

function sendToAnalytics({ name, delta, id }: any) {
  // 发送性能数据到分析服务
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
```

### 4.3 优化清单
- [ ] 使用代码分割和懒加载
- [ ] 优化图片加载和大小
- [ ] 实现虚拟滚动
- [ ] 使用防抖和节流
- [ ] 配置适当的缓存策略
- [ ] 监控关键性能指标
- [ ] 定期进行性能审计
- [ ] 优化第三方依赖 