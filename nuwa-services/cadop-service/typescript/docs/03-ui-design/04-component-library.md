# 组件设计库

基于 shadcn/ui 的组件库设计，提供了一套完整的、可访问的、高性能的组件系统。

## 1. 基础组件

### 1.1 DID 显示组件
```typescript
import { Copy, QrCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface DIDDisplayProps {
  did: string;
  alias?: string;
  showCopy?: boolean;
  showQR?: boolean;
  shortForm?: boolean;
  sybilLevel?: 0 | 1 | 2 | 3 | 4;
  status?: 'active' | 'pending' | 'inactive' | 'error';
}

// [组件实现代码见原文档]
```

### 1.2 认证方式选择器
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

// [组件实现代码见原文档]
```

### 1.3 进度指示器
```typescript
interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  completedSteps: number[];
  className?: string;
}

// [组件实现代码见原文档]
```

### 1.4 Sybil 等级显示
```typescript
interface SybilLevelProps {
  level: 0 | 1 | 2 | 3 | 4;
  showDescription?: boolean;
  showProgress?: boolean;
  verificationMethods?: string[];
  className?: string;
}

// [组件实现代码见原文档]
```

## 2. 表单组件

### 2.1 验证状态输入框
```typescript
interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  validationState?: 'idle' | 'validating' | 'valid' | 'invalid';
  errorMessage?: string;
  successMessage?: string;
  helperText?: string;
}

// [组件实现代码见原文档]
```

### 2.2 认证方法卡片
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

// [组件实现代码见原文档]
```

## 3. 布局组件

### 3.1 页面容器
```typescript
interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

// [组件实现代码见原文档]
```

### 3.2 响应式网格
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

// [组件实现代码见原文档]
```

## 4. 交互组件

### 4.1 确认对话框
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

// [组件实现代码见原文档]
```

### 4.2 加载状态组件
```typescript
interface LoadingStateProps {
  type: 'spinner' | 'skeleton' | 'progress';
  text?: string;
  progress?: number;
  className?: string;
}

// [组件实现代码见原文档]
```

所有组件都支持深色模式，并遵循 Nuwa 的颜色和间距规范。完整的组件实现代码可以在原文档中找到。 