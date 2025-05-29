# 可访问性设计

## 1. 键盘导航

### 1.1 焦点管理
```css
/* 焦点指示器 */
.focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
  border-radius: var(--radius);
}

/* 跳过链接 */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--background);
  color: var(--foreground);
  padding: 8px;
  text-decoration: none;
  border-radius: var(--radius);
  z-index: 1000;
}

.skip-link:focus {
  top: 6px;
}
```

### 1.2 键盘快捷键
```typescript
// 全局键盘快捷键
const keyboardShortcuts = {
  'Alt+1': '跳转到主导航',
  'Alt+2': '跳转到主内容',
  'Alt+3': '跳转到搜索',
  'Escape': '关闭模态框/下拉菜单',
  'Tab': '下一个可聚焦元素',
  'Shift+Tab': '上一个可聚焦元素',
  'Enter/Space': '激活按钮或链接',
  'Arrow Keys': '在菜单项间导航'
};

// [实现代码见原文档]
```

## 2. 屏幕阅读器支持

### 2.1 ARIA 标签和角色
```typescript
// 语义化组件示例
export function AccessibleCard({ 
  title, 
  description, 
  children, 
  role = 'article' 
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  role?: string;
}) {
  return (
    <Card role={role} aria-labelledby="card-title" aria-describedby="card-desc">
      <CardHeader>
        <CardTitle id="card-title">{title}</CardTitle>
        {description && (
          <CardDescription id="card-desc">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

// [更多实现代码见原文档]
```

### 2.2 屏幕阅读器专用内容
```css
/* 屏幕阅读器专用文本 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* [更多样式见原文档] */
```

## 3. 颜色对比和视觉设计

### 3.1 颜色对比度检查
```typescript
// 颜色对比度计算工具
export function calculateContrast(color1: string, color2: string): number {
  // 实现 WCAG 2.1 对比度计算
  // 返回对比度比值 (1:1 到 21:1)
}

// [更多实现代码见原文档]
```

### 3.2 高对比度模式支持
```css
/* 高对比度模式 */
@media (prefers-contrast: high) {
  :root {
    --background: #ffffff;
    --foreground: #000000;
    --border: #000000;
    --primary: #0000ff;
    --destructive: #ff0000;
  }
  
  // [更多样式见原文档]
}
```

## 4. 响应式设计和触摸友好

### 4.1 触摸目标尺寸
```css
/* 最小触摸目标 44px */
.touch-target {
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

// [更多样式见原文档]
```

### 4.2 移动端优化
```css
/* 移动端视口优化 */
@media (max-width: 640px) {
  /* 增大触摸目标 */
  .btn-mobile {
    min-height: 48px;
    font-size: 16px; /* 防止 iOS 缩放 */
  }
  
  // [更多样式见原文档]
}
```

## 5. 可访问性检查清单

### 5.1 开发阶段检查
- [ ] 所有交互元素可通过键盘访问
- [ ] 焦点顺序符合逻辑
- [ ] 所有图片有替代文本
- [ ] 表单控件有关联的标签
- [ ] 颜色对比度符合 WCAG 2.1 AA 标准
- [ ] 页面结构使用正确的标题层级
- [ ] 动态内容变化会通知屏幕阅读器
- [ ] 支持文本缩放至 200% 而不丢失功能

### 5.2 测试工具
- WAVE Web Accessibility Tool
- axe DevTools
- Lighthouse Accessibility Audit
- VoiceOver (macOS)
- NVDA (Windows)
- Color Contrast Analyzer

### 5.3 WCAG 2.1 符合性
- **感知性**: 信息和界面组件必须以可感知的方式呈现
- **可操作性**: 界面组件和导航必须可操作
- **可理解性**: 信息和界面操作必须可理解
- **稳健性**: 内容必须足够稳健，能被各种用户代理解释 