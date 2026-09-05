(function () {
  "use strict";

  const CAMPAIGN_TARGET = 145000;
  const BASE_TRUCK = { x: 184, y: 159, width: 795, height: 304 };
  const colors = {
    normal: ["#C98A4A", "#B9773D", "#D59C59", "#A86F42"],
    heavy: ["#6F8297", "#536C86"],
    glass: ["#52B7C5", "#69C8D0"],
    pet: ["#83B96F", "#98C785"],
    priority: ["#D65D45", "#E0764F", "#C94B42"]
  };

  function truck(maxPayloadKg) {
    return Object.assign({}, BASE_TRUCK, { maxPayloadKg });
  }

  function cargo(id, type, width, height, options) {
    const o = options || {};
    const palette = colors[type] || colors.normal;
    const index = Number(id.replace(/\D/g, "")) || 0;
    const weightKg = o.weightKg || (type === "heavy" ? 350 : 100);
    const protectedCargo = type === "glass" || type === "pet" || Boolean(o.protectedCargo);
    return {
      id,
      name: o.name || "一般貨物",
      type,
      width,
      height,
      weightKg,
      weight: weightKg,
      fee: o.fee || 2500,
      replacementCost: o.replacementCost || (protectedCargo ? 30000 : 9000),
      maxStackKg: o.maxStackKg == null ? (type === "heavy" ? 900 : 260) : o.maxStackKg,
      fragile: protectedCargo,
      protectedCargo,
      keepUpright: type === "pet" || Boolean(o.keepUpright),
      rotatable: o.rotatable !== false,
      requiresRestraint: o.requiresRestraint !== false,
      deliveryOrder: o.deliveryOrder || 0,
      color: o.color || palette[index % palette.length],
      icon: o.icon || ({ heavy: "重", glass: "硝", pet: "生", priority: String(o.deliveryOrder || "!") })[type] || "",
      note: o.note || "",
      rotation: 0,
      placed: false,
      braced: false,
      cushioned: false,
      strapped: false,
      x: 0,
      y: 0
    };
  }

  const stages = [
    {
      id: 1,
      title: "重量を読んで積む",
      objective: "実重量と最大積載量を覚える",
      description: "すべての荷札に重量と運賃があります。合計重量を最大積載量以内に収め、荷台の床から積みましょう。",
      lesson: "積む前に『品名・重量・取扱注意』を確認。重量だけで荷物が止まるとは考えません。",
      tip: "この便は全品積載できます。まず大きく重い荷物から床へ置きます。",
      timeLimit: 150,
      targetRevenue: 14000,
      truck: truck(700),
      materials: { panel: 0, foam: 0, strap: 0 },
      rules: { weight: true, balance: false, protected: false, securement: false, delivery: false },
      packages: [
        cargo("s1_1", "normal", 150, 82, { name: "工具パーツ", weightKg: 120, fee: 2800, maxStackKg: 260 }),
        cargo("s1_2", "normal", 126, 106, { name: "作業用品", weightKg: 80, fee: 2200, maxStackKg: 180 }),
        cargo("s1_3", "normal", 178, 70, { name: "梱包資材", weightKg: 60, fee: 1900, maxStackKg: 150 }),
        cargo("s1_4", "normal", 112, 120, { name: "予備部品", weightKg: 150, fee: 3400, maxStackKg: 320 }),
        cargo("s1_5", "heavy", 176, 92, { name: "小型発電機", weightKg: 260, fee: 5200, maxStackKg: 850 })
      ]
    },
    {
      id: 2,
      title: "重心と荷重バランス",
      objective: "重い物を低く、前後を均等にする",
      description: "重量物を床に置き、前方・後方のどちらかへ偏らないように配置します。高い位置の重量物も危険です。",
      lesson: "重心は低く、重量は荷台全体へ分散。小さく重い荷物はコンパネなどで接地荷重も分散します。",
      tip: "上の『前後荷重』を見ながら、重い2品を中心線の前後へ分けます。",
      timeLimit: 190,
      targetRevenue: 25000,
      truck: truck(1500),
      materials: { panel: 1, foam: 0, strap: 1 },
      rules: { weight: true, balance: true, protected: false, securement: false, delivery: false },
      packages: [
        cargo("s2_1", "normal", 138, 78, { name: "制服ケース", weightKg: 140, fee: 3200 }),
        cargo("s2_2", "normal", 118, 98, { name: "備品箱", weightKg: 120, fee: 3000 }),
        cargo("s2_3", "normal", 158, 68, { name: "紙製品", weightKg: 160, fee: 3300, maxStackKg: 240 }),
        cargo("s2_4", "normal", 104, 116, { name: "消耗品", weightKg: 90, fee: 2700 }),
        cargo("s2_5", "heavy", 176, 92, { name: "金属部品", weightKg: 480, fee: 7400, maxStackKg: 1100 }),
        cargo("s2_6", "heavy", 146, 108, { name: "機械工具", weightKg: 390, fee: 6900, maxStackKg: 1000 })
      ]
    },
    {
      id: 3,
      title: "破損厳禁便",
      objective: "ガラス・ペットケージを守る",
      description: "破損厳禁貨物は上積み禁止・天地無用。発泡材を隙間へ充填して横ずれを防ぎます。",
      lesson: "壊れやすい荷物は荷重を掛けず、隙間を埋めて接触を和らげます。生体ケージは横倒しできません。",
      tip: "硝・生マークの3品を選び、それぞれ『発泡材』を使ってから点検します。",
      timeLimit: 220,
      targetRevenue: 36500,
      truck: truck(1150),
      materials: { panel: 1, foam: 3, strap: 2 },
      rules: { weight: true, balance: true, protected: true, securement: false, delivery: false },
      packages: [
        cargo("s3_1", "normal", 142, 82, { name: "書類箱", weightKg: 110, fee: 3200 }),
        cargo("s3_2", "normal", 126, 104, { name: "雑貨", weightKg: 90, fee: 2900 }),
        cargo("s3_3", "normal", 166, 70, { name: "布製品", weightKg: 100, fee: 3100 }),
        cargo("s3_4", "heavy", 176, 94, { name: "モーター", weightKg: 320, fee: 6300, maxStackKg: 900 }),
        cargo("s3_5", "glass", 116, 96, { name: "板ガラス", weightKg: 140, fee: 8500, replacementCost: 52000, maxStackKg: 0, keepUpright: true }),
        cargo("s3_6", "glass", 138, 78, { name: "精密計測器", weightKg: 110, fee: 9000, replacementCost: 68000, maxStackKg: 0 }),
        cargo("s3_7", "pet", 132, 104, { name: "ペットケージ", weightKg: 90, fee: 7500, replacementCost: 50000, maxStackKg: 0, rotatable: false })
      ]
    },
    {
      id: 4,
      title: "荷崩れを止めろ",
      objective: "コンパネ・発泡材・ベルトで固定する",
      description: "通常走行でも荷物は動きます。すべての積荷を、コンパネ・発泡材・ラッシングベルトのいずれかで固定します。",
      lesson: "コンパネは荷を面で押さえ、発泡材は隙間を埋め、ベルトは固定点へ緊結します。用途を考えて使い分けます。",
      tip: "ガラスには発泡材。重量物にはベルト。箱の列はコンパネで押さえると覚えましょう。",
      timeLimit: 250,
      targetRevenue: 36000,
      truck: truck(1800),
      materials: { panel: 3, foam: 2, strap: 3 },
      rules: { weight: true, balance: true, protected: true, securement: true, delivery: false },
      packages: [
        cargo("s4_1", "normal", 128, 94, { name: "日用品A", weightKg: 140, fee: 3500 }),
        cargo("s4_2", "normal", 154, 72, { name: "日用品B", weightKg: 130, fee: 3400 }),
        cargo("s4_3", "normal", 104, 114, { name: "交換部品", weightKg: 170, fee: 3900 }),
        cargo("s4_4", "heavy", 178, 92, { name: "工作機械", weightKg: 520, fee: 8200, maxStackKg: 1200 }),
        cargo("s4_5", "heavy", 150, 106, { name: "鋼材ケース", weightKg: 430, fee: 7600, maxStackKg: 1100 }),
        cargo("s4_6", "glass", 116, 92, { name: "照明ガラス", weightKg: 90, fee: 6500, replacementCost: 42000, maxStackKg: 0 }),
        cargo("s4_7", "glass", 136, 76, { name: "検査装置", weightKg: 105, fee: 7200, replacementCost: 56000, maxStackKg: 0 }),
        cargo("s4_8", "normal", 112, 86, { name: "保守用品", weightKg: 95, fee: 3000 })
      ]
    },
    {
      id: 5,
      title: "実戦・利益を残せ",
      objective: "安全と売上を両立し、目標運賃を稼ぐ",
      description: "最大積載量、重心、破損厳禁、配送順、固定をすべて確認。高運賃の追加便が来ても過積載は禁止です。",
      lesson: "多く積めば売上は増えますが、事故・破損・遅延は利益を失います。安全に届けて初めて運賃です。",
      tip: "全品を積む必要はありません。重量・資材・運賃を見比べ、利益の高い荷物を選びます。",
      timeLimit: 300,
      targetRevenue: 55000,
      truck: truck(2000),
      materials: { panel: 3, foam: 2, strap: 4 },
      rules: { weight: true, balance: true, protected: true, securement: true, delivery: true },
      packages: [
        cargo("s5_1", "priority", 120, 78, { name: "配送1・医療品", weightKg: 120, fee: 7200, deliveryOrder: 1 }),
        cargo("s5_2", "priority", 138, 84, { name: "配送2・部品", weightKg: 170, fee: 6500, deliveryOrder: 2 }),
        cargo("s5_3", "priority", 154, 68, { name: "配送3・資材", weightKg: 150, fee: 5800, deliveryOrder: 3 }),
        cargo("s5_4", "normal", 126, 74, { name: "通常便A", weightKg: 110, fee: 3300 }),
        cargo("s5_5", "normal", 114, 98, { name: "通常便B", weightKg: 130, fee: 3500 }),
        cargo("s5_6", "normal", 148, 66, { name: "通常便C", weightKg: 90, fee: 2900 }),
        cargo("s5_7", "heavy", 164, 86, { name: "発電機", weightKg: 520, fee: 8800, maxStackKg: 1200 }),
        cargo("s5_8", "heavy", 144, 100, { name: "金属部品", weightKg: 430, fee: 7600, maxStackKg: 1100 }),
        cargo("s5_9", "glass", 110, 92, { name: "ガラス器具", weightKg: 85, fee: 7200, replacementCost: 48000, maxStackKg: 0 }),
        cargo("s5_10", "pet", 132, 104, { name: "ペットケージ", weightKg: 85, fee: 7800, replacementCost: 52000, maxStackKg: 0, rotatable: false })
      ],
      additionalPackage: cargo("s5_express", "heavy", 184, 106, {
        name: "緊急追加・精密機械",
        color: "#E8AE55",
        weightKg: 420,
        fee: 15000,
        replacementCost: 90000,
        maxStackKg: 1000,
        icon: "+"
      }),
      events: ["surprise"]
    }
  ];

  window.StageData = { stages, TRUCK: BASE_TRUCK, CAMPAIGN_TARGET };
})();
