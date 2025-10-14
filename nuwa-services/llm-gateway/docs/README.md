# LLM Gateway Documentation

## 📚 Current Documentation

### Core Architecture
- **[route-based-gateway.md](./route-based-gateway.md)** - 主要架构文档，包含路由设计、API密钥管理、定价策略等完整说明
- **[universal-routing-design.md](./universal-routing-design.md)** - 最新的通用路由设计，支持 `/${provider}/*` 模式和安全验证

### Integration & Features  
- **[payment-kit-integration.md](./payment-kit-integration.md)** - PaymentKit集成说明，DID认证和计费逻辑
- **[access-log.md](./access-log.md)** - 访问日志格式和字段说明，运维监控必读

## 📁 Legacy Documentation

历史文档保存在 `legacy/` 目录中，包含早期设计和已废弃的功能：

- **[legacy/dual-backend-openrouter-litellm.md](./legacy/dual-backend-openrouter-litellm.md)** - 早期双后端设计
- **[legacy/did-auth-integration.md](./legacy/did-auth-integration.md)** - DID认证集成历史

## 🎯 Quick Start

1. **了解架构**: 从 `route-based-gateway.md` 开始
2. **路由设计**: 查看 `universal-routing-design.md` 了解最新路由模式  
3. **集成开发**: 参考 `payment-kit-integration.md` 进行集成
4. **运维监控**: 使用 `access-log.md` 配置日志监控

## 📝 Document Maintenance

本文档集已经过整理，删除了重复和过时的内容：

### ✅ 保留原则
- **核心架构文档**: 包含完整功能说明
- **最新设计文档**: 反映当前实现状态  
- **独立功能文档**: 不与其他文档重复
- **集成指南**: 开发和运维必需

### 🗑️ 清理原则  
- **重复内容**: 多个文档描述相同功能
- **过时设计**: 已被新设计取代的方案
- **调试文档**: 临时问题排查，问题已解决
- **实现过程**: 中间步骤，最终结果已整合

### 📁 归档原则
- **历史价值**: 有参考价值但不是当前架构
- **设计演进**: 展示系统发展历程
- **学习资料**: 可供未来设计参考

---

*最后更新: 2025-10-14*
