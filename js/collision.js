(function () {
  "use strict";

  const EPSILON = 1.5;

  function dimensions(item) {
    return item.rotation % 180 === 0
      ? { width: item.width, height: item.height }
      : { width: item.height, height: item.width };
  }

  function rect(item) {
    const size = dimensions(item);
    return { x: item.x, y: item.y, width: size.width, height: size.height };
  }

  function overlaps(a, b, padding) {
    const p = padding || 0;
    return a.x < b.x + b.width - p &&
      a.x + a.width > b.x + p &&
      a.y < b.y + b.height - p &&
      a.y + a.height > b.y + p;
  }

  function horizontalOverlap(a, b) {
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  }

  function isInsideTruck(item, truck) {
    const r = rect(item);
    return r.x >= truck.x - EPSILON &&
      r.y >= truck.y - EPSILON &&
      r.x + r.width <= truck.x + truck.width + EPSILON &&
      r.y + r.height <= truck.y + truck.height + EPSILON;
  }

  function collidingItem(item, packages) {
    const r = rect(item);
    return packages.find(function (other) {
      return other.id !== item.id && other.placed && overlaps(r, rect(other), .8);
    }) || null;
  }

  function mergedWidth(intervals) {
    if (!intervals.length) return 0;
    const sorted = intervals.slice().sort(function (a, b) { return a[0] - b[0]; });
    let total = 0;
    let start = sorted[0][0];
    let end = sorted[0][1];
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i][0] <= end) {
        end = Math.max(end, sorted[i][1]);
      } else {
        total += end - start;
        start = sorted[i][0];
        end = sorted[i][1];
      }
    }
    return total + end - start;
  }

  function supportInfo(item, packages, truck) {
    const r = rect(item);
    const bottom = r.y + r.height;
    const floor = truck.y + truck.height;
    if (Math.abs(bottom - floor) <= 2.5) {
      return { ratio: 1, items: [], floor: true };
    }

    const supports = [];
    const intervals = [];
    packages.forEach(function (other) {
      if (other.id === item.id || !other.placed) return;
      const o = rect(other);
      if (Math.abs(bottom - o.y) > 2.5) return;
      const left = Math.max(r.x, o.x);
      const right = Math.min(r.x + r.width, o.x + o.width);
      if (right - left > 0) {
        supports.push(other);
        intervals.push([left, right]);
      }
    });

    return {
      ratio: Math.min(1, mergedWidth(intervals) / r.width),
      items: supports,
      floor: false
    };
  }

  function resolvePlacement(item, packages, truck) {
    const size = dimensions(item);
    item.x = Math.round(item.x / 4) * 4;
    const desiredBottom = item.y + size.height;
    const surfaces = [{ y: truck.y + truck.height, floor: true }];

    packages.forEach(function (other) {
      if (other.id === item.id || !other.placed) return;
      const o = rect(other);
      const probe = { x: item.x, y: item.y, width: size.width, height: size.height };
      if (horizontalOverlap(probe, o) >= Math.min(size.width * .45, o.width)) {
        surfaces.push({ y: o.y, floor: false, item: other });
      }
    });

    surfaces.sort(function (a, b) {
      return Math.abs(a.y - desiredBottom) - Math.abs(b.y - desiredBottom);
    });
    const surface = surfaces[0];

    if (!surface || Math.abs(surface.y - desiredBottom) > 54) {
      return { valid: false, reason: "荷物が宙に浮いています。床か荷物の上に置いてください。" };
    }

    item.y = surface.y - size.height;
    if (!isInsideTruck(item, truck)) {
      return { valid: false, reason: "荷台の外にはみ出しています。" };
    }

    const collision = collidingItem(item, packages);
    if (collision) {
      return { valid: false, reason: "ほかの荷物と重なっています。" };
    }

    item.placed = true;
    const support = supportInfo(item, packages, truck);
    if (support.ratio < .5) {
      item.placed = false;
      return { valid: false, reason: "底面の支えが足りません。もう少し深く載せてください。" };
    }

    return {
      valid: true,
      supportRatio: support.ratio,
      unstable: support.ratio < .68,
      supportItems: support.items
    };
  }

  function canRotate(item, packages, truck) {
    if (!item.rotatable) return { valid: false, reason: "この荷物は回転できません。" };
    if (item.keepUpright && item.rotation % 180 !== 0) {
      return { valid: false, reason: "天地無用の荷物です。横倒しにはできません。" };
    }
    if (!item.placed) return { valid: true };
    if (!isInsideTruck(item, truck)) return { valid: false, reason: "回転すると荷台からはみ出します。" };
    if (collidingItem(item, packages)) return { valid: false, reason: "回転するとほかの荷物に当たります。" };
    const support = supportInfo(item, packages, truck);
    if (support.ratio < .5) return { valid: false, reason: "回転後の荷物が宙に浮きます。" };
    return { valid: true, unstable: support.ratio < .68 };
  }

  window.Collision = {
    dimensions,
    rect,
    overlaps,
    horizontalOverlap,
    isInsideTruck,
    collidingItem,
    supportInfo,
    resolvePlacement,
    canRotate
  };
})();
