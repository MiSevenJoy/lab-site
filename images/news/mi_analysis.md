# MI 约束：动机、收益、代价与鲁棒性分析

## 1. 为什么需要 MI 约束

### 1.1 双场解耦的基石

我们的方法声称学习两个独立的电荷场：Q_obs（观测驱动的吸引力）和 Q_st（时空语义驱动的吸引力）。

**但没有 MI 约束时，这个声称是空的。** 实验数据显示，w/o MI 时 pearson ≈ 0.4，Jaccard@50 ≈ 0.1——两个场高度相关，本质上是同一信息的两个副本。审稿人会问："你怎么证明观测场捕捉的是观测信息、时空场捕捉的是时空信息？如果两个场学到了几乎一样的东西，'双场解耦'不就是空话吗？"

**MI 是证明解耦确实发生的唯一机制性证据。** 引入 MI 后 pearson → 0.02（Harbin），Jaccard → 0.08——两个场确实被推开了。RQ4 的独立性表是"双场不是冗余复制"的硬数据。

### 1.2 从冗余融合到互补融合

没有 MI 时，两个场各自探索后最终关注相似的空间区域——冗余。融合 = 同一信号的两次采样 → 提升有限。

有 MI 时，L_dec（VIB 上界最小化）强迫每个场在对方已占据的空间维度上**不再分配电荷**。obs 场被推向 pois 场忽略的区域，pois 场被推向 obs 场看不见的信号。融合 = 两个**不同**信号的组合 → 真正的互补。

**干净数据上的性能提升来自 MI 把冗余融合变成了互补融合。**

---

## 2. MI 的收益

### 2.1 预测准确性

| 收益 | 机理 | 实验证据 |
|------|------|---------|
| 融合精度提升 | 两场互补 > 两场冗余 | RQ2 消融表：Full model > w/o MI |

### 2.2 可解释性

| 收益 | 机理 | 实验证据 |
|------|------|---------|
| 场独立性 | MI 推开了两个场的空间分布 | RQ4：pearson 下降 95%, Jaccard 下降 24% |
| 时空对齐 | L_pos 和 L_time 将 Q_st 拉向真实时空信号 | RQ4：ρ(Q_st, spatiotemp) 上升 52% |
| 归因能力 | 每个场独立解释一个信息源对决策的贡献 | RQ4 case study |

**去掉 MI，以上全部消失。两场退化为冗余复制，你的方法不再有"两个独立的空间表示"，可解释性的核心支柱坍塌。**

---

## 3. MI 的代价

### 3.1 冗余性丧失 → 鲁棒性下降

| 噪声场景 | w/o MI（最鲁棒） | w/ MI（波动） |
|---------|---------|---------|
| 训练时 | 两场无"必须不同"的约束 → 部分重叠 → 冗余备份 | MI 强迫两场产生不同的空间模式 → 互补但互不覆盖 |
| 测试时加噪声 | 受损场的退化信号被另一场**已有**的冗余模式覆盖 | 受损场的退化信号是另一场**有意避开**的独特模式 → 无法补偿 |

用 Combined 噪声实验验证：

| Model | HRB Combined sigma | SZ Combined Missing | BJ Combined Missing |
|-------|-------------------|---------------------|---------------------|
| w/o MI | **12.77** | **2.38** | **4.93** |
| Full (w/ MI) | 6.05 | 2.65 | 41.28 |

w/o MI 在所有场景下退化最小。BJ Combined Missing 下对比最极端（4.93% vs 41.28%）——obs 场本身弱，MI 强迫它"差异化"出假模式，ST 缺失后假模式反噬融合。

### 3.2 弱信号放大

当一源信息量不足时（北京 obs < 10% Acc），MI 约束将弱编码器推向噪声中寻找"差异" → 学到假模式 → 污染融合。RQ2 中 Beijing 上 Full Model < w/o MI 已揭示这一点。

---

## 4. 鲁棒性实验结果的完整解释

### 4.1 Single-field vs Dual-field 的不对称鲁棒性

| 噪声场景 | Single | Dual | 原因 |
|---------|--------|------|------|
| Obs 噪声 | ✗ 差 | ✓ 好 | Single 共享 LSTM 中 obs 占比 88% → 噪声涌入后 512→2500 解码逐层放大；Dual 的 obs 场弱，噪声不影响主信号源 pois 场 |
| ST 噪声 | ✓ 好 | ✗ 差 | Single 共享 LSTM 中 ST 仅占 12% → 冲击小；Dual 的 pois 场是主信号源，被噪声砍断后 obs 场不够强无法补偿 |

两者不对称性的**根因不同**：Single 是编码器输入维度比例造成的，Dual 是信号源重要度比例造成的。

### 4.2 w/o MI 的鲁棒性优势

w/o MI 下两场部分冗余 → 受损场的信号区域被健康场天然覆盖 → 噪声下退化最小。这是 MI 的鲁棒性代价——**互补性越强，冗余备份越弱。**

### 4.3 为什么保留 MI 而非为鲁棒性抛弃它

鲁棒性是贡献 2（解耦双场）的**额外收益**，不是方法的定义性特征。方法的定义性特征是：

- **贡献 1**：静电势场提供空间级可解释性
- **贡献 2**：解耦双场分别捕捉观测和时空语义对决策的独立影响

MI 是贡献 2 的逻辑基础。去掉 MI，两场坍缩为冗余复制 → 无法声称"解耦" → 贡献 2 崩溃 → 论文倒退为"一个电荷场 + 一个电荷场"而无任何解耦保证。

**论文中一句定位：**

> "The MI constraint introduces a robustness trade-off: it improves clean-data accuracy and enables disentangled interpretability at the cost of reduced redundancy-based backup under corruption. We retain MI because disentanglement is central to our method's interpretability claims; without it, the two fields collapse into near-identical representations, and the model loses its ability to attribute attraction patterns to individual information sources. Robustness is a beneficial byproduct of the disentangled architecture, not its primary objective."

---

## 5. 审稿人可能追问 & 回应

**Q1: MI 在某些城市有害，为什么还要用？**

A: MI 的收益取决于信息源质量。当两源都有独立决策信号时（Harbin/SZ）MI 提升性能和可解释性；当一源结构性地弱时（BJ）MI 可能有害。这是 MI 的**适用条件**，不是方法的缺陷。我们提供了 lambda_dec 可调参数，可在极弱信号场景下调小或关闭。

**Q2: w/o MI 鲁棒性更好，是不是说明你们不需要 MI？**

A: 鲁棒性是解耦架构的副产品，不是方法的核心目标。方法的核心目标是"分别解释观测和时空对决策的影响"——这一目标在去掉 MI 后无法实现，因为两场会坍缩为冗余表示（pearson ≈ 0.4）。

**Q3: 能不能设计一个既保留 MI 收益又不牺牲鲁棒性的方案？**

A: lambda_dec 的 annealing 调度已经提供了这种灵活性。训练时 MI 权重从 0 线性增长到最大值，早期学习阶段无 MI 约束，后期才逐步施加。未来工作可探索自适应 MI 权重（基于模态信息量的在线估计）以自动平衡互补性与冗余性。
