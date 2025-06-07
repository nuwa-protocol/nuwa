# 国际化支持

## 1. 多语言设计

### 1.1 支持的语言
```typescript
export const supportedLocales = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어'
} as const;

export type SupportedLocale = keyof typeof supportedLocales;
```

### 1.2 文本长度适配
```css
/* 文本长度变化适配 */
.text-adaptive {
  min-width: 0;
  word-break: break-word;
  hyphens: auto;
}

/* 不同语言的字体优化 */
:lang(zh) {
  font-family: 'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

:lang(ja) {
  font-family: 'Inter', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', sans-serif;
}

:lang(ko) {
  font-family: 'Inter', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
}

/* RTL 语言支持预留 */
[dir="rtl"] {
  text-align: right;
}

[dir="rtl"] .flex {
  flex-direction: row-reverse;
}
```

### 1.3 国际化组件
```typescript
import { useTranslation } from 'next-i18next';
import { format } from 'date-fns';
import { zhCN, enUS, ja, ko } from 'date-fns/locale';

export function LocalizedDate({ 
  date, 
  formatString = 'PPP' 
}: { 
  date: Date; 
  formatString?: string; 
}) {
  const { i18n } = useTranslation();
  
  const localeMap = {
    'zh-CN': zhCN,
    'zh-TW': zhCN,
    'en-US': enUS,
    'ja-JP': ja,
    'ko-KR': ko
  };
  
  const locale = localeMap[i18n.language as SupportedLocale] || enUS;
  
  return (
    <time dateTime={date.toISOString()}>
      {format(date, formatString, { locale })}
    </time>
  );
}

// [更多组件实现代码见原文档]
```

## 2. 文化适配

### 2.1 颜色文化差异
```typescript
// 不同文化的颜色含义
export const culturalColors = {
  'zh-CN': {
    success: 'oklch(0.646 0.222 41.116)', // 绿色 - 成功
    warning: 'oklch(0.828 0.189 84.429)', // 黄色 - 警告
    danger: 'oklch(0.577 0.245 27.325)',  // 红色 - 危险
    prosperity: 'oklch(0.577 0.245 27.325)', // 红色 - 繁荣(中国文化)
  },
  'en-US': {
    success: 'oklch(0.646 0.222 41.116)', // 绿色 - 成功
    warning: 'oklch(0.828 0.189 84.429)', // 黄色 - 警告  
    danger: 'oklch(0.577 0.245 27.325)',  // 红色 - 危险
    prosperity: 'oklch(0.646 0.222 41.116)', // 绿色 - 繁荣(西方文化)
  }
};
```

### 2.2 图标和符号适配
```typescript
// 文化适配的图标
export const culturalIcons = {
  'zh-CN': {
    currency: '¥',
    phone: '📱',
    success: '✅',
    warning: '⚠️'
  },
  'en-US': {
    currency: '$',
    phone: '📞',
    success: '✓',
    warning: '!'
  },
  'ja-JP': {
    currency: '¥',
    phone: '📱',
    success: '✅',
    warning: '⚠️'
  }
};
```

## 3. 本地化最佳实践

### 3.1 文本翻译原则
- 保持语言的自然性和地道性
- 考虑不同语言的语序差异
- 避免使用俚语和习语
- 保持专业术语的一致性
- 考虑文本长度的变化

### 3.2 数字和日期格式
```typescript
// 数字格式化
function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

// 货币格式化
function formatCurrency(value: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(value);
}

// 日期时间格式化
function formatDateTime(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
```

### 3.3 内容策略
- **图片和媒体**: 考虑不同地区的文化差异
- **布局适配**: 支持不同书写方向和文本长度
- **时区处理**: 显示用户本地时间
- **单位转换**: 根据地区显示适当的度量单位
- **法律合规**: 符合不同地区的隐私和数据保护要求

## 4. 测试和质量保证

### 4.1 本地化测试清单
- [ ] 所有文本正确翻译
- [ ] 日期和时间格式正确
- [ ] 货币符号和格式正确
- [ ] 数字格式符合本地习惯
- [ ] 布局适应不同语言
- [ ] 图标和符号文化适配
- [ ] 输入法和键盘支持
- [ ] 本地化性能测试

### 4.2 自动化测试
```typescript
// 本地化测试工具
interface LocalizationTest {
  locale: string;
  testCases: {
    key: string;
    expected: string;
    description: string;
  }[];
}

// 示例测试用例
const zhCNTests: LocalizationTest = {
  locale: 'zh-CN',
  testCases: [
    {
      key: 'welcome',
      expected: '欢迎使用',
      description: '欢迎文本测试'
    },
    {
      key: 'date',
      expected: '2024年1月23日',
      description: '日期格式测试'
    }
  ]
};

// [更多测试代码见原文档]
``` 