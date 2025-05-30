# 组件设计库

基于 shadcn/ui 的组件库设计，提供了一套完整的、可访问的、高性能的组件系统。

## 1. 组件库架构

### 1.1 技术栈
- shadcn/ui：基础组件库
- Tailwind CSS：样式系统
- Radix UI：无障碍组件基础
- Lucide Icons：图标系统

### 1.2 组件分类
1. 基础组件（shadcn/ui）
   - Button：按钮
   - Card：卡片
   - Badge：徽章
   - Dialog：对话框
   - Input：输入框
   - Select：选择框

2. 业务组件
   - DID 显示组件（已实现）
   - 认证方式选择器（待实现）
   - 进度指示器（待实现）
   - Sybil 等级显示（待实现）

3. 表单组件（待实现）
   - 验证状态输入框
   - 认证方法卡片

4. 布局组件（待实现）
   - 页面容器
   - 响应式网格

5. 交互组件（待实现）
   - 确认对话框
   - 加载状态组件

## 2. 组件使用指南

### 2.1 基础组件使用

所有基础组件都可以通过 `@/components/ui` 导入：

```typescript
import { Button, Card, Badge, Dialog, Input, Select } from "@/components/ui";
```

### 2.2 DID 显示组件

DID 显示组件用于展示 DID 信息，支持复制、QR 码显示和外部链接：

```typescript
import { DIDDisplay } from "@/components/ui";

// 基础用法
<DIDDisplay did="did:rooch:0x123..." />

// 完整功能
<DIDDisplay
  did="did:rooch:0x123..."
  alias="My DID"
  showCopy={true}
  showQR={true}
  shortForm={true}
  sybilLevel={2}
  status="active"
/>
```

## 3. 待实现组件规范

### 3.1 认证方式选择器
```typescript
interface AuthMethod {
  id: string;
  type: 'passkey' | 'wallet' | 'email' | 'phone' | 'github' | 'twitter';
  title: string;
  description: string;
  sybilLevel: number;
  recommended?: boolean;
  icon: React.ReactNode;
  benefits: string[];
}
```

### 3.2 进度指示器
```typescript
interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  completedSteps: number[];
  className?: string;
}
```

### 3.3 Sybil 等级显示
```typescript
interface SybilLevelProps {
  level: 0 | 1 | 2 | 3 | 4;
  showDescription?: boolean;
  showProgress?: boolean;
  verificationMethods?: string[];
  className?: string;
}
```

### 3.4 验证状态输入框
```typescript
interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  validationState?: 'idle' | 'validating' | 'valid' | 'invalid';
  errorMessage?: string;
  successMessage?: string;
  helperText?: string;
}
```

### 3.5 认证方法卡片
```typescript
interface AuthMethodCardProps {
  method: {
    id: string;
    name: string;
    description: string;
    status: 'verified' | 'pending' | 'failed' | 'not_started';
    verifiedAt?: string;
    sybilLevel: number;
    icon: React.ReactNode;
  };
  onAction: (action: 'verify' | 'retry' | 'remove') => void;
}
```

### 3.6 页面容器
```typescript
interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}
```

### 3.7 响应式网格
```typescript
interface ResponsiveGridProps {
  children: React.ReactNode;
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: number;
  className?: string;
}
```

### 3.8 确认对话框
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  type?: 'info' | 'warning' | 'danger';
}
```

### 3.9 加载状态组件
```typescript
interface LoadingStateProps {
  type: 'spinner' | 'skeleton' | 'progress';
  text?: string;
  progress?: number;
  className?: string;
}
```

## 4. 开发指南

### 4.1 新增组件步骤
1. 在 `src/components` 目录下创建组件文件
2. 使用 shadcn/ui 的基础组件进行组合
3. 遵循 TypeScript 类型定义
4. 添加适当的测试用例
5. 在 `src/components/ui/index.ts` 中导出组件

### 4.2 样式指南
1. 优先使用 Tailwind CSS 类名
2. 遵循项目的颜色系统
3. 确保组件在暗色模式下正常工作
4. 保持响应式设计

### 4.3 可访问性要求
1. 所有组件必须支持键盘导航
2. 提供适当的 ARIA 标签
3. 确保颜色对比度符合 WCAG 标准
4. 支持屏幕阅读器

所有组件都支持深色模式，并遵循 Nuwa 的颜色和间距规范。完整的组件实现代码可以在原文档中找到。 