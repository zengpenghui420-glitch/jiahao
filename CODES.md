# 验证码说明（嘉豪浓度测试）

- 格式：`JH` + 4 位字符，字符表 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（无 I/L/O/0/1）
- 示例形态：`JHXXXX`（此处不公布可售卖码）
- 测验键：`jiahao`（vault-only，不接 Mantle）
- 每码最多使用 **3** 次（跨设备共享计数，由 vault 扣次）
- **重新测试**：清除会话解锁后需再次输入码并 redeem，会再扣 1 次
- **查看上次结果**：只读本机 `localStorage`，不扣次
- 本仓库**不**存放可卖验证码明文

造码（本机 companion，勿把码写进 git）：

```bash
/workspace/quiz-code-api/scripts/mint.sh jiahao <CODE> 3
```

或见 `tools/mint.sh` 说明。前缀必须是 `JH`。
