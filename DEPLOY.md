# 部署与异地联机

## 一、马上异地玩：临时公网地址

本机服务启动后，把公网 HTTPS 地址发给对方即可：

```powershell
npm start
npx --yes localtunnel --port 4173
```

终端输出的 `https://xxxx.loca.lt` 就是临时公网地址。电脑和命令必须一直运行，适合临时测试，不适合正式上线。

## 二、正式部署到公网：Render

1. 把本项目上传到 GitHub 仓库。
2. 登录 Render，选择 **New → Web Service**。
3. 连接 GitHub 仓库。
4. Render 会读取仓库里的 `render.yaml`；也可以手动填写：
   - Runtime: `Node`
   - Build Command: `npm install --omit=dev`
   - Start Command: `npm start`
5. 部署完成后会得到类似 `https://same-word-meet.onrender.com` 的 HTTPS 地址。
6. 把这个地址发给对方，两个人打开同一地址，一个人创建房间，另一个人用链接或房间号加入。

免费实例可能休眠，休眠后内存中的房间会清空。正式使用时建议改用付费常驻实例，并把 `server.mjs` 中的内存存储替换为 Redis。

## 三、部署到自己的云服务器（适合微信小程序）

以下以 Ubuntu + Nginx 为例：

```bash
# 安装 Node.js 22 后进入项目目录
npm start
```

生产环境建议使用 PM2：

```bash
npm install -g pm2
pm2 start server.mjs --name same-word
pm2 save
pm2 startup
```

Nginx 反向代理示例：

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

再用 Certbot 配置 HTTPS：

```bash
sudo certbot --nginx -d game.example.com
```

如果服务器在中国大陆，域名通常需要先完成 ICP 备案。微信小程序要求使用已配置的 HTTPS 域名，不能直接使用 IP 地址。

## 四、接入微信小程序

当前项目本身是 H5。接入微信小程序有两种方式。

### 方式 A：WebView 外壳（最快）

1. 注册微信小程序，获得 AppID。
2. 将 H5 部署到正式 HTTPS 域名。
3. 在微信公众平台后台的 **开发管理 → 开发设置 → 业务域名** 中添加 H5 域名，并按提示把微信提供的校验文件放到项目根目录。
4. 使用微信开发者工具创建一个 WebView 小程序，页面中写入：

```xml
<web-view src="https://game.example.com"></web-view>
```

5. 上传代码，提交审核并发布。

注意：WebView 域名必须在后台完成配置；个人主体和部分类目对 WebView 能力可能有限制，具体以微信公众平台当前规则为准。

### 方式 B：原生小程序（体验最好）

把当前 HTML/CSS 页面改写为 WXML/WXSS，把现有 `/api/rooms` 接口继续部署在公网服务器，小程序通过 `wx.request` 调用接口。实时进度可以改为轮询或 WebSocket。这个方案需要额外的小程序前端开发和微信审核，但体验、分享和稳定性都更好。

## 五、正式上线前必须补的能力

- 将房间状态从内存迁移到 Redis，避免服务重启丢房间。
- 多实例部署时，SSE 广播需要 Redis Pub/Sub。
- 增加接口限流、房间过期清理和敏感词过滤。
- 配置正式域名、HTTPS、隐私说明和小程序审核材料。
