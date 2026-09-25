# Aword

Vue 3 + Vite 的单屏背单词页面，天蓝与白色配色。

高频1616词的代表词性与释义按语料义项频次从高到低选取，累计覆盖至少90%后停止。同一词性合并展示、重复释义去重，每个义项保留简短核心词义及必要的短限定（如“交（朋友）”）。覆盖率以每个词的现有语料总频次为分母；“无法可靠判断，需人工确认”的记录不计入已覆盖次数。确认义项不足90%时，页面显示实际覆盖率和待核对提示；这一统计不代表全部英语使用场景的覆盖率。

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

页面可在三个相互独立的词库之间切换：

- “四级核心词汇”来源于项目根目录的 `四级核心词汇_含例句.xlsx`，共 2329 条，网页使用 `src/data/words.json`。
- “四级高频1616词”以 `C:\懒笔记\tables\单词总览.csv` 为主表，按“词频排名 + 单词”关联同目录的词义、词形和搭配表，网页使用 `src/data/cet4-frequency-1616.json`。列表顺序、释义、例句、词形和搭配均来自这些 CSV；CSV 没有例句译文字段时，页面会明确提示未提供，不自动编造。
- “四级听力1000词（英音）”来自项目根目录的 `四级听力高频词_词性释义.xlsx`，原始数据网页使用 `src/data/cet4-listening-1000.json`。1000 个原词会展开 751 个不重复词形作为独立学习词条；词形词条会注明来源词和“词性变化”，并沿用原词释义。释义按原有释义卡片展示；发音优先使用标准英音在线录音，失败时回退到浏览器 `en-GB` 系统语音。

各词库的学习进度、收藏和自定义释义使用不同的浏览器本地存储键，切换词库不会混用记录。页面优先复用现有本地录音；未覆盖的高频词使用在线词典录音，并在加载失败时尝试浏览器系统英语语音。

更新 Excel 后，运行以下命令刷新网页词库，再构建并提交更新后的 JSON：

```sh
python -m pip install openpyxl
python scripts/import_words.py
npm run build
```

更新高频词 CSV 后，运行：

```sh
python scripts/import_frequency_words.py "C:\懒笔记\tables"
npm test
npm run build
```

表格无音标列，页面不显示音标。标准英音录音需要联网；系统语音的实际可用性取决于系统和浏览器。

支持释义切换、上一词/下一词及熟悉度标记。标记只保留在当前页面会话中，刷新后重置。

GitHub Pages 通过 `.github/workflows/deploy.yml` 在推送至 main 后自动构建部署。

## PWA 安装

生产构建会注册 `public/sw.js`，应用清单和图标位于 `public/manifest.webmanifest` 与 `public/icons/`。首次在线打开网页后，页面资源及使用过的单词录音会逐步缓存，可从浏览器安装到桌面或手机主屏幕。

Android Chrome 或桌面 Chrome/Edge：打开网页后选择“安装应用”。iPhone/iPad Safari：点击分享按钮，再选择“添加到主屏幕”。
