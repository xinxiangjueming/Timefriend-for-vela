# sign/release — 手表端正式签名证书

本目录的证书**已提取自手机端工程 `D:\Timefriend` 的根目录密钥库 `timefriend`**（PKCS12，别名 `key0`），
用于给手表 rpk 签名，满足小米 Vela interconnect 的「**同签名**」硬约束（否则手表↔手机通道静默丢包）。

## 提取命令（已执行，产物即本目录 certificate.pem / private.pem）

```bash
# 证书（公钥）
openssl pkcs12 -in "D:/Timefriend/timefriend" -passin pass:1234567890 -nokeys -clcerts -out certificate.pem
# 私钥（无加密 PKCS#8；注意用 -nocerts 取私钥，不要用 -nokeys）
openssl pkcs12 -in "D:/Timefriend/timefriend" -passin pass:1234567890 -nocerts -nodes -out private.pem
```

## 指纹校验（已通过）

- 密钥库证书 SHA256：`5D:60:5B:DB:00:7F:DC:C2:59:6D:58:55:51:4E:E8:F0:A9:EE:5B:FE:67:01:79:45:7C:39:97:DD:EA:DC:E0:99`
- `certificate.pem` 指纹与之完全一致 → 手表 rpk 与手机 App 同签名。

## 注意

- 私钥 `private.pem` 即手机 App 的签名私钥，敏感文件**勿入库 / 勿外传**。
- 若日后手机端 `D:\Timefriend/timefriend` 密钥库更换，需重新提取本目录证书。
- 构建：`npm run release` 会用这两份证书给 rpk 签名（aiot-toolkit）。
