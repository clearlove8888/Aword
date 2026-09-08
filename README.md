# Aword

Vue 3 + Vite 的单屏背单词页面，天蓝与白色配色。

## 本地运行

```sh
npm install
npm run dev
```

## 构建

```sh
npm run build
npm run preview
```

## 词库

来源：项目根目录的 `四级核心词汇_含例句.xlsx`。读取第一个工作表，按原始顺序导入单词、完整释义及两条例句（英文和中文），共 2329 条。网页使用 `src/data/words.json`，无需在线读取本机 Excel。

更新 Excel 后，运行以下命令刷新网页词库，再构建并提交更新后的 JSON：

```sh
python -m pip install openpyxl
python scripts/import_words.py
npm run build
```

表格无音标列，页面不显示音标。发音由浏览器系统语音提供，实际可用性取决于系统和浏览器。

支持释义切换、上一词/下一词及熟悉度标记。标记只保留在当前页面会话中，刷新后重置。

GitHub Pages 通过 `.github/workflows/deploy.yml` 在推送至 main 后自动构建部署。

## PWA 安装

生产构建会注册 `public/sw.js`，应用清单和图标位于 `public/manifest.webmanifest` 与 `public/icons/`。首次在线打开网页后，页面资源及使用过的单词录音会逐步缓存，可从浏览器安装到桌面或手机主屏幕。

Android Chrome 或桌面 Chrome/Edge：打开网页后选择“安装应用”。iPhone/iPad Safari：点击分享按钮，再选择“添加到主屏幕”。
