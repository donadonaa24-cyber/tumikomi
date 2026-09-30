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

  // Career ladder: each mission clear is a promotion. Names and comments are fictional.
  const CAREER = [
    { key: "trainee", title: "研修生", requirement: "入社時の役職" },
    { key: "handler", title: "荷役スタッフ", mission: 1, requirement: "MISSION 01 クリア",
      comment: "重量を読んでから動けるようになった。明日から倉庫の一員として荷を任せます。" },
    { key: "driver", title: "乗務員", mission: 2, requirement: "MISSION 02 クリア",
      comment: "重心を整えてから走り出せる人に、ハンドルを預けます。" },
    { key: "leader", title: "積付けリーダー", mission: 3, requirement: "MISSION 03 クリア",
      comment: "壊れ物を守り切った判断を、今度は後輩へ伝えてください。" },
    { key: "chief", title: "班長", mission: 4, requirement: "MISSION 04 クリア",
      comment: "一本のベルトにも理由がある。その理由を言葉にできる班長であってください。" },
    { key: "dispatcher", title: "配車係", mission: 5, requirement: "MISSION 05 クリア",
      comment: "これからは、どの依頼を受けるかも仕事です。受けた荷は必ず届け切ってください。" },
    { key: "manager", title: "営業所長", dispatch: true, requirement: "配車便を1回クリア",
      comment: "受ける勇気と、断る判断。その両方で営業所を守ってください。" }
  ];

  // Dispatch run: the player chooses which orders to accept before the normal pickup/loading/drive.
  const DISPATCH = {
    id: 6,
    orderCount: 12,
    maxPayloadKg: 1800,
    timeLimit: 300,
    leftoverPenaltyRate: .5,
    targetRatio: .92
  };
  const CLIENTS = {
    normal: ["地域の小売店", "事務用品の卸売", "住宅設備の工務店", "イベント会社", "学校の事務室"],
    heavy: ["製造工場", "建設現場", "設備保守センター"],
    glass: ["研究施設", "建具店", "照明の専門店"],
    pet: ["動物病院", "ペット用品店"],
    priority: ["医療機関", "部品センター", "市役所の倉庫"]
  };
  const MATERIAL_COST = { panel: 600, foam: 300, strap: 500 };

  function seededRandom(seed) {
    let state = (seed >>> 0) || 1;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dispatchTemplates() {
    const byType = { normal: [], heavy: [], protected: [] };
    stages.forEach(function (stage) {
      stage.packages.forEach(function (pkg) {
        if (pkg.type === "heavy") byType.heavy.push(pkg);
        else if (pkg.protectedCargo) byType.protected.push(pkg);
        // "通常便" names would read oddly as priority orders ("配送2・通常便B"), so they are left out.
        else if (pkg.type === "normal" && !/^通常便/.test(pkg.name)) byType.normal.push(pkg);
      });
    });
    return byType;
  }

  function pickDistinct(list, count, random) {
    const pool = list.slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      const index = Math.floor(random() * pool.length);
      const item = pool.splice(index, 1)[0];
      if (picked.some(function (other) { return other.name === item.name; })) continue;
      picked.push(item);
    }
    return picked;
  }

  // Cheapest legal restraint plan for a set of orders: foam for protected cargo, then the cheapest remaining stock.
  function dispatchPlan(orders, materials) {
    const protectedCount = orders.filter(function (pkg) { return pkg.protectedCargo; }).length;
    const restraintCount = materials.panel + materials.foam + materials.strap;
    const weightKg = orders.reduce(function (sum, pkg) { return sum + pkg.weightKg; }, 0);
    const fee = orders.reduce(function (sum, pkg) { return sum + pkg.fee; }, 0);
    let foamLeft = materials.foam - protectedCount;
    let strapLeft = materials.strap;
    let materialCost = protectedCount * MATERIAL_COST.foam;
    orders.filter(function (pkg) { return !pkg.protectedCargo; }).forEach(function () {
      if (foamLeft > 0) { foamLeft -= 1; materialCost += MATERIAL_COST.foam; }
      else if (strapLeft > 0) { strapLeft -= 1; materialCost += MATERIAL_COST.strap; }
      else materialCost += MATERIAL_COST.panel;
    });
    return {
      weightKg,
      fee,
      materialCost,
      protectedCount,
      restraintCount,
      overweightKg: Math.max(0, weightKg - DISPATCH.maxPayloadKg),
      foamShort: Math.max(0, protectedCount - materials.foam),
      restraintShort: Math.max(0, orders.length - restraintCount),
      estimatedRevenue: fee - materialCost
    };
  }

  function bestDispatchRevenue(orders, materials) {
    let best = 0;
    const total = 1 << orders.length;
    for (let mask = 1; mask < total; mask += 1) {
      const chosen = orders.filter(function (_, index) { return mask & (1 << index); });
      const plan = dispatchPlan(chosen, materials);
      if (plan.overweightKg || plan.foamShort || plan.restraintShort) continue;
      best = Math.max(best, plan.estimatedRevenue);
    }
    return best;
  }

  function createDispatchBoard(seed) {
    const random = seededRandom(seed);
    const templates = dispatchTemplates();
    const materials = {
      panel: 2 + Math.floor(random() * 2),
      foam: 2 + Math.floor(random() * 2),
      strap: 3 + Math.floor(random() * 2)
    };
    const client = function (type) {
      const list = CLIENTS[type] || CLIENTS.normal;
      return list[Math.floor(random() * list.length)];
    };
    const jitter = function (fee) { return Math.round(fee * (.85 + random() * .3) / 100) * 100; };
    const orders = [];
    const add = function (source, type, options) {
      const index = orders.length + 1;
      const pkg = cargo("d_" + index, type, source.width, source.height, Object.assign({
        name: source.name,
        weightKg: source.weightKg,
        fee: jitter(source.fee),
        replacementCost: source.replacementCost,
        maxStackKg: source.maxStackKg,
        keepUpright: source.keepUpright,
        rotatable: source.rotatable
      }, options || {}));
      pkg.client = client(options && options.clientType ? options.clientType : type);
      pkg.orderNo = index;
      orders.push(pkg);
    };
    pickDistinct(templates.heavy, 3, random).forEach(function (source) { add(source, "heavy"); });
    pickDistinct(templates.protected, 3, random).forEach(function (source) { add(source, source.type); });
    const normals = pickDistinct(templates.normal, 6, random);
    normals.slice(0, 3).forEach(function (source, index) {
      add(source, "priority", {
        name: "配送" + (index + 1) + "・" + source.name,
        fee: Math.round(jitter(source.fee) * 1.3 / 100) * 100,
        deliveryOrder: index + 1,
        clientType: "priority"
      });
    });
    normals.slice(3).forEach(function (source) { add(source, "normal"); });
    const best = bestDispatchRevenue(orders, materials);
    return {
      seed,
      orders,
      materials,
      maxPayloadKg: DISPATCH.maxPayloadKg,
      timeLimit: DISPATCH.timeLimit,
      leftoverPenaltyRate: DISPATCH.leftoverPenaltyRate,
      bestRevenue: best,
      targetRevenue: Math.floor(best * DISPATCH.targetRatio / 500) * 500
    };
  }

  function createDispatchStage(board, acceptedIds) {
    const accepted = board.orders.filter(function (pkg) { return acceptedIds.indexOf(pkg.id) >= 0; })
      .map(function (pkg) { return JSON.parse(JSON.stringify(pkg)); });
    return {
      id: DISPATCH.id,
      dispatch: true,
      board,
      acceptedIds: acceptedIds.slice(),
      title: "配車便・受けた荷を届け切れ",
      objective: "受注した依頼を積み残さず、安全売上の目標を超える",
      description: "配車係として受けた依頼の便です。積み残した依頼は運賃の50%を違約金として差し引きます。重量・固定資材・破損厳禁を考えて受注したかが試されます。",
      lesson: "受ける前に積めるかを考える。受けた荷を届け切ることが、次の依頼につながる信用です。",
      tip: "受注した荷物はすべて積むのが基本です。積めない荷物がある場合、違約金と運賃を比べて判断します。",
      timeLimit: board.timeLimit,
      targetRevenue: board.targetRevenue,
      truck: truck(board.maxPayloadKg),
      materials: Object.assign({}, board.materials),
      leftoverPenaltyRate: board.leftoverPenaltyRate,
      rules: { weight: true, balance: true, protected: true, securement: true, delivery: true },
      packages: accepted
    };
  }

  window.StageData = {
    stages,
    TRUCK: BASE_TRUCK,
    CAMPAIGN_TARGET,
    CAREER,
    DISPATCH,
    createDispatchBoard,
    createDispatchStage,
    dispatchPlan,
    bestDispatchRevenue
  };
})();
