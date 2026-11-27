# 嘉豪浓度测试 · 测测你身上有多少嘉豪

付费移动端 H5 娱乐测验。18 道原创 Likert 题，六维画像 + 嘉豪浓度（0–100）+ 六档锐评 + 雷达。

## 在线地址

https://zengpenghui420-glitch.github.io/jiahao/

## 产品要点

| 项 | 说明 |
|---|---|
| 题目 | 18 题 · 五级自评（完全不像我 → 非常像我） |
| 维度 | 滤镜表演欲 / 虚空用力 / 优越口吻 / 反差尴尬 / 独特执念 / 回血自嘲 |
| 结果 | 嘉豪浓度 + 档位 + 主导维 + 六维雷达 + 锐评 + 自处/相处建议 |
| 订单号 | 小红书订单号。只接受 `P` + 18 位。重复块、逐位 ±1 的序列和 19 位都提示「订单号格式不对」，测验不开始。格式通过后立刻开始，没有服务器绑定、限流或剩余次数 |
| 订单请求 | 不为订单号请求 `*.vercel.app`，也不对 Mantle 的 `orders/` 做创建、查询或增加 |
| 订单提示 | 第一次开始：「验证成功，还可以测 2 次」。重新测试改为「还可以测 1 次」，然后「这是最后一次」。刷新、继续这一次、恢复结果、查看上次结果都不改变这句提示 |
| 三次之后 | 同一订单号仍可进入，提示「验证成功」。格式通过的订单号不会出现「次数已经用完」或「暂时验证不了」 |
| 订单记录 | 每个订单号的提示次数记在这台浏览器的 `jiahao_order_uses` |
| 已发出的码 | 仍走本页原来的 vault：先 `POST /redeem`，主机 `https://snappy-tundra-7uesdvk.tmp.now`，键 `jiahao`。剩余次数以 vault 返回为准。不接 Mantle。页面不宣传这套入口 |
| 重新测试 | 订单号更新上面的提示并开始新的一次。旧码仍是清掉本次解锁后再提交，按 vault 剩余次数扣 1 次 |
| 查看上次 | 只读本机上次结果，不改变订单号提示，也不扣已发出的码 |
| 说明 | 订单号不能证明已经付款 |

浓度：`round(clamp(mean(F, E, S, C, U, 100−R), 0, 100))`。R 为回血自嘲，高分降低浓度。

## 免责声明

本测试为娱乐向自我观察，非正式心理测量，不能替代专业评估。「嘉豪」是网络流行梗，用来调侃用力过猛、装酷但底气不足的瞬间，不是对人的贬损或标签审判；结果会受当下心情与作答状态影响，图一乐即可。

## 文件

- `index.html` — 单文件 H5
- `.nojekyll` — GitHub Pages（跳过 Jekyll）
- `CODES.md` — 验证码格式与规则（无可卖码）
- `tools/mint.sh` — 指向仓库外 vault mint 的说明，只打印用法
- `tools/order-unlock.test.mjs` — 订单号与已发出码的本地检查。订单号不连网；已发出的码打到拦截的 vault，不核销真实码
- `tools/order-unlock-mock.mjs` — 转去跑上面的检查

## 本地预览

```bash
python3 -m http.server 8080
```

浏览器打开 http://127.0.0.1:8080/ 。未解锁会先要求输入订单号；答完 18 题后出现浓度与雷达。

## GitHub Pages

站点应从 **`main` 分支仓库根目录 `/`** 发布。代码已在 `main`。当前令牌没有 Pages 管理权限，站点还没打开，需要仓库管理员点一次：

1. 打开 https://github.com/zengpenghui420-glitch/jiahao/settings/pages
2. Build and deployment → Source 选 **Deploy from a branch**
3. Branch 选 **`main`**，文件夹选 **`/ (root)`**
4. 点 **Save**

生效后访问 https://zengpenghui420-glitch.github.io/jiahao/ 。仓库已包含 `.nojekyll`，不要改成 `/docs`。

## 码规则

- 形态：`JH` + 4 位，字符表 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
- 每码 3 次；重新测试扣 1 次；查看上次不扣
- **不要**把可卖验证码写进本仓库。造码用仓库外的 vault：`/workspace/quiz-code-api/scripts/mint.sh jiahao <CODE> 3`

## 版权

题目、档位名与结果文案均为原创中文日常情景，禁止照搬第三方「嘉豪 / 豪意」题库或结果档名。
