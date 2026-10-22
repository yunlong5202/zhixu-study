# Nginx 静态部署

本项目构建后只有静态文件。Nginx 直接提供 `dist/`，服务器无需常驻 Node.js，也无需运行 `npm start` 或开发服务器。当前项目无 npm 依赖，无需 Docker。

## 构建与上传

在项目根目录、已能运行本项目的 Node.js 环境中执行：

```sh
npm run build
```

将生成的**完整 `dist/` 目录**通过 SFTP 等方式上传，例如 `/var/www/zhixu/dist/`。确认其中同时存在 `index.html`、`src/` 和 `public/`，并保证 Nginx 运行用户可读取文件、遍历父目录。只将 `dist/` 作为站点根目录。

更新时先上传完整的新构建，核对文件后再切换站点目录；保留上一版便于回退。不要在上传尚未完成时切换，也不要仅覆盖少数文件。实际上传和目录切换方式由现有运维流程决定。

## 启用配置

修改 [nginx.conf.example](./nginx.conf.example) 中的 `server_name` 和 `root`。此模板是 **HTTP 80 端口的 `server` 块**，需要由主配置的 `http {}` 引入，不能直接替代整份 `nginx.conf`。

Ubuntu/Debian 常见目录为 `/etc/nginx/sites-available/` 与 `/etc/nginx/sites-enabled/`。可将模板作为新的站点配置放入前者，再由后者的符号链接启用；若当前安装使用 `/etc/nginx/conf.d/*.conf`，按其已有结构放置，避免重复引入。实际路径和服务管理方式应先核对当前系统，这些示例未在你的阿里云服务器执行。

主配置的 `http {}` 中应已包含以下设置，已有时无需重复添加：

```nginx
include /etc/nginx/mime.types;
default_type application/octet-stream;
```

先检查配置，通过后再重载正在运行的 Nginx：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

第二条适用于由 systemd 管理且服务名为 `nginx` 的安装。配置测试失败时先修正输出中的问题，不进行重载。

## 路由、缓存与验收

应用采用 `/#home` 一类 hash 路由，无需将未知路径重写到首页。配置对缺失文件返回 404，关闭目录列表，也未添加跨域访问头。HTML 每次使用前重新校验；其余文件缓存 5 分钟，因为当前构建未给资源文件名加入内容哈希。新版本可能在缓存过期后出现，验收更新时可强制刷新浏览器。

域名解析后检查首页和资源：

```sh
curl -I http://study.example.com/
curl -I http://study.example.com/src/app.js
curl -sS -D - -o /dev/null -H 'Accept-Encoding: gzip' http://study.example.com/src/data/banks/law.js
```

预期首页为 HTML、JS 为 JavaScript 类型，较大的文本响应可见 `Content-Encoding: gzip`，并带有相应缓存头。再用浏览器确认刷新 hash 路由可用、无脚本加载错误、缺失资源返回 404，以及目录地址没有文件列表。

## HTTPS 与数据

此模板尚未配置 HTTPS。先将实际域名解析到服务器，并在云安全组和系统防火墙中按需放行 TCP 80、443；放行端口本身不会启用 TLS。为实际域名取得有效证书后，通过现有证书工具或站点配置启用 443、配置证书链与私钥，并检查续期。确认 HTTPS 正常后再配置 HTTP 跳转，保留所用证书签发方式需要的验证路径。

学习记录保存在浏览器本地，不会自动同步到服务器。切换域名或从 HTTP 改为 HTTPS 前先导出学习备份；不同来源的浏览器存储互相隔离，切换后可再导入。

配置指令参考 Nginx 官方文档：[静态内容与配置层级](https://nginx.org/en/docs/beginners_guide.html)、[文件查找与 MIME 类型](https://nginx.org/en/docs/http/ngx_http_core_module.html)、[gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)、[响应头与缓存](https://nginx.org/en/docs/http/ngx_http_headers_module.html)。本目录仅提供部署示例，未连接服务器或完成服务器上的 `nginx -t`、证书和负载验证。
