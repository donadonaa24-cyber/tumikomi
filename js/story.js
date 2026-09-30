(function () {
  "use strict";

  // All people are fictional. Illustrations come from js/portraits.js; set `art` to image paths to replace them.
  const CHARACTERS = {
    president: { name: "水城 蒼太", role: "代表取締役", color: "#4aa8ff", initial: "水", art: null },
    east: { name: "青柳 直樹", role: "東湾統括部長", color: "#4aa8ff", initial: "青", art: null },
    central: { name: "森川 遥", role: "中京営業所長", color: "#4aa8ff", initial: "森", art: null },
    west: { name: "結城 慎吾", role: "西日本統括部長", color: "#4aa8ff", initial: "結", art: null },
    senpai: { name: "早瀬 陸", role: "先輩乗務員", color: "#25d391", initial: "陸", art: null },
    doki: { name: "小田 ひより", role: "同期・荷役スタッフ", color: "#ffbd59", initial: "ひ", art: null }
  };

  // The manager who briefs a mission also evaluates it.
  const EVALUATOR = { 1: "central", 2: "east", 3: "central", 4: "west", 5: "president", 6: "west" };

  // [speaker, expression, text]
  const BRIEFINGS = {
    1: [
      ["central", "smile", "中京営業所長の森川です。今日から現場研修ですね。最初の便は、荷札の重さを読むところから始めましょう。"],
      ["central", "normal", "この便の最大積載量は700kg。数字を確かめてから動く人は、事故を起こしません。"],
      ["senpai", "smile", "先輩乗務員の早瀬だ。最初は爪の高さ合わせに苦労するけど、焦らなくていい。穴の真ん中に合わせてから前進な。"],
      ["doki", "cheer", "同期の小田です！一緒にがんばろうね。困ったら『積み方メモ』を見れば大丈夫！"]
    ],
    2: [
      ["east", "normal", "東湾統括部長の青柳だ。今日は重心の便。重い荷物は床に置き、前後は真ん中に寄せる。"],
      ["east", "serious", "今回から倉庫に段積みがある。上段から取ること。下から持ち上げたら、荷は崩れる。"],
      ["senpai", "normal", "画面上の『前後荷重』を見ながら置くといい。数字が赤くならなければ大丈夫だ。"],
      ["doki", "smile", "前の便、すごく丁寧だったって森川所長が言ってたよ。今日もいこう！"]
    ],
    3: [
      ["central", "serious", "今日はガラスと精密機器、それにペットケージ。どれも代わりのきかない荷物です。"],
      ["central", "normal", "破損厳禁の荷物には何も載せず、発泡材で隙間を埋めること。前後に並んだパレットは手前から取ってください。"],
      ["doki", "normal", "ペットケージは回転できないから、置き場所を先に決めておくといいよ。"],
      ["senpai", "smile", "壊れ物の日は、いつもより一呼吸ゆっくりでいい。結局それが一番速い。"]
    ],
    4: [
      ["west", "smile", "西日本統括部長の結城です。今日は荷崩れ防止。積んだ荷物はすべて固定してもらいます。"],
      ["west", "serious", "固定資材の数はぎりぎりです。ガラスには発泡材、重い荷にはベルト。使い道を考えてください。"],
      ["senpai", "normal", "固定が甘いと、道路で急な操作をしたときに荷が揺れる。積み方は運転にも響くぞ。"],
      ["doki", "cheer", "ここまで来たら班長まであと一歩だね。応援してる！"]
    ],
    5: [
      ["president", "normal", "代表の水城です。研修の最後の便は、安全と利益の両立です。"],
      ["president", "serious", "多く積めば売上は増える。でも事故が一つあれば、利益は消えてしまう。あなたの判断を見せてください。"],
      ["east", "normal", "最初の荷物を全部積み終えると、急ぎの追加依頼が入ることがある。そのときは重量と固定を計算し直せ。"],
      ["doki", "smile", "最後の研修だね。ここまで一緒に来られてうれしい。いってらっしゃい！"]
    ],
    6: [
      ["west", "normal", "配車係の仕事ですね。受けた依頼は必ず届け切る。それが次の依頼につながる信用です。"],
      ["senpai", "serious", "無理な受け方をすると、困るのは現場だ。積めるかどうか、受ける前に一度考えてくれよ。"],
      ["doki", "smile", "依頼ボードの見込み売上、ちゃんと見てね。帰ってきたら、どう選んだか教えて！"]
    ]
  };

  const CHEERS = {
    firstTransport: [
      ["senpai", "cheer", "いいぞ、その調子だ！"],
      ["doki", "cheer", "ナイス！一個目、きれいに運べたね！"],
      ["senpai", "smile", "低く保って後退、完璧だ。"]
    ],
    inspectionPassed: [
      ["doki", "cheer", "点検合格！あとは安全運転で届けるだけだね。"],
      ["senpai", "smile", "いい積み方だ。道中は急ハンドルと急ブレーキに気をつけてな。"],
      ["doki", "smile", "重量も固定もばっちり。いってらっしゃい！"]
    ]
  };

  const COWORKER_PASS = [
    ["senpai", "smile", "おつかれ。見てたぞ、あの積み方。次も頼りにしてる。"],
    ["doki", "cheer", "すごい！私も負けてられないな。"],
    ["senpai", "cheer", "無事に帰ってくるのが一番だ。今日はそれができた。"],
    ["doki", "smile", "おかえり！荷物、一つも傷んでなかったって！"]
  ];
  const COWORKER_FAIL = [
    ["senpai", "concern", "落ち込むな。失敗の理由がわかったなら、次はもっとうまくいく。"],
    ["doki", "smile", "大丈夫！もう一回やろう。今度は一緒に確認しよ！"],
    ["senpai", "smile", "俺も最初は爪突きばかりだった。手順を一つずつ、な。"],
    ["doki", "concern", "結果はくやしいけど、最後まで届けたのはえらいよ。次、いこう！"]
  ];

  function pick(list, random) {
    return list[Math.floor((random || Math.random)() * list.length) % list.length];
  }

  function line(speaker, face, text) {
    return { speaker, face: face || "normal", text };
  }

  function fromEntry(entry) {
    return entry ? line(entry[0], entry[1], entry[2]) : null;
  }

  function briefing(stage) {
    return (BRIEFINGS[stage.id] || []).map(fromEntry);
  }

  function cheer(event, random) {
    return fromEntry(pick(CHEERS[event] || [], random));
  }

  function yen(value) {
    return window.Scoring ? Scoring.yen(value) : "¥" + value;
  }

  function driveIncidents(drive) {
    return (drive.collisions || 0) + (drive.violations || 0) + (drive.swayDamage || 0) + (drive.exitMissed ? 1 : 0);
  }

  // Four-part review used for the promotion ceremony and the report.
  function gradeSheet(stage, result) {
    const drive = result.drive || {};
    const forkCount = (result.forkDamagePackages || []).length;
    const loadScore = result.loadScore != null ? result.loadScore : result.score;
    const incidents = driveIncidents(drive);
    const late = drive.lateSeconds > 0;
    const ratio = stage.targetRevenue ? result.netRevenue / stage.targetRevenue : 1;
    const rows = [
      { key: "pickup", label: "荷役", grade: forkCount === 0 ? "S" : forkCount === 1 ? "C" : "D", note: forkCount ? "爪突き事故 " + forkCount + "件" : "事故ゼロ" },
      { key: "loading", label: "積付け", grade: loadScore >= 95 ? "S" : loadScore >= 85 ? "A" : loadScore >= 70 ? "B" : "C", note: "積付け点 " + loadScore + "点" },
      { key: "driving", label: "運転", grade: incidents === 0 && !late ? "S" : incidents <= 1 && !late ? "A" : incidents <= 2 ? "B" : "C",
        note: incidents ? "接触・違反・荷傷み " + incidents + "件" : late ? "到着遅れ" : "無事故・定時" },
      { key: "revenue", label: "収益", grade: ratio >= 1.08 ? "S" : ratio >= 1 ? "A" : ratio >= .9 ? "B" : "C", note: yen(result.netRevenue) + " / 目標 " + yen(stage.targetRevenue) }
    ];
    const points = { S: 4, A: 3, B: 2, C: 1, D: 0 };
    const average = rows.reduce(function (sum, row) { return sum + points[row.grade]; }, 0) / rows.length;
    const total = average >= 3.6 ? "S" : average >= 2.8 ? "A" : average >= 2 ? "B" : "C";
    return { rows, total };
  }

  // The single most useful piece of feedback for this delivery, most serious first.
  function detailLine(stage, result) {
    const drive = result.drive || {};
    const forkCount = (result.forkDamagePackages || []).length;
    const leftoverCount = (result.leftoverPackages || []).length;
    if (forkCount) return ["serious", "倉庫での爪突き事故が" + forkCount + "件ありました。荷物の代わりは用意できても、信用の代わりはありません。高さを合わせてから前進してください。"];
    if (leftoverCount) return ["serious", "受けた依頼の積み残しが" + leftoverCount + "件。受ける前に積めるかを考えるのも、配車係の仕事です。"];
    if (drive.collisions) return ["serious", "道路での接触が" + drive.collisions + "件。前の車との距離を空けて、車線変更は早めに判断しましょう。"];
    if (drive.swayDamage) return ["concern", "急な操作で荷物が大きく揺れ、荷傷みが" + drive.swayDamage + "件出ました。積み方と運転はつながっています。"];
    if (drive.violations) return ["serious", "制限速度を超えた区間が" + drive.violations + "か所。工事区間やトンネルの標識を見落とさないように。"];
    if (drive.exitMissed) return ["concern", "出口を通り過ぎましたね。案内標識が出たら、早めに左車線へ。"];
    if ((result.unstable || []).length) return ["normal", "底面の支えが足りない荷物がありました。載せる前に、下の荷物の面を確かめてください。"];
    if (result.deliveryInversions) return ["normal", "降ろす順番が逆の荷物がありました。配送1番ほど後部ドアの近くへ。"];
    if (result.timePenalty) return ["normal", "遅れで" + yen(result.timePenalty) + "の減収です。安全は削らず、段取りで時間を作りましょう。"];
    if (result.passed) return ["smile", "減点なし。荷物も時間も守れていました。"];
    return null;
  }

  function outcomeLine(stage, result) {
    const score = result.score;
    if (!result.passed) {
      if (result.netRevenue >= stage.targetRevenue) return ["serious", "売上は届きましたが、安全点" + score + "点では合格にできません。"];
      return ["concern", "今回は目標に届きませんでした。安全売上" + yen(result.netRevenue) + "、目標まであと" + yen(stage.targetRevenue - result.netRevenue) + "です。"];
    }
    const rank = result.rank ? result.rank.key : "";
    if (rank === "S") return ["cheer", "見事です。安全点" + score + "点、安全売上" + yen(result.netRevenue) + "。文句のつけようがありません。"];
    if (rank === "A") return ["smile", "いい仕事でした。安全点" + score + "点。細かい点を詰めれば、さらに上を狙えます。"];
    return ["normal", "目標は達成です。ただ、安全点は" + score + "点。次は結果だけでなく、途中の手順も磨きましょう。"];
  }

  function evaluation(stage, result, options) {
    const o = options || {};
    const evaluator = EVALUATOR[stage.id] || "central";
    const outcome = outcomeLine(stage, result);
    const lines = [line(evaluator, outcome[0], outcome[1])];
    const detail = detailLine(stage, result);
    if (detail) lines.push(line(evaluator, detail[0], detail[1]));
    if (o.promotion) {
      lines.push(line(evaluator, "smile", "……それから、社長からお話があります。"));
      lines.push(line("president", "smile", "今日の仕事ぶりは報告を受けています。あなたを「" + o.promotion.to.title + "」に昇格させます。"));
    } else {
      lines.push(fromEntry(pick(result.passed ? COWORKER_PASS : COWORKER_FAIL, o.random)));
    }
    return lines;
  }

  // Lines spoken on the promotion ceremony screen after the stamp lands.
  function ceremony(promotion) {
    return [
      line("president", "cheer", "おめでとう。今日から『" + promotion.to.title + "』です。" + (promotion.to.comment || "")),
      line("senpai", "cheer", "やったな！昇格おめでとう。これからも一緒に走ろう。"),
      line("doki", "cheer", promotion.to.title + "だって！すごい、おめでとう！")
    ];
  }

  function portrait(speaker, face) {
    const person = CHARACTERS[speaker];
    if (!window.Portraits) return null;
    return Portraits.url(speaker, face || "normal", person && person.art);
  }

  window.Story = { CHARACTERS, EVALUATOR, briefing, evaluation, ceremony, cheer, gradeSheet, portrait };
})();
