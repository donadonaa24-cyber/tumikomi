(function () {
  "use strict";

  const MATERIAL_COST = { panel: 600, foam: 300, strap: 500 };

  function rankFor(score) {
    if (score >= 95) return { key: "S", label: "安全積載マスター" };
    if (score >= 85) return { key: "A", label: "現場リーダー" };
    if (score >= 70) return { key: "B", label: "安全に配送完了" };
    if (score >= 50) return { key: "C", label: "要改善" };
    return { key: "D", label: "運行中止レベル" };
  }

  function yen(value) {
    return "¥" + Math.round(value || 0).toLocaleString("ja-JP");
  }

  function packageAbove(item, packages) {
    const r = Collision.rect(item);
    return packages.find(function (other) {
      if (!other.placed || other.id === item.id) return false;
      const o = Collision.rect(other);
      return Math.abs(o.y + o.height - r.y) <= 3 && Collision.horizontalOverlap(r, o) > 4;
    }) || null;
  }

  function materialUsage(packages) {
    return packages.reduce(function (usage, pkg) {
      if (pkg.placed && pkg.braced) usage.panel += 1;
      if (pkg.placed && pkg.cushioned) usage.foam += 1;
      if (pkg.placed && pkg.strapped) usage.strap += 1;
      return usage;
    }, { panel: 0, foam: 0, strap: 0 });
  }

  function isSecured(pkg) {
    return Boolean(pkg.braced || pkg.cushioned || pkg.strapped);
  }

  function analyze(stage, packages) {
    const placed = packages.filter(function (pkg) { return pkg.placed; });
    const forkDamagePackages = packages.filter(function (pkg) { return pkg.forkDamaged; });
    const payloadKg = placed.reduce(function (sum, pkg) { return sum + pkg.weightKg; }, 0);
    const maxPayloadKg = stage.truck.maxPayloadKg;
    const overweightKg = Math.max(0, payloadKg - maxPayloadKg);
    const grossRevenue = placed.reduce(function (sum, pkg) { return sum + pkg.fee; }, 0);
    const usage = materialUsage(placed);
    const materialCost = usage.panel * MATERIAL_COST.panel + usage.foam * MATERIAL_COST.foam + usage.strap * MATERIAL_COST.strap;
    const centerLine = stage.truck.x + stage.truck.width / 2;
    const weightedCenterX = payloadKg
      ? placed.reduce(function (sum, pkg) {
        const r = Collision.rect(pkg);
        return sum + (r.x + r.width / 2) * pkg.weightKg;
      }, 0) / payloadKg
      : centerLine;
    const balanceOffset = payloadKg ? (weightedCenterX - centerLine) / (stage.truck.width / 2) : 0;
    const balanceOffsetPercent = Math.round(balanceOffset * 100);
    const balanceOk = Math.abs(balanceOffset) <= .22;

    const floorY = stage.truck.y + stage.truck.height;
    const weightedHeight = payloadKg
      ? placed.reduce(function (sum, pkg) {
        const r = Collision.rect(pkg);
        return sum + (floorY - (r.y + r.height / 2)) * pkg.weightKg;
      }, 0) / payloadKg
      : 0;
    const centerHeightRatio = weightedHeight / stage.truck.height;
    const topHeavy = centerHeightRatio > .48;

    const crushed = [];
    placed.forEach(function (below) {
      const aboveItems = placed.filter(function (above) {
        if (above.id === below.id) return false;
        const a = Collision.rect(above);
        const b = Collision.rect(below);
        return Math.abs(a.y + a.height - b.y) <= 3 && Collision.horizontalOverlap(a, b) > 4;
      });
      const aboveWeight = aboveItems.reduce(function (sum, item) { return sum + item.weightKg; }, 0);
      if (aboveWeight > below.maxStackKg) {
        crushed.push({ pkg: below, aboveWeight, limit: below.maxStackKg });
      }
    });

    const protectionIssues = [];
    placed.filter(function (pkg) { return pkg.protectedCargo; }).forEach(function (pkg) {
      const reasons = [];
      if (!pkg.cushioned) reasons.push("発泡材なし");
      if (packageAbove(pkg, placed)) reasons.push("上積みあり");
      if (pkg.keepUpright && pkg.rotation % 180 !== 0) reasons.push("横倒し");
      if (reasons.length) protectionIssues.push({ pkg, reasons });
    });

    const unsecured = stage.rules.securement
      ? placed.filter(function (pkg) { return pkg.requiresRestraint && !isSecured(pkg); })
      : [];
    const unstable = placed.filter(function (pkg) {
      return Collision.supportInfo(pkg, placed, stage.truck).ratio < .68 && !isSecured(pkg);
    });

    const priority = placed.filter(function (pkg) { return pkg.deliveryOrder > 0; });
    let deliveryInversions = 0;
    for (let i = 0; i < priority.length; i += 1) {
      for (let j = i + 1; j < priority.length; j += 1) {
        const first = priority[i].deliveryOrder < priority[j].deliveryOrder ? priority[i] : priority[j];
        const later = first === priority[i] ? priority[j] : priority[i];
        const firstCenter = first.x + Collision.dimensions(first).width / 2;
        const laterCenter = later.x + Collision.dimensions(later).width / 2;
        if (firstCenter > laterCenter) deliveryInversions += 1;
      }
    }

    const blockingIssues = [];
    const warnings = [];
    if (overweightKg) blockingIssues.push("最大積載量を " + overweightKg + "kg 超過しています");
    if (stage.rules.balance && !balanceOk) blockingIssues.push("前後荷重が " + Math.abs(balanceOffsetPercent) + "% 偏っています");
    if (stage.rules.balance && topHeavy) blockingIssues.push("重心が高すぎます。重量物を床へ移してください");
    crushed.forEach(function (item) {
      blockingIssues.push(item.pkg.name + "の耐荷重" + item.limit + "kgを超えています");
    });
    if (stage.rules.protected) protectionIssues.forEach(function (item) {
      blockingIssues.push(item.pkg.name + "：" + item.reasons.join("・"));
    });
    unsecured.forEach(function (pkg) { blockingIssues.push(pkg.name + "が未固定です"); });
    unstable.forEach(function (pkg) { warnings.push(pkg.name + "の底面支持が不足しています"); });
    if (stage.rules.delivery && deliveryInversions) warnings.push("先に降ろす荷物が奥にあります");
    if (!placed.length) blockingIssues.push("荷物が1個も積まれていません");

    const damagePackages = forkDamagePackages.slice();
    protectionIssues.forEach(function (item) { damagePackages.push(item.pkg); });
    crushed.forEach(function (item) {
      if (!damagePackages.some(function (pkg) { return pkg.id === item.pkg.id; })) damagePackages.push(item.pkg);
    });
    const damageLoss = damagePackages.reduce(function (sum, pkg) { return sum + pkg.replacementCost; }, 0);

    return {
      placed,
      unplaced: packages.length - placed.length,
      payloadKg,
      maxPayloadKg,
      overweightKg,
      grossRevenue,
      usage,
      materialCost,
      weightedCenterX,
      balanceOffset,
      balanceOffsetPercent,
      balanceOk,
      centerHeightRatio,
      topHeavy,
      crushed,
      protectionIssues,
      unsecured,
      unstable,
      deliveryInversions,
      blockingIssues,
      warnings,
      damagePackages,
      forkDamagePackages,
      damageLoss
    };
  }

  function calculate(stage, packages, timeRemaining, overtimeSeconds) {
    const audit = analyze(stage, packages);
    const penalties = [];
    let safety = 100;

    if (audit.overweightKg) {
      safety -= 35;
      penalties.push("過積載 " + audit.overweightKg + "kg：運行不可");
    }
    if (stage.rules.balance && !audit.balanceOk) {
      safety -= 18;
      penalties.push("前後荷重の偏り：−18点");
    }
    if (stage.rules.balance && audit.topHeavy) {
      safety -= 15;
      penalties.push("重心が高い：−15点");
    }
    audit.crushed.forEach(function (item) {
      safety -= 20;
      penalties.push(item.pkg.name + "が荷重超過で破損：−20点");
    });
    if (stage.rules.protected) audit.protectionIssues.forEach(function (item) {
      safety -= 25;
      penalties.push(item.pkg.name + "が破損（" + item.reasons.join("・") + "）：−25点");
    });
    audit.unsecured.forEach(function (pkg) {
      safety -= 10;
      penalties.push(pkg.name + "が未固定：−10点");
    });
    audit.unstable.forEach(function (pkg) {
      safety -= 8;
      penalties.push(pkg.name + "の支持不足：−8点");
    });
    audit.forkDamagePackages.forEach(function (pkg) {
      safety -= 25;
      penalties.push(pkg.name + "が" + (pkg.damageCause || "爪突き事故") + "で破損：−25点・運賃対象外");
    });
    if (stage.rules.delivery && audit.deliveryInversions) {
      const deliveryPenalty = Math.min(15, audit.deliveryInversions * 5);
      safety -= deliveryPenalty;
      penalties.push("荷降ろし順の逆転：−" + deliveryPenalty + "点");
    }

    const overdue = Math.max(0, overtimeSeconds || 0);
    const timePenalty = overdue > 0 ? Math.ceil(overdue / 5) * 500 : 0;
    if (timePenalty) penalties.push("出発時刻超過：" + yen(timePenalty) + "減収");
    const score = Math.max(0, Math.min(100, Math.round(safety)));
    const netRevenue = Math.max(0, audit.grossRevenue - audit.materialCost - audit.damageLoss - timePenalty);
    const revenueMet = netRevenue >= stage.targetRevenue;
    const passed = audit.blockingIssues.length === 0 && score >= 70 && revenueMet;

    if (!revenueMet) penalties.push("目標運賃まであと " + yen(stage.targetRevenue - netRevenue));
    if (!penalties.length) penalties.push("安全違反なし。荷物は無事に到着しました。");

    return Object.assign({}, audit, {
      score,
      rank: rankFor(score),
      penalties,
      overtimeSeconds: overdue,
      timePenalty,
      netRevenue,
      revenueMet,
      passed,
      violationKinds: {
        overweight: audit.overweightKg > 0,
        protected: audit.protectionIssues.length,
        heavy: audit.crushed.length,
        unsecured: audit.unsecured.length,
        unstable: audit.unstable.length,
        balance: audit.balanceOk ? 0 : 1,
        delivery: audit.deliveryInversions,
        forkDamage: audit.forkDamagePackages.length
      }
    });
  }

  window.Scoring = { calculate, analyze, rankFor, materialUsage, isSecured, yen, MATERIAL_COST };
})();
