# 签名证书目录（debug）

`aiot build` / `aiot release` 需要本目录下的证书文件才能打包 rpk。

- `private.pem`  —— 私钥（PEM）
- `certificate.pem` —— 证书（PEM）

从配套 Android App 的 keystore 提取（与手机端 **同签名**，否则 interconnect 会话握手会静默失败）：

```bash
keytool -importkeystore -srckeystore app.jks -deststoretype PKCS12 -destkeystore tmp.p12
openssl pkcs12 -in tmp.p12 -nodes -nokeys  -out private.pem
openssl pkcs12 -in tmp.p12 -nokeys -clcerts -out certificate.pem
```

> 注意：`.gitignore` 已忽略 `/sign`，证书不会进入版本库，请本地保管。
> debug 包仅供本地联调；交付用 `npm run release`（读 `sign/release/`）。
