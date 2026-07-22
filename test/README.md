# 数值游戏验证体系

这是 `禁忌魔卡` 的数据验证工具,对所有数值计算、状态机、概率分支做严格测试。

## 跑测试

```bash
cd /workspace/taboo-cards
node test/harness.js
```

**不需要** HTTP server / 浏览器 / 网络 — 纯 Node,无依赖。

可选参数:
- `--seed=12345` 用固定种子(默认随机,每次跑不一样)

## 文件

| 文件 | 作用 |
|------|------|
| `harness.js` | 主入口,运行全部测试,产出报告 |
| `oracle.js` | **独立参考实现**,用不同于生产代码的算法手写 poker evaluator,用于交叉验证 |

## 测试覆盖 14 个模块

| # | 模块 | 核心 |
|---|------|------|
| 1 | `cardChips` 面值 | 13 张牌的 chip 值,A=11/J/Q/K=10 |
| 2 | 手型识别 (正样本) | 10 种手型 + Wheel(低 A 顺子) |
| 3 | 手型识别 (负样本) | 不能误判:4 张不同花 ≠ 同花 |
| 4 | 部分手型 (1-4 张) | 修复 bug:对子/三条/铁支可识别 |
| 5 | 8 张里选最优 5 | 多个手型都能取到最佳 5 |
| 6 | **Oracle 交叉校验** | **5000+ 随机手,生产 vs oracle 必须 type 一致** |
| 7 | Property 不变量 | 1000 随机手:type∈枚举,mult∈[1,8],无 NaN |
| 8 | 禁卡加成 | +5 mult/张,只动 mult 不动 chips |
| 9 | 10 个 Joker 加成 | 每个 joker + 每个相关手型 |
| 10 | 10 个 Directive | 每个指令 violation / no-violation 各一测 |
| 11 | Deck 完整性 | 52 张,4×13,4×13,洗牌正确性 |
| 12 | calculateTarget | 24 关目标,前后值都已检查 |
| 13 | GameState 状态机 | doom/violations/joker 上限 |
| 14 | 端到端可玩性 | 各关用什么牌能过 |

## 严格度层级

### Level 1: 单元测试 (Unit)
精确数值,如 `pair.chips = 10 + 14 = 24`。

### Level 2: 边界用例 (Edge)
空牌 / 1 张 / Wheel / 部分手型。

### Level 3: Oracle 交叉验证 (Cross-check)
**这是最关键的层**——独立写一个 poker evaluator,用完全不同的算法(patterns / count-based / brute force)。生产代码和 oracle 在 5000+ 随机手上 type 必须 100% 一致。任何差异都是 bug。

### Level 4: Property 不变量 (Invariants)
对随机输入断言"必须满足"的属性,例如:
- `type` 永远在 10 种合法枚举里
- `mult` 永远 ≥ 1 且 ≤ 8
- `chips` 不能是 NaN / Infinity
- `chips ≥ handType.chips`(基础值是下限)

### Level 5: 端到端 (E2E)
模拟真实游戏场景:同花顺 + 2 joker 能不能过 ante 5?

## 添加新测试时

**手型/计分相关**:必须同时通过 Oracle 校验,否则不算通过。

```bash
# 修改了 hand-eval.js 或 jokers.js 或 directive.js 后:
node test/harness.js --seed=42     # 用固定种子复现
```

如果失败,oracle 会指出"在 hand X 用 cards Y 时,生产返回 STRAIGHT,oracle 返回 FLUSH"。这是找到 bug 的最快路径。

## 报告示例

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  通过: 137    失败: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

各模块覆盖率:
  ✓ 1. cardChips 面值                                    5/5
  ✓ 2. 手型识别 — 正样本                                      13/13
  ...
  ✓ 6. Oracle 交叉校验 — 独立实现对比                            2/2
  ✓ 7. Property 不变量 (1000 随机手)                         7/7
```

## 当下已知未覆盖

- **UI 动画**:`ui.js` 里的 anime.js 调用没测试 — 视觉,不是数据
- **SaveSystem / 本地存储**:虽然加了方法但没测试
- **Shop 出价平衡**:商店出现哪些 joker 是随机的,没断言出价合理性
- **Ending 文案**:`endings.js` 的文本书写没一致性测试

这些**不影响游戏数值正确性**,但玩家体验可能受影响。后续可加。
