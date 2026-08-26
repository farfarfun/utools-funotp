# utools-funotp

uTools 两步验证码插件 — 本地管理多个 TOTP 账号，离线生成 Google Authenticator 兼容的动态验证码。

## 特性

- **完全离线**：验证码由本机按 RFC 4226 / RFC 6238 计算，密钥不联网、不上传，插件本身不请求任何第三方服务。
- **标准兼容**：TOTP 与 HOTP，SHA1 / SHA256 / SHA512，4–10 位验证码，自定义周期，另支持 Steam 令牌。
- **多种添加方式**：截屏扫码、图片扫码、剪贴板扫码、粘贴 `otpauth://` 链接、手动输入。
- **批量导入**：支持每行一条 `otpauth://` 的文本文件，以及 Google Authenticator「导出账号」生成的 `otpauth-migration://` 迁移二维码。
- **uTools 集成**：主输入框直接搜索账号并回车复制验证码；可为常用账号注册独立关键字；复制后自动退出插件，随手粘贴。
- **备份**：本地 JSON 备份还原、WebDav 备份还原、导出 `otpauth://` 链接给其他验证器。
- **界面**：浅色 / 深色 / 跟随系统，分组管理，倒计时圆环，最后 5 秒提示下一个验证码。

## 开发

```bash
npm install
npm test          # 跑 RFC 测试向量与状态迁移测试
npm run dev       # 浏览器预览，数据落在 localStorage
npm run build     # 产出 utools/dist/，uTools 加载的是这一份
```

在 uTools 开发者工具里导入 `utools/plugin.json` 即可调试，也可以运行 `utools/build.sh` 完成测试和构建。

### `data/` 目录

`data/` 用于放本地调试用的真实 `otpauth://` 链接，**已在 `.gitignore` 中排除，不会提交到仓库**。里面是明文密钥，请勿分享或上传。

## 数据与安全

- 账号存放在 uTools 的本地数据库（`dbStorage`）里，卸载插件会一并删除，请提前备份。
- 备份文件与导出的 `otpauth://` 链接都是**明文密钥**，拿到的人可以生成你的验证码，请妥善保管。
- 删除账号前请确认对应网站已关闭两步验证，或已保存好恢复码 —— 密钥删掉无法找回。
- 本地数据读不出来时插件会进入只读模式并提示，绝不会用空数据覆盖已有密钥。

## 结构

```
utools/                uTools 清单、预加载脚本、图标与构建脚本
src/lib/base32.mjs    Base32 编解码
src/lib/otp.mjs       HOTP / TOTP 计算
src/lib/otpauth.mjs   otpauth 链接与迁移二维码的解析、生成
src/lib/qr.js         二维码识别与生成
src/lib/core.mjs      账号规范化、校验、迁移
src/lib/state.mjs     状态 schema 与加载
src/composables/      界面状态与 uTools 集成
src/components/       Vue 组件
```
