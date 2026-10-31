/*
 * 全站内容都在这一个文件里。
 * 加条目 = 往 items 里加一行；加模块 = 往 modules 里加一段。
 * 格式：{ t: 标题, type: 类型, note: 备注, ref: 笔记路径 }
 * type 取值：book 书 / course 课 / paper 论文 / practice 练习 / tool 工具 / note 笔记
 *
 * ref 是可选字段，填 idea-vault 仓库里那篇笔记的相对路径（不带扩展名也行，要带就带 .md）。
 * 例：ref: "计量经济学/OLS 假设.md"  → 条目右侧会出现「笔记 ↗」，点了直接跳过去。
 * 不填就不显示链接。
 *
 * 跳去哪由 meta.obsidian 决定：
 *   填了库名  → 唤起本地 Obsidian 打开那篇（电脑上最顺）
 *   留空      → 退回网页版笔记库（手机上用这个）
 */
window.CONTENT = {
  meta: {
    site: "学习台",
    owner: "王爱民",
    tagline: "金融 · 外语 · 计算机",
    sub: "三条腿走路。缺一条，站不稳。",
    updated: "2026-10-31",
    vault: "https://ethan-a-lab.github.io/idea-vault-web/",
    /* Obsidian 的库名称（不是文件夹路径）。在 Obsidian 里看左下角或「管理仓库」列表，
       显示的那个名字就是。填对之后，点「笔记 ↗」会直接在你的 Obsidian 里打开。
       填错不报错，只是没反应。 */
    obsidian: "idea-vault"
  },

  pillars: [
    {
      id: "finance",
      name: "金融",
      en: "Finance",
      color: "#2F5D50",
      desc: "从教材到数据，从复现到自己的问题。目标不是读懂，是能跑出结果。",
      modules: [
        {
          id: "econometrics",
          name: "计量经济学",
          goal: "期末能独立完成一篇规范实证论文，而不是只会套命令。",
          status: "进行中",
          items: [
            { t: "伍德里奇《计量经济学导论》第 1–3 章", type: "book", note: "重点：OLS 的五个假设，以及假设破了会怎样" },
            { t: "陈强《高级计量经济学及 Stata 应用》第 2 版", type: "book", note: "和伍德里奇对照看，一本讲直觉一本讲操作" },
            { t: "把课程作业数据完整跑一遍", type: "practice", note: "描述统计 → 相关性 → 简单回归 → 解释系数" },
            { t: "整理一份 Stata 命令速查", type: "note", note: "reg / xtreg / ivreg2 / outreg2，配最小可运行例子" },
            { t: "拆解 1 篇《金融研究》实证论文", type: "paper", note: "只看识别策略：它凭什么说这是因果" }
          ]
        },
        {
          id: "investment",
          name: "投资学",
          goal: "能手算并代码复现有效前沿与 CAPM。",
          status: "待启动",
          items: [
            { t: "博迪《投资学》资产组合理论部分", type: "book", note: "第 5–8 章是核心" },
            { t: "用 Python 算一遍马科维茨有效前沿", type: "practice", note: "随机权重蒙特卡洛 + scipy 求最优，两种都做" },
            { t: "用 A 股数据复现 Fama-French 三因子", type: "practice", note: "拆穿「因子能赚钱」这句话的成本有多高" }
          ]
        },
        {
          id: "corporate",
          name: "公司金融",
          goal: "独立做出一份能说服自己的 DCF 估值。",
          status: "待启动",
          items: [
            { t: "罗斯《公司理财》资本结构与股利政策", type: "book", note: "MM 定理是起点不是终点" },
            { t: "选一家上市公司做 DCF 估值", type: "practice", note: "关键不是算出多少钱，是写清每一条假设从哪来" }
          ]
        },
        {
          id: "data",
          name: "数据与工具",
          goal: "数据能自己拿到、自己洗、自己出图。",
          status: "进行中",
          items: [
            { t: "打通一个数据库账号（Wind / Choice / CSMAR）", type: "tool", note: "学校图书馆通常有采购，先去问" },
            { t: "pandas 读财报数据 + matplotlib 出图", type: "practice", note: "目标是给数据加一行就能出图" },
            { t: "用 LaTeX 写完一篇课程论文", type: "practice", note: "过了这一关，以后写论文不再被格式拖住" }
          ]
        }
      ]
    },

    {
      id: "language",
      name: "外语",
      en: "Language",
      color: "#9A6B3F",
      desc: "目标很具体：能读期刊、能写摘要、能开口讲清一个概念。",
      modules: [
        {
          id: "reading",
          name: "学术阅读",
          goal: "英文期刊摘要能一遍读懂，正文不必逐字翻译。",
          status: "进行中",
          items: [
            { t: "每天精读 1 页英文期刊", type: "practice", note: "从 JF / RFS 的摘要开始，别一上来啃正文" },
            { t: "积累金融术语表（Anki 每天 20 张）", type: "tool", note: "术语不熟，读得慢不是因为英语差" },
            { t: "每周翻译 1 段摘要，对照机翻找差距", type: "practice", note: "差距就是你的盲点清单" }
          ]
        },
        {
          id: "writing",
          name: "写作与表达",
          goal: "能写出结构合格的 Abstract 和 Introduction。",
          status: "待启动",
          items: [
            { t: "拆解 Abstract / Introduction 的标准结构", type: "note", note: "找 5 篇顶刊，标出每一句在干什么" },
            { t: "雅思 / 托福写作题库过 10 篇", type: "practice", note: "练的是论证结构，不是背模板" }
          ]
        },
        {
          id: "speaking",
          name: "听说",
          goal: "能在组会上用英文讲清一个概念。",
          status: "待启动",
          items: [
            { t: "影子跟读 15 分钟 / 天", type: "practice", note: "经济学人音频，跟的是节奏不是单词" },
            { t: "每周英文复述一个新概念", type: "practice", note: "录音回听，这一步最难受也最有用" },
            { t: "英语流利说 每周打卡", type: "practice", note: "每月一篇，年底回看进步曲线", ref: "英语/英语流利说-索引.md" }
          ]
        }
      ]
    },

    {
      id: "cs",
      name: "计算机",
      en: "Computer Science",
      color: "#3D4F8C",
      desc: "数学打底、编程当手、AI 当杠杆。三样都不能只停在「知道」。",
      modules: [
        {
          id: "math",
          name: "数学基础",
          goal: "看懂计量教材里的矩阵推导，不再跳公式。",
          status: "进行中",
          items: [
            { t: "线性代数：矩阵运算、特征值、秩", type: "course", note: "直接服务于回归和 PCA，别按数学系标准学" },
            { t: "概率论：条件期望、大数定律、中心极限定理", type: "course", note: "计量的一半难点在这三个东西上" },
            { t: "最优化：拉格朗日、梯度下降", type: "course", note: "理解 MLE 和机器学习共同的地基" }
          ]
        },
        {
          id: "coding",
          name: "编程",
          goal: "给一份脏数据，能独立洗到能跑回归。",
          status: "进行中",
          items: [
            { t: "Python 基础语法与面向对象", type: "course", note: "够用就行，不必先把语言教程看完" },
            { t: "numpy / pandas 数据处理", type: "practice", note: "80% 的时间花在清洗上，练这个不亏" },
            { t: "SQL：SELECT / JOIN / 窗口函数", type: "practice", note: "窗口函数是分水岭" },
            { t: "Stata：do 文件、循环、结果输出", type: "practice", note: "养成写 do 文件而不是敲命令的习惯" }
          ]
        },
        {
          id: "ai",
          name: "AI 应用",
          goal: "能自己搭一个论文问答工具，而不是只会用聊天框。",
          status: "进行中",
          items: [
            { t: "LLM 工作原理：token、attention、上下文窗口", type: "course", note: "知道它为什么会有幻觉，才谈得上用好" },
            { t: "Prompt 工程：结构化提示、few-shot、思维链", type: "practice", note: "把它当接口设计，不是当咒语念" },
            { t: "RAG：向量检索 + 重排，搭一个论文问答", type: "practice", note: "这是最值得先做的项目，直接服务于文献综述" },
            { t: "Agent：工具调用与多步规划", type: "practice", note: "先想清楚失败时怎么回滚" },
            { t: "把 AI 接进实证流程：文献、代码、清洗", type: "note", note: "记录哪些环节真的省了时间，哪些反而更慢" }
          ]
        }
      ]
    }
  ],

  /* ---------- 公开层：成果展示 ----------
   * 这部分是给外人看的，静态渲染，不需要登录，也不读数据库。
   * 加一条成果 = 往下面数组里加一个对象。
   */
  works: [
    {
      title: "个人学习站（本站）",
      kind: "项目",
      year: "2026",
      desc: "把金融、外语、计算机三条学习主线收敛到一个入口。前端纯静态托管在 Cloudflare Pages，私密数据后续接 Supabase。",
      link: "",
      tags: ["前端", "Cloudflare Pages"]
    },
    {
      title: "计量经济学课程论文",
      kind: "论文",
      year: "2026",
      desc: "待补：题目、数据来源、识别策略、主要结论。这里写清「凭什么说这是因果」，比写结论更重要。",
      link: "",
      tags: ["面板数据", "Stata"]
    },
    {
      title: "论文问答工具",
      kind: "项目",
      year: "2027",
      desc: "待补：用 RAG 把本地论文库变成可检索的问答，目标是压掉文献综述里最耗时的翻找环节。",
      link: "",
      tags: ["RAG", "Python"]
    }
  ]
};
