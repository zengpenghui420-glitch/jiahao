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
| 验证码 | `JH****`，每码 3 次；vault 键 `jiahao`；**不接 Mantle** |
| 重新测试 | 清会话解锁 → 再弹码 → redeem（扣次） |
| 查看上次 | 仅读本机缓存，不扣次 |

浓度：`round(clamp(mean(F, E, S, C, U, 100−R), 0, 100))`。R 为回血自嘲，高分降低浓度。

## 免责声明

本测试为娱乐向自我观察，非正式心理测量，不能替代专业评估。「嘉豪」是网络流行梗，用来调侃用力过猛、装酷但底气不足的瞬间，不是对人的贬损或标签审判；结果会受当下心情与作答状态影响，图一乐即可。

## 文件

- `index.html` — 单文件 H5
- `.nojekyll` — GitHub Pages（跳过 Jekyll）
- `CODES.md` — 验证码格式与规则（无可卖码）
- `tools/mint.sh` — 指向仓库外 vault mint 的说明，只打印用法

## 本地预览

```bash
python3 -m http.server 8080
```

浏览器打开 http://127.0.0.1:8080/ 。未解锁会先看到验证码门禁；答完 18 题后出现浓度与雷达。

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
