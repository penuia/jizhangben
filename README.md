# 记账本

适合 iPhone Safari 的简洁记账网页。支持手动记账、自定义收支分类、月度与年度统计、删除、CSV 导出、JSON 备份和快捷指令网址入账。商户或来源可以留空，列表会显示对应分类。账目、分类和预算只保存在当前浏览器的 `localStorage`，没有上传接口。项目中不含吉伊卡哇等第三方角色图片。

## 免费部署到 GitHub Pages

1. 在 GitHub 创建一个 **Public** 仓库，例如 `jizhangben`。GitHub Free 的 Pages 需要公开仓库，网页本身也会公开。
2. 将本文件夹中的文件上传到仓库根目录；确保 `index.html` 位于根目录。
3. 打开仓库 **Settings → Pages**，在 **Build and deployment** 中选择 **Deploy from a branch**，分支选 `main`，目录选 `/(root)`，保存。
4. 部署完成后，网页地址通常为 `https://你的用户名.github.io/jizhangben/`。在 iPhone Safari 打开该地址，再用“分享 → 添加到主屏幕”。

公开仓库只包含网页代码和图标，不包含你的账目。账目保存在访问网页的那台设备的浏览器中。更换手机、清除 Safari 网站数据或切换浏览器前，请在设置页导出 JSON 备份。

## 快捷指令传参

推荐网址片段形式：

```text
https://你的用户名.github.io/jizhangben/#amount=25&merchant=便利店&category=餐饮
```

在快捷指令中构造这个网址，再使用“打开 URL”动作。打开后会自动保存一笔支出，并显示“快捷指令自动记账成功 🕊️”。可选参数：`date=2026-11-10`、`type=income`。分类需匹配网页内的分类，否则会归入“其他”。

网页也兼容 `?amount=25&merchant=便利店&category=餐饮`。但 URL 问号后的参数会随首次网页请求到达 GitHub Pages，可能进入托管平台日志；若要求交易信息严格只留在本机，请使用 `#` 形式。

网址会在入账后从地址栏移除，刷新页面不会重复入账。每次快捷指令重新打开带参数网址，会新增一笔。

## 本机预览

在此文件夹运行 `python -m http.server 8766 --bind 127.0.0.1`，然后在电脑打开 `http://127.0.0.1:8766/`。这个地址只供电脑预览，iPhone 无法通过它访问电脑。
