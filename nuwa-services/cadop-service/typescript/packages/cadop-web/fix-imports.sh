#!/bin/bash

# 查找所有的 .ts 和 .tsx 文件
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | while IFS= read -r -d '' file; do
  # 使用 sed 替换相对导入路径
  sed -i '' -E 's/from '\''(\.[^'\'']+)'\''$/from '\''\1.js'\''/g' "$file"
  sed -i '' -E 's/from '\''(\.[^'\'']+)'\''(;|\s|$)/from '\''\1.js'\''\2/g' "$file"
done 