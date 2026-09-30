(function () {
  "use strict";

  // Hand-built SVG bust-up illustrations for the fictional cast, drawn from shared parts so the style stays consistent.
  // A character may later point `art[expression]` at a generated image to replace the SVG (see IMAGE-PROMPTS.md).
  const W = 400;
  const H = 520;
  const EXPRESSIONS = ["normal", "smile", "serious", "surprised", "cheer", "concern"];

  const CAST = {
    president: {
      skin: "#f3cfb6", skinShade: "#dca98d", hair: "#8e9199", hairShade: "#5d6068", iris: "#4b3526",
      hairStyle: "slick", outfit: "suit", suit: "#2f343c", suitShade: "#1f2329", shirt: "#f4f6f7", tie: "#1f8a64",
      age: true, jaw: 1.06, brow: 5
    },
    east: {
      skin: "#f1ccb2", skinShade: "#d8a488", hair: "#2a2b33", hairShade: "#15161b", iris: "#3a2a20",
      hairStyle: "short", outfit: "workjacket", suit: "#243a5a", suitShade: "#182941", shirt: "#f4f6f7", piping: "#2fbf8a",
      glasses: true, jaw: 1.04, brow: 4.5
    },
    central: {
      skin: "#f7d6c2", skinShade: "#e0ae95", hair: "#4b2e24", hairShade: "#2e1b15", iris: "#5a3a26",
      hairStyle: "bob", outfit: "blouse", suit: "#233657", suitShade: "#172640", shirt: "#3aa684",
      lashes: true, jaw: .96, brow: 3.5
    },
    west: {
      skin: "#efc6a8", skinShade: "#d49d7d", hair: "#231d1a", hairShade: "#110d0b", iris: "#3a261b",
      hairStyle: "spiky", outfit: "workjacket", suit: "#20375a", suitShade: "#152741", shirt: "#f4f6f7", piping: "#2fbf8a",
      jaw: 1.03, brow: 5
    },
    senpai: {
      skin: "#eec3a3", skinShade: "#d19878", hair: "#3a271d", hairShade: "#20150f", iris: "#3d2a1d",
      hairStyle: "messy", outfit: "vest", shirt: "#1d6e57", vest: "#c8f23a", vestShade: "#9fcb1c",
      jaw: 1.02, brow: 5, towel: true
    },
    doki: {
      skin: "#f8dac7", skinShade: "#e4b39b", hair: "#5b3a28", hairShade: "#38231a", iris: "#6a4430",
      hairStyle: "ponytail", outfit: "vest", shirt: "#2a5d8f", vest: "#c8f23a", vestShade: "#9fcb1c",
      helmet: true, lashes: true, jaw: .95, brow: 3.5, blush: true
    }
  };

  function faceOutline(jaw) {
    const w = 72 * jaw;
    return "M" + (200 - w) + " 170 Q" + (200 - w) + " 100 200 96 Q" + (200 + w) + " 100 " + (200 + w) + " 170" +
      " Q" + (200 + w) + " 236 " + (200 + w * .5) + " 268 Q222 290 200 292 Q178 290 " + (200 - w * .5) + " 268" +
      " Q" + (200 - w) + " 236 " + (200 - w) + " 170 Z";
  }

  function body(c) {
    const parts = [];
    // Neck and its shadow.
    parts.push('<path d="M178 262 L178 330 Q200 344 222 330 L222 262 Z" fill="' + c.skin + '"/>');
    parts.push('<path d="M178 282 Q200 300 222 282 L222 300 Q200 316 178 300 Z" fill="' + c.skinShade + '" opacity=".7"/>');
    const shoulders = "M40 520 Q46 386 138 346 L180 326 L220 326 L262 346 Q354 386 360 520 Z";
    if (c.outfit === "suit") {
      parts.push('<path d="' + shoulders + '" fill="' + c.suit + '"/>');
      parts.push('<path d="M178 326 L200 420 L222 326 Z" fill="' + c.shirt + '"/>');
      parts.push('<path d="M192 336 L208 336 L212 352 L205 446 L200 456 L195 446 L188 352 Z" fill="' + c.tie + '"/>');
      parts.push('<path d="M192 336 L208 336 L204 350 L196 350 Z" fill="#146a4b"/>');
      parts.push('<path d="M140 346 L200 470 L178 326 Z" fill="' + c.suitShade + '"/><path d="M260 346 L200 470 L222 326 Z" fill="' + c.suitShade + '"/>');
      parts.push('<path d="M150 360 L186 420" stroke="#4a515c" stroke-width="2" fill="none"/><path d="M250 360 L214 420" stroke="#4a515c" stroke-width="2" fill="none"/>');
    } else if (c.outfit === "blouse") {
      parts.push('<path d="' + shoulders + '" fill="' + c.suit + '"/>');
      parts.push('<path d="M170 326 L200 400 L230 326 Z" fill="' + c.shirt + '"/>');
      parts.push('<path d="M176 326 L200 362 L224 326" stroke="#2b8a6c" stroke-width="3" fill="none"/>');
      parts.push('<path d="M140 346 L196 470 L170 326 Z" fill="' + c.suitShade + '"/><path d="M260 346 L204 470 L230 326 Z" fill="' + c.suitShade + '"/>');
      parts.push('<circle cx="200" cy="376" r="4" fill="#e9eef0"/>');
    } else if (c.outfit === "workjacket") {
      parts.push('<path d="' + shoulders + '" fill="' + c.suit + '"/>');
      parts.push('<path d="M176 322 L200 372 L224 322 L214 318 L200 350 L186 318 Z" fill="' + c.shirt + '"/>');
      parts.push('<path d="M200 372 L200 520" stroke="#0f1d31" stroke-width="3"/>');
      parts.push('<path d="M60 430 Q120 372 170 350" stroke="' + c.piping + '" stroke-width="5" fill="none"/><path d="M340 430 Q280 372 230 350" stroke="' + c.piping + '" stroke-width="5" fill="none"/>');
      parts.push('<path d="M168 330 L150 352 L186 368 Z" fill="' + c.suitShade + '"/><path d="M232 330 L250 352 L214 368 Z" fill="' + c.suitShade + '"/>');
    } else {
      // Polo shirt with a high-visibility safety vest.
      parts.push('<path d="' + shoulders + '" fill="' + c.shirt + '"/>');
      parts.push('<path d="M178 326 L200 356 L222 326" stroke="#f4f6f7" stroke-width="5" fill="none"/>');
      parts.push('<path d="M84 520 Q92 400 150 356 L186 380 L186 520 Z" fill="' + c.vest + '"/><path d="M316 520 Q308 400 250 356 L214 380 L214 520 Z" fill="' + c.vest + '"/>');
      parts.push('<path d="M150 356 L186 380 L186 400 L140 378 Z" fill="' + c.vestShade + '"/><path d="M250 356 L214 380 L214 400 L260 378 Z" fill="' + c.vestShade + '"/>');
      parts.push('<path d="M92 440 L186 440 L186 456 L90 456 Z" fill="#dfe6ea"/><path d="M308 440 L214 440 L214 456 L310 456 Z" fill="#dfe6ea"/>');
      parts.push('<path d="M92 440 L186 440" stroke="#aeb8bf" stroke-width="2"/><path d="M308 440 L214 440" stroke="#aeb8bf" stroke-width="2"/>');
      if (c.towel) parts.push('<path d="M150 344 Q200 372 250 344 L262 358 Q200 392 138 358 Z" fill="#f2f5f7"/><path d="M150 344 Q200 372 250 344" stroke="#c9d2d8" stroke-width="2" fill="none"/>');
    }
    return parts.join("");
  }

  function hairBack(c) {
    const h = c.hair;
    switch (c.hairStyle) {
      case "bob":
        return '<path d="M114 204 Q104 84 200 76 Q296 84 286 204 L292 282 Q268 296 250 272 L256 206 Q200 150 144 206 L150 272 Q132 296 108 282 Z" fill="' + h + '"/>';
      case "ponytail":
        return '<path d="M268 170 Q330 190 318 290 Q312 340 286 356 Q300 300 282 250 Q274 214 258 196 Z" fill="' + h + '"/>' +
          '<path d="M290 250 Q304 300 292 340" stroke="' + c.hairShade + '" stroke-width="3" fill="none" opacity=".6"/>';
      default:
        return '<path d="M126 196 Q116 92 200 84 Q284 92 274 196 Q262 150 200 138 Q138 150 126 196 Z" fill="' + h + '"/>';
    }
  }

  function hairFront(c) {
    const h = c.hair;
    const shade = c.hairShade;
    switch (c.hairStyle) {
      case "slick":
        return '<path d="M128 168 Q132 98 204 92 Q270 96 274 160 Q256 118 206 116 Q160 116 138 150 Z" fill="' + h + '"/>' +
          '<path d="M150 130 Q190 104 250 116" stroke="#c3c6cc" stroke-width="5" fill="none" opacity=".75"/>' +
          '<path d="M160 142 Q200 118 256 134" stroke="' + shade + '" stroke-width="3" fill="none" opacity=".6"/>';
      case "short":
        return '<path d="M128 172 Q126 96 202 90 Q276 96 274 170 L262 150 Q250 126 224 124 L228 146 Q206 126 184 128 L186 146 Q162 130 146 148 Z" fill="' + h + '"/>' +
          '<path d="M176 108 Q210 98 246 112" stroke="#5a5d6b" stroke-width="4" fill="none" opacity=".6"/>';
      case "spiky":
        return '<path d="M126 176 L120 120 L146 128 L140 92 L172 110 L178 78 L204 104 L220 76 L234 106 L262 88 L258 122 L284 118 L274 176 L258 144 L244 156 L232 132 L216 150 L202 128 L186 152 L172 132 L158 154 L146 138 Z" fill="' + h + '"/>' +
          '<path d="M160 118 L176 102 M214 98 L226 116" stroke="#4a403b" stroke-width="3" fill="none"/>';
      case "messy":
        return '<path d="M124 178 Q116 104 196 88 Q282 90 278 176 L268 150 L262 168 L250 136 L238 160 L226 128 L210 158 L196 126 L182 156 L170 130 L158 162 L146 138 L136 168 Z" fill="' + h + '"/>' +
          '<path d="M150 120 Q180 100 214 102" stroke="#6b4a36" stroke-width="4" fill="none" opacity=".6"/>';
      case "bob":
        return '<path d="M124 190 Q120 92 204 88 Q282 94 278 186 Q262 132 228 124 Q236 150 222 164 Q214 134 186 128 Q156 136 138 188 Z" fill="' + h + '"/>' +
          '<path d="M170 110 Q210 98 250 116" stroke="#7a5344" stroke-width="4" fill="none" opacity=".55"/>';
      case "ponytail":
        return '<path d="M128 184 Q128 118 200 110 Q272 118 272 184 Q258 150 234 144 Q238 164 224 172 Q216 148 192 146 Q164 150 146 186 Z" fill="' + h + '"/>';
      default:
        return "";
    }
  }

  function helmet() {
    return '<path d="M116 172 Q114 80 200 74 Q286 80 284 172 Z" fill="#f4f6f7"/>' +
      '<path d="M116 172 Q114 80 200 74 Q286 80 284 172" stroke="#c7d0d6" stroke-width="3" fill="none"/>' +
      '<path d="M104 176 Q200 158 296 176 L298 188 Q200 172 102 188 Z" fill="#e2e8ec"/>' +
      '<path d="M190 76 Q200 72 210 76 L210 172 L190 172 Z" fill="#dfe6ea"/>' +
      '<path d="M130 132 Q200 112 270 132 L272 146 Q200 126 128 146 Z" fill="#25d391"/>' +
      '<path d="M150 104 Q170 90 196 88" stroke="#ffffff" stroke-width="6" fill="none" opacity=".8"/>';
  }

  function eye(x, c, expression, flip) {
    return '<g transform="translate(' + x + ' 200) scale(1.16) translate(' + (-x) + ' -200)">' + eyeShape(x, c, expression, flip) + "</g>";
  }

  function eyeShape(x, c, expression, flip) {
    const y = 200;
    const dark = "#2b1d18";
    if (expression === "smile" || expression === "cheer") {
      return '<path d="M' + (x - 19) + ' ' + (y + 3) + ' Q' + x + ' ' + (y - 14) + ' ' + (x + 19) + ' ' + (y + 3) + '" stroke="' + dark + '" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
    }
    const open = expression === "surprised" ? 1.25 : expression === "serious" ? .72 : 1;
    const top = y - 15 * open;
    const bottom = y + 12 * open;
    const irisR = expression === "surprised" ? 10 : 11.5;
    const parts = [];
    parts.push('<path d="M' + (x - 21) + ' ' + y + ' Q' + x + ' ' + top + ' ' + (x + 21) + ' ' + y + ' Q' + x + ' ' + bottom + ' ' + (x - 21) + ' ' + y + ' Z" fill="#ffffff"/>');
    parts.push('<clipPath id="eye' + x + expression + '"><path d="M' + (x - 21) + ' ' + y + ' Q' + x + ' ' + top + ' ' + (x + 21) + ' ' + y + ' Q' + x + ' ' + bottom + ' ' + (x - 21) + ' ' + y + ' Z"/></clipPath>');
    parts.push('<g clip-path="url(#eye' + x + expression + ')">' +
      '<circle cx="' + x + '" cy="' + (y - 1) + '" r="' + irisR + '" fill="' + c.iris + '"/>' +
      '<circle cx="' + x + '" cy="' + (y + 3) + '" r="' + (irisR * .62) + '" fill="#1a110d" opacity=".55"/>' +
      '<circle cx="' + x + '" cy="' + (y - 1) + '" r="' + (irisR * .42) + '" fill="#120b08"/>' +
      '<circle cx="' + (x + 4 * flip) + '" cy="' + (y - 6) + '" r="3.6" fill="#ffffff"/>' +
      '<circle cx="' + (x - 4 * flip) + '" cy="' + (y + 4) + '" r="1.6" fill="#ffffff" opacity=".85"/></g>');
    parts.push('<path d="M' + (x - 23) + ' ' + (y + 1) + ' Q' + x + ' ' + (top - 4) + ' ' + (x + 23) + ' ' + (y - 1) + '" stroke="' + dark + '" stroke-width="' + (c.lashes ? 5 : 4) + '" fill="none" stroke-linecap="round"/>');
    if (c.lashes) parts.push('<path d="M' + (x + 21 * flip) + ' ' + (y - 2) + ' l' + (7 * flip) + ' -5" stroke="' + dark + '" stroke-width="3" stroke-linecap="round"/>');
    return parts.join("");
  }

  function brows(c, expression) {
    const color = c.hairShade;
    const w = c.brow;
    // [inner y offset, outer y offset] relative to a neutral brow line.
    const shape = { normal: [0, 0], smile: [-2, 0], cheer: [-5, -1], serious: [7, -3], surprised: [-9, -6], concern: [-7, 4] }[expression] || [0, 0];
    const left = "M141 " + (170 + shape[1]) + " Q160 " + (163 + shape[1]) + " 184 " + (170 + shape[0]);
    const right = "M259 " + (170 + shape[1]) + " Q240 " + (163 + shape[1]) + " 216 " + (170 + shape[0]);
    return '<path d="' + left + '" stroke="' + color + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"/>' +
      '<path d="' + right + '" stroke="' + color + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"/>';
  }

  function mouth(expression) {
    switch (expression) {
      case "smile":
        return '<path d="M184 246 Q200 262 216 246 Q200 255 184 246 Z" fill="#9c3f3f"/><path d="M184 246 Q200 262 216 246" stroke="#6b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
      case "cheer":
        return '<path d="M178 242 Q200 276 222 242 Z" fill="#8f3535"/><path d="M180 243 L220 243 L218 249 L182 249 Z" fill="#ffffff"/><path d="M190 262 Q200 270 210 262 Q200 258 190 262 Z" fill="#e0767a"/>';
      case "surprised":
        return '<ellipse cx="200" cy="252" rx="8" ry="10" fill="#8f3535"/>';
      case "serious":
        return '<path d="M188 252 L212 250" stroke="#6b2b2b" stroke-width="3" stroke-linecap="round"/>';
      case "concern":
        return '<path d="M187 254 Q200 246 213 254" stroke="#6b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/>';
      default:
        return '<path d="M188 249 Q200 255 212 249" stroke="#6b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/>';
    }
  }

  function svg(key, expression) {
    const c = CAST[key];
    if (!c) return "";
    const face = EXPRESSIONS.indexOf(expression) >= 0 ? expression : "normal";
    const id = key + "-" + face;
    const out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">');
    out.push('<defs><radialGradient id="skin-' + id + '" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="' + c.skin + '"/><stop offset=".78" stop-color="' + c.skin + '"/><stop offset="1" stop-color="' + c.skinShade + '"/></radialGradient></defs>');
    // Anime proportions: the head is drawn larger than life, scaled up around the base of the neck.
    const head = '<g transform="translate(200 300) scale(1.2) translate(-200 -300)">';
    out.push(head + hairBack(c) + "</g>");
    out.push(body(c));
    out.push(head);
    // Ears.
    out.push('<ellipse cx="' + (200 - 72 * c.jaw) + '" cy="198" rx="11" ry="19" fill="' + c.skinShade + '"/><ellipse cx="' + (200 + 72 * c.jaw) + '" cy="198" rx="11" ry="19" fill="' + c.skinShade + '"/>');
    out.push('<path d="' + faceOutline(c.jaw) + '" fill="url(#skin-' + id + ')" stroke="#b9826a" stroke-width="2.2"/>');
    if (c.age) out.push('<path d="M176 236 Q170 252 178 262 M224 236 Q230 252 222 262" stroke="' + c.skinShade + '" stroke-width="2" fill="none"/><path d="M134 204 l-8 4 M266 204 l8 4" stroke="' + c.skinShade + '" stroke-width="2"/>');
    out.push(eye(165, c, face, 1));
    out.push(eye(235, c, face, -1));
    out.push(brows(c, face));
    out.push('<path d="M201 214 L196 230 Q200 233 205 231" stroke="' + c.skinShade + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>');
    if (c.blush || face === "smile" || face === "cheer") out.push('<ellipse cx="152" cy="232" rx="15" ry="7" fill="#f28c8c" opacity=".3"/><ellipse cx="248" cy="232" rx="15" ry="7" fill="#f28c8c" opacity=".3"/>');
    out.push(mouth(face));
    if (c.glasses) out.push('<g fill="none" stroke="#2b3240" stroke-width="3.2"><rect x="138" y="182" width="54" height="36" rx="12"/><rect x="208" y="182" width="54" height="36" rx="12"/><path d="M192 196 Q200 190 208 196"/><path d="M138 194 L128 190 M262 194 L272 190"/></g><path d="M146 188 L160 184" stroke="#ffffff" stroke-width="3" opacity=".5"/>');
    out.push(hairFront(c));
    if (c.helmet) out.push(helmet());
    out.push("</g></svg>");
    return out.join("");
  }

  function url(key, expression, art) {
    if (art && art[expression]) return art[expression];
    if (art && art.normal && !CAST[key]) return art.normal;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg(key, expression));
  }

  window.Portraits = { CAST, EXPRESSIONS, svg, url, size: { width: W, height: H } };
})();
