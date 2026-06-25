# My Vocab App

一个适合手机使用的词书导入与复习应用，支持：

- 导入 `csv` / `xlsx` / `xls`
- 词书管理
- 学习新词与滚动复习
- PWA 安装到手机桌面

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

## GitHub Pages 部署

仓库推送到 `main` 后，会自动运行 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。

如果是第一次启用 GitHub Pages，需要在仓库设置里确认：

- `Settings -> Pages`
- `Build and deployment -> Source`
- 选择 `GitHub Actions`

部署完成后，页面可以直接在手机浏览器打开，并可作为 PWA 安装到主屏幕。
