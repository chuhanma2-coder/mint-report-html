# 多人协作、异步审阅与最终发布

## 用户流程

```text
领导大纲 + 团队已确定分工
        ↓ 协调人只执行一次
report.mint-task.json
        ↓
A / B / C 并行生成各自一个 .mint-section.html
        ↓
领导随到随审，直接改或给意见；负责人保存当前 HTML
        ↓
一次确定性合并 → 完整可编辑 .mint-report.html
        ↓
一次最终发布 → HTML + 原生可编辑 PPTX + PDF
```

任务卡不是重新分工，也不是视觉模板。团队先按正常方式认领工作；指定协调人再把“原大纲＋已定分工”交给 Agent，生成一次任务卡。Skill 自动写入稳定章节 ID、顺序、Skill 契约和设计契约。简洁清新、严格 16:9、无页眉页脚页码是内置规则，用户不用重复填写。

## 1. 协调人生成一次任务卡

输入示例：

```json
{
  "reportId": "weekly-review-2026w36",
  "title": "经营例会汇报",
  "outlineOrder": ["1", "2", "3", "4", "6", "7", "8"],
  "warnings": ["原始大纲未出现第 5 项，原样保留，未补写"],
  "sections": [
    { "id": "product", "title": "产品与转化", "order": 1, "owner": "A", "outlineItems": ["1", "2", "3"] },
    { "id": "operations", "title": "运营与合作", "order": 2, "owner": "B", "outlineItems": ["4", "6"] },
    { "id": "finance", "title": "财务与计划", "order": 3, "owner": "C", "outlineItems": ["7", "8"] }
  ]
}
```

```bash
node scripts/collaboration-package.mjs brief brief-config.json report.mint-task.json
```

任务卡自动包含 `skillContractVersion` 和 `designContract`。章节具体有几页不在任务卡中预设；Scene 数由内容决定，最终按章节 `order` 合并。负责人不需要自己编 `sectionId`。

## 2. 每位负责人生成一个工作 HTML

每人把同一任务卡、自己的原始材料和负责人名称交给 Agent。Agent 只处理该负责人材料，先 `prepare`，再按 `expression-routes.json` 选择当前 Scene 需要的数据表达规则，批量完成整章 Scene，最后 `review`。

```bash
node scripts/collaboration-package.mjs pack-section \
  <个人项目目录> report.mint-task.json <章节ID> A-当前版.mint-section.html
```

正常交付只有一个 `.mint-section.html`。文件内从第一版开始就包含来源锁、内容图、来源台账、统一可编辑模型、Scene 源、实际引用素材、任务卡引用和完整性哈希。它不是从 DOM 反推的 ZIP，也不是截图。

文件可以改名。合并身份来自内部的 `reportId + sectionId + revision + contentHash`，不来自文件名。

## 3. 领导分别审阅

打开工作 HTML，按 `E` 或点击编辑：

- 标题、正文和面向汇报对象的必要注释可直接输入；来源字段可在编辑器中维护用于内部追溯，但不得显示在正式汇报页面；
- 表格可粘贴 TSV 并调整表头和单元格；
- 图表可修改类型、标题、单位、周期、来源、分类、系列和值；
- 图片可替换并修改替代文字；
- 关系图可修改有来源依据的节点和边。

修改一个字时只更新内存模型，内容哈希在 400ms 防抖或保存时计算，不重算全部图片和来源。点击“保存当前版”或按 `Cmd/Ctrl+S`：

- Chrome/Edge 支持时，第一次选择文件，当前会话后续写回同一文件；
- 浏览器不支持直接写入时，只下载一个包含当前修改的 HTML；
- 日常不导出 ZIP。

直接文字/数据修改不需要 Agent。拆页、并页、主题调整、改变论证顺序等结构性修改，把当前 HTML 交给 Agent：

```bash
node scripts/collaboration-package.mjs unpack A-当前版.mint-section.html A-current-project
node scripts/run-creative-workflow.mjs revision A-current-project
node scripts/collaboration-package.mjs pack-section A-current-project report.mint-task.json <章节ID> A-当前版.mint-section.html
```

Agent 必须从当前工作文件恢复项目和人工修改，只重做受影响 Scene，不能退回初始来源重新覆盖领导修改。

## 4. 合并当前工作文件

```bash
node scripts/collaboration-package.mjs merge \
  report.mint-task.json merged-report \
  A-当前版.mint-section.html B-当前版.mint-section.html C-当前版.mint-section.html
```

合并器模型调用数必须为 0。它只做：

- 报告、章节、设计契约和 SHA-256 完整性校验；
- 按任务卡检查缺失章节并排序；
- 给 Scene、事实、来源、表格、图表、图片、关系图和素材路径加章节命名空间；
- 确定性统一全局 token、字体、背景、1920×1080 舞台和动效基线；
- 合并来源台账和统一模型，保留所有人工修改；
- 输出 `<reportId>-review.mint-report.html`。

版本规则：

- 同章节、同 `contentHash`：自动去重；
- 一份的 lineage 包含其他全部版本：选择严格后代；
- 同 revision 不同 hash，或从共同祖先分叉：阻断并要求人工选择；
- 文件名变化不影响上述判断。

合并不生成页码，也不二次摘要、改标题或补事实。

## 5. 最终发布

领导可以继续在完整工作 HTML 中直接修改并保存。最终发布人必须以领导保存的当前 `.mint-report.html` 为入口，先恢复当前项目；不能直接发布合并时留下的旧项目目录：

```bash
node scripts/collaboration-package.mjs unpack \
  <领导保存的当前版.mint-report.html> merged-current
```

跨章节拆并 Scene 时，在 `merged-current` 上执行结构性 revision。只有文字/数据直接修改时不需要重新创作 Scene，但仍必须从当前工作 HTML 恢复模型。

结构冻结后执行：

```bash
node scripts/run-creative-workflow.mjs publish merged-current
```

Publish 用一次浏览器会话完成 desktop/laptop/print QA、当前 PDF 和 PPT 布局快照；不运行手机端检查。PPTX 复用该快照生成原生可编辑对象。最终结果：

- `report.html`：离线、动态、全内容可编辑；
- `report.pptx`：16:9，原生文字/表格/图表/图片/形状/关系图，无页眉页脚页码；
- `report.pdf`：同一当前模型的静态分发版；
- `delivery-manifest.json`：格式当前性和门禁结果。

HTML 的滚动、悬停、点击和动画在 PPTX 中变成明确静态状态，不承诺像素级相同；标题、正文、数据、关系、图片、顺序和来源必须相同。

## 技术 ZIP

ZIP 只用于排障、兼容旧项目或长期归档：

```bash
node scripts/collaboration-package.mjs export-zip A-当前版.mint-section.html A-technical.mint-section.zip
```

v0.14 合并器读取 v0.12 和 v0.14 工作文件，并输出 `compatibility-report.json`。旧包在合并时显式升级；Scene、Atom 和业务对象 ID 只在结构化引用位置加命名空间，base64、data URL、二进制素材、原文、引文和哈希保持逐字节不变。未知版本直接阻断。正常用户流程仍不要求负责人反复导出 ZIP。
