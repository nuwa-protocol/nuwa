# LiteLLM Kubernetes 部署指南

本指南介绍如何在 Kubernetes 上部署和管理 LiteLLM 服务。

## 文件说明

- `kubernetes.yaml` - Kubernetes 基础配置，包含 Secret、Deployment、Service 和 Ingress
- `config.yaml` - LiteLLM 的配置文件
- `update-config.sh` - 用于更新 ConfigMap 的脚本
- `update-env.sh` - 从 .env 文件批量更新环境变量的脚本
- `env.example` - 环境变量示例文件
- `generate-master-key.sh` - 用于生成安全的 MASTER_KEY 的脚本

## 部署步骤

我们采用配置文件外部管理的方法，这样可以更灵活地管理配置和环境变量。所有资源都部署在 `nuwa` 命名空间中。

1. 创建 `nuwa` 命名空间：
   ```bash
   kubectl create namespace nuwa
   ```

2. 创建 GCP 静态 IP（如果使用 GCP）：
   ```bash
   # 创建全局静态 IP
   gcloud compute addresses create litellm-ingress-static-ip --global
   
   # 查看已创建的静态 IP
   gcloud compute addresses describe litellm-ingress-static-ip --global
   ```
   
   记下分配的 IP 地址，后续需要配置 DNS。

3. 生成安全的 MASTER_KEY（可选但推荐）：
   ```bash
   chmod +x generate-master-key.sh
   ./generate-master-key.sh
   ```
   脚本会生成一个以 `sk-` 开头的安全随机密钥，并提供将其添加到 .env 文件的选项。

4. 设置环境变量：
   ```bash
   # 复制示例文件并编辑
   cp env.example .env
   # 编辑 .env 文件，填入实际的环境变量值
   
   # 应用环境变量
   chmod +x update-env.sh
   ./update-env.sh
   ```

5. 更新 LiteLLM 配置：
   ```bash
   chmod +x update-config.sh
   ./update-config.sh
   ```

6. 部署 Kubernetes 资源：
   ```bash
   kubectl apply -f kubernetes.yaml
   ```

7. 配置 DNS：
   将您的域名（例如 `litellm.nuwa.dev`）配置 A 记录指向步骤 2 获取的静态 IP 地址。
   
   > 注意：DNS 记录生效可能需要几分钟到几小时，取决于您的 DNS 提供商。

## 配置更新

### 更新 LiteLLM 配置

1. 修改本地的 `config.yaml` 文件
2. 运行 `./update-config.sh` 脚本更新 ConfigMap
3. 脚本会自动重启 Deployment 以应用新配置

### 更新环境变量

使用 .env 文件管理环境变量：

1. 创建或编辑 `.env` 文件，每行一个环境变量：
   ```
   OPENAI_API_KEY=sk-your-openai-key
   OPENAI_API_BASE=https://api.openai.com/v1
   MASTER_KEY=sk-your-master-key
   DATABASE_URL=postgresql://user:password@localhost:5432/litellm
   ```

2. 运行 update-env.sh 脚本应用所有环境变量：
   ```bash
   ./update-env.sh
   ```

3. 如果 .env 文件不在当前目录，可以指定路径：
   ```bash
   ./update-env.sh /path/to/your/.env
   ```

这个脚本会：
1. 读取 .env 文件中的所有环境变量
2. 将所有值编码为 base64
3. 创建或更新 Kubernetes Secret
4. 重启 Deployment 以应用新环境变量

### 生成安全的 MASTER_KEY

MASTER_KEY 用于 LiteLLM 的 API 认证，必须是一个以 `sk-` 开头的安全随机字符串。使用提供的脚本可以轻松生成：

```bash
./generate-master-key.sh
```

这个脚本会：
1. 生成一个以 `sk-` 开头的安全随机密钥
2. 显示生成的密钥
3. 提供将密钥添加到 .env 文件的选项

您也可以手动生成 MASTER_KEY，但必须确保其以 `sk-` 开头：

```bash
# 生成随机部分
RANDOM_PART=$(openssl rand -base64 32 | tr -d '\n' | tr -d '=' | tr '+/' '-_' | cut -c 1-48)
# 添加 sk- 前缀
echo "sk-${RANDOM_PART}"
```

### 环境变量自动注入

Kubernetes 配置中使用了 `envFrom` 功能，会自动将 `litellm-env` 中的所有键值对注入为容器的环境变量。这意味着：

1. 当您通过脚本添加新的环境变量时，它们会自动提供给 LiteLLM 容器
2. 不需要手动修改 Deployment 配置来添加新的环境变量引用
3. 可以轻松管理各种类型的环境变量，如 API 密钥、数据库 URL、主密钥等

这种方式大大简化了环境变量的管理，特别适合需要多种 LLM 提供商和其他服务配置的场景。

## 查看日志

```bash
kubectl logs -f deployment/litellm -n nuwa
```

## 访问服务

服务将通过您在 Ingress 中配置的域名（例如 litellm.nuwa.dev）提供访问。

## 排查常见问题

### Ingress 未分配 IP 地址

如果通过 `kubectl get ingress -n nuwa` 发现 Ingress 没有分配 IP 地址，可以按照以下步骤排查：

1. **检查 Ingress 状态详情**：
   ```bash
   kubectl describe ingress litellm-ingress -n nuwa
   ```
   查看详细状态信息，特别注意 Events 部分的错误信息。

2. **检查 GCP 静态 IP 是否存在**：
   ```bash
   gcloud compute addresses list
   ```
   如果不存在，需要创建：
   ```bash
   gcloud compute addresses create litellm-ingress-static-ip --global
   ```

3. **检查 ManagedCertificate 状态**：
   ```bash
   kubectl describe managedcertificate litellm-cert -n nuwa
   ```
   证书配置问题也可能导致 Ingress 无法获取 IP。

4. **检查 Ingress 控制器**：
   ```bash
   kubectl get pods -n kube-system | grep ingress
   ```
   确认 Ingress 控制器是否正常运行。

5. **检查 DNS 配置**：
   确保您的域名已正确配置 A 记录，指向分配的静态 IP。可以使用以下命令查看域名解析情况：
   ```bash
   nslookup litellm.nuwa.dev
   ```

6. **等待 DNS 生效和证书颁发**：
   DNS 记录生效和证书颁发可能需要一些时间。通常在 DNS 生效后，ManagedCertificate 会自动验证域名所有权并颁发证书。

### 证书问题

如果 Ingress 有 IP 但无法通过 HTTPS 访问，可能是证书问题：

1. **检查证书状态**：
   ```bash
   kubectl describe managedcertificate litellm-cert -n nuwa
   ```

2. **确认域名所有权验证**：
   GCP ManagedCertificate 需要验证域名所有权，确保 DNS 已正确配置。

3. **等待证书颁发**：
   证书颁发通常需要几分钟到几小时。在此期间，服务可能无法通过 HTTPS 访问。

## 注意事项

- 所有资源都部署在 `nuwa` 命名空间中
- 确保在 GCP 中已预留名为 `litellm-ingress-static-ip` 的静态 IP 地址
- 如果使用其他 Kubernetes 提供商，可能需要调整 Ingress 的注解和 ManagedCertificate 资源
- 为安全起见，请不要将敏感环境变量直接写入配置文件或版本控制系统
- 确保将 `.env` 文件添加到 `.gitignore` 中，避免意外提交敏感信息
- 在部署前，请修改 kubernetes.yaml 中的域名为您实际使用的域名 