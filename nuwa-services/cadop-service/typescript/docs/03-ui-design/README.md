# CADOP Service UI 设计文档

本文档集合包含了 CADOP Service 的完整 UI 设计规范。基于 [Nuwa.dev](https://nuwa.dev/) 的设计系统，提供了现代化、可访问、高性能的用户体验。

## 文档结构

1. [概述与设计原则](./01-overview.md)
   - 设计目标
   - 设计原则
   - 整体布局

2. [页面结构设计](./02-page-structure.md)
   - 首页/Dashboard
   - DID 创建流程
   - DID 管理页面
   - 身份验证管理
   - 设置页面
   - 移动端适配

3. [Sybil 防护策略](./03-sybil-protection.md)
   - Web3 优先设计
   - 核心设计原理
   - 认证方式分析
   - 认证流程设计
   - 用户引导策略

4. [组件设计库](./04-component-library.md)
   - 基础组件
   - 表单组件
   - 布局组件
   - 交互组件

5. [可访问性设计](./05-accessibility.md)
   - 键盘导航
   - 屏幕阅读器支持
   - 颜色对比和视觉设计
   - 响应式设计和触摸友好

6. [国际化支持](./06-internationalization.md)
   - 多语言设计
   - 文化适配

7. [性能优化](./07-performance.md)
   - 加载优化
   - 渲染优化
   - 缓存策略

## 设计系统

本设计系统基于 Nuwa.dev 的样式系统，使用了以下核心技术：

- shadcn/ui 组件库
- OKLCH 颜色空间
- Tailwind CSS
- TypeScript
- React

## 更新历史

- 2024-01-22: 初始版本
- 2024-01-23: 重构为多文档结构 