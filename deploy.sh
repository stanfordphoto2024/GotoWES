#!/bin/bash

# --- 配置區 ---
# 這是您的主站 sylphold.com 的本地路徑
MAIN_SITE_PATH="/Users/sylphold/Documents/trae_projects/Sylphold Web"
# 部署到主站的子路徑名稱
SUB_PATH="wes"

echo "🚀 開始部署 Woodside Navigator 到 $SUB_PATH..."

# 1. 執行編譯
echo "📦 正在編譯專案..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 編譯失敗，請檢查錯誤訊息。"
    exit 1
fi

# 2. 檢查主站路徑是否存在
if [ ! -d "$MAIN_SITE_PATH" ]; then
    echo "❌ 找不到主站路徑: $MAIN_SITE_PATH"
    echo "請確認路徑是否正確，或手動修改 deploy.sh 中的 MAIN_SITE_PATH。"
    exit 1
fi

# 3. 準備目標目錄 (先清空舊檔案，除了 .git 或其他重要檔案)
TARGET_DIR="$MAIN_SITE_PATH/public/$SUB_PATH"
echo "📂 正在清理並準備目標目錄: $TARGET_DIR"
# 如果目錄存在，先刪除除了 assets 以外的內容，或者直接清空 assets
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"/*
fi
mkdir -p "$TARGET_DIR"

# 4. 複製編譯後的檔案
echo "🚚 正在複製檔案到主站..."
cp -r dist/* "$TARGET_DIR/"

echo "✅ 部署完成！"
echo "------------------------------------------------"
echo "接下來您只需要："
echo "1. 進入主站目錄: cd \"$MAIN_SITE_PATH\""
echo "2. 提交更改並推送到 GitHub: git add . && git commit -m \"Update Woodside Navigator\" && git push"
echo "3. 等待 GitHub Action 完成後，即可在 sylphold.com/$SUB_PATH 查看！"
echo "------------------------------------------------"
