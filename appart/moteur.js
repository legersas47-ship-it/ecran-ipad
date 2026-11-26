/* Moteur de l'appart en pixel art (ES5, iOS 12).
   Moteur.construire(plan) -> monde rasterise (decor fixe + cartes de deplacement).
   Un plan = liste de pieces rectangulaires ; les murs sont sur les bords des pieces,
   deux pieces voisines partagent le meme mur. Les meubles viennent de "kits" attaches a une piece. */
var Moteur = (function () {
'use strict';

var PLAN_DEFAUT = {
  version: 1,
  pieces: [
    { id: 'salon', nom: 'Salon', x0: 0, y0: 0, x1: 52, y1: 60, niveau: 6, sol: 'bois', kit: 'salon',
      ouvertures: [{ type: 'fenetre', cote: 'gauche', debut: 18, long: 25 }, { type: 'porte', cote: 'droite', debut: 44, long: 15 }] },
    { id: 'cuisine', nom: 'Cuisine', x0: 52, y0: 0, x1: 80, y1: 30, niveau: 1, sol: 'bois', kit: 'cuisine',
      ouvertures: [{ type: 'porte', cote: 'droite', debut: 8, long: 13 }, { type: 'porte', cote: 'avant', debut: 1, long: 27 }] },
    { id: 'entree', nom: 'Entrée', x0: 52, y0: 30, x1: 80, y1: 60, niveau: 1, sol: 'bois', kit: 'entree', ouvertures: [] },
    { id: 'couloir', nom: 'Couloir', x0: 80, y0: 0, x1: 140, y1: 28, niveau: 1, sol: 'bois',
      ouvertures: [{ type: 'porte', cote: 'avant', debut: 20, long: 6 }, { type: 'porte', cote: 'avant', debut: 55, long: 5 }] },
    { id: 'wc', nom: 'WC', x0: 140, y0: 0, x1: 156, y1: 28, niveau: 1, sol: 'gris', ferme: true, ouvertures: [] },
    { id: 'sdb', nom: 'Salle de bain', x0: 156, y0: 0, x1: 180, y1: 28, niveau: 1, sol: 'gris', ferme: true, ouvertures: [] },
    { id: 'c2', nom: 'Chambre 2', x0: 80, y0: 28, x1: 134, y1: 60, niveau: 1, sol: 'gris', ouvertures: [] },
    { id: 'c1', nom: 'Chambre 1', x0: 134, y0: 28, x1: 180, y1: 60, niveau: 1, sol: 'clair', kit: 'chambre1', ouvertures: [] }
  ]
};

/* ---------- outils ---------- */
function pack(r, g, b) {
  r = r < 0 ? 0 : (r > 255 ? 255 : r | 0);
  g = g < 0 ? 0 : (g > 255 ? 255 : g | 0);
  b = b < 0 ? 0 : (b > 255 ? 255 : b | 0);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function hs(x, y, z) {
  var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z + 7, -2048144777);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function varie(c, x, y, z, amp) { var v = (hs(x, y, z) % 5) - 2; return [c[0] + v * amp, c[1] + v * amp, c[2] + v * amp]; }

var WALL = [233, 230, 224], CAP = [118, 112, 106], ROOF = [176, 168, 158], CURB = [205, 200, 192];
var WOOD = [198, 150, 96], PINE = [176, 110, 58];
var SOLS = { bois: null, gris: [196, 194, 189], clair: [214, 212, 206], carrelage: [222, 224, 226] };
function bois(x, y) {
  var r = Math.floor(y / 2), off = (r * 7) % 12, p = Math.floor((x + off) / 12);
  var v = (hs(p, r, 1) % 5) - 2;
  var c = [WOOD[0] + v * 7, WOOD[1] + v * 6, WOOD[2] + v * 4];
  if ((x + off) % 12 === 0) { c = [c[0] - 18, c[1] - 16, c[2] - 12]; }
  return c;
}
function couleurSol(sol, x, y) {
  if (sol === 'carrelage') { return ((x >> 2) + (y >> 2)) % 2 ? [226, 228, 230] : [200, 204, 208]; }
  if (!SOLS[sol]) { return bois(x, y); }
  return varie(SOLS[sol], x, y, 0, 2);
}

/* ---------- kits de meubles (coordonnees d'origine du prototype) ---------- */
var AFFICHE = [[124, 74, 44], [58, 104, 62], [206, 160, 70], [92, 64, 120], [170, 92, 58], [90, 56, 40]];
var KITS = {
  salon: { ref: [0, 0, 6], refW: 52, ancreX: 34,
    decoFond: function (x, z) {
      if (x >= 19 && x <= 31 && z >= 25 && z <= 32) {
        if (x === 19 || x === 31 || z === 25 || z === 32) { return [240, 238, 232]; }
        return AFFICHE[hs(x >> 1, z >> 1, 3) % AFFICHE.length];
      }
      if (x >= 37 && x <= 47 && z >= 23 && z <= 32) {
        if (x === 37 || x === 47 || z === 23 || z === 32) { return [24, 24, 26]; }
        if ((z === 29 || z === 30) && x > 39 && x < 45) { return [180, 172, 150]; }
        return hs(x, z, 9) % 6 === 0 ? [150, 150, 150] : [56, 56, 62];
      }
      return null;
    },
    meubles: function (k) {
      var box = k.box, add = k.add, feuillage = k.feuillage;
      box(2, 1, 6, 2, 1, 24, [236, 236, 236], true); box(8, 1, 6, 8, 1, 24, [236, 236, 236], true);
      box(2, 5, 6, 2, 5, 24, [236, 236, 236], true); box(8, 5, 6, 8, 5, 24, [236, 236, 236], true);
      box(2, 1, 10, 8, 5, 10, [208, 184, 144], true); box(2, 1, 16, 8, 5, 16, [208, 184, 144], true);
      box(2, 1, 21, 8, 5, 21, [208, 184, 144], true); box(2, 1, 24, 8, 5, 24, [208, 184, 144], true);
      box(4, 2, 25, 6, 4, 27, [196, 104, 52]); feuillage(5, 3, 31, 4, 11);
      box(7, 3, 22, 7, 3, 23, [200, 40, 50]);
      box(3, 3, 17, 3, 3, 20, [202, 162, 62]);
      box(5, 3, 17, 5, 3, 18, [70, 70, 160]); add(5, 3, 19, [236, 236, 230]);
      box(6, 2, 17, 7, 3, 19, [34, 32, 34]);
      box(7, 2, 11, 7, 2, 12, [70, 70, 70]); add(7, 3, 13, [236, 228, 200]);
      box(10, 2, 7, 13, 3, 12, function (x, y, z) { return (x === 10 || x === 13 || z === 7 || z === 12) ? [70, 34, 20] : [214, 140, 40]; }, true);
      box(11, 2, 13, 12, 2, 21, [52, 36, 26]); box(11, 2, 22, 12, 2, 23, [30, 24, 20]);
      box(17, 1, 6, 33, 4, 15, function (x, y, z) {
        if (y === 4) {
          if (x >= 21 && x <= 29 && z <= 12) { return [30, 22, 20]; }
          if (x >= 20 && x <= 30 && z <= 13) { return [236, 231, 226]; }
        }
        return hs(x, y, z) % 9 === 0 ? [222, 204, 198] : varie([138, 56, 44], x, y, z, 4);
      }, true);
      box(16, 1, 16, 34, 5, 16, function (x, y, z) { return hs(x, y, z) % 8 === 0 ? [222, 204, 198] : [150, 64, 50]; }, true);
      box(17, 5, 6, 33, 6, 6, function (x, y, z) { return hs(x, y, z) % 7 === 0 ? [222, 204, 198] : [128, 52, 42]; });
      box(24, 3, 6, 26, 3, 7, [120, 78, 44]);
      box(22, 2, 17, 28, 2, 25, function (x, y, z) { return (x === 22 || x === 28 || z === 17 || z === 25) ? [196, 200, 206] : [150, 166, 178]; });
      box(31, 3, 17, 31, 3, 18, [240, 232, 206]);
      box(36, 1, 6, 50, 6, 13, function (x, y, z) {
        if (y === 6 && z >= 11 && z <= 12 && x > 36 && x < 50) { return hs(x, y, z) % 4 === 0 ? [180, 140, 90] : [20, 15, 14]; }
        if (y === 6 && (x === 39 || x === 43 || x === 47) && z < 11) { return [26, 20, 18]; }
        return [44, 33, 30];
      }, true);
      box(39, 3, 14, 47, 3, 21, function (x, y, z) { return (x === 39 || x === 47 || z === 14 || z === 21) ? [18, 18, 20] : [0, 0, 0, 3]; });
      box(48, 3, 14, 49, 4, 16, [36, 30, 30]);
      box(37, 3, 14, 37, 3, 15, [190, 96, 50]); feuillage(37, 3, 18, 2, 5);
      box(34, 4, 6, 34, 4, 26, [192, 160, 90], true); box(34, 4, 27, 36, 6, 28, [232, 224, 202]);
      box(3, 22, 13, 12, 38, 13, [228, 224, 214], true);
      box(3, 22, 6, 3, 22, 12, [200, 196, 188]); box(12, 22, 6, 12, 22, 12, [200, 196, 188]);
      box(3, 38, 6, 3, 38, 12, [200, 196, 188]); box(12, 38, 6, 12, 38, 12, [200, 196, 188]);
      box(5, 26, 14, 9, 30, 14, function (x, y) { return (x + y) % 3 ? [230, 230, 236] : [190, 60, 50]; });
      box(4, 33, 14, 7, 35, 14, [120, 128, 140]);
      box(14, 27, 6, 16, 29, 11, function (x, y, z) { return z === 11 ? [236, 236, 230] : ((x === 14 || x === 16) && (y === 27 || y === 29) ? [220, 220, 214] : null); }, true);
      box(16, 27, 12, 16, 29, 18, function (x, y, z) { return y === 28 && z % 2 ? null : [240, 240, 236]; });
      box(18, 24, 10, 29, 33, 10, [74, 44, 32], true);
      box(18, 24, 6, 18, 24, 9, [64, 38, 28]); box(29, 24, 6, 29, 24, 9, [64, 38, 28]);
      box(18, 33, 6, 18, 33, 9, [64, 38, 28]); box(29, 33, 6, 29, 33, 9, [64, 38, 28]);
      box(20, 27, 11, 20, 27, 13, [40, 110, 60]); box(22, 26, 11, 22, 26, 14, [40, 110, 60]);
      box(25, 29, 11, 26, 30, 12, [170, 190, 182]);
      var BRUN = [94, 60, 46];
      box(4, 49, 6, 37, 57, 10, function (x, y, z) { if ((x === 4 && y === 49) || (x === 37 && y === 57)) { return null; } return varie(BRUN, x, y, z, 2); }, true);
      box(4, 56, 11, 37, 58, 15, function (x, y, z) { return varie(z === 15 ? [104, 68, 52] : BRUN, x, y, z, 2); }, true);
      box(4, 49, 11, 5, 55, 13, function (x, y, z) { return varie(BRUN, x, y, z, 2); }, true);
      box(30, 36, 6, 37, 48, 10, function (x, y, z) { if ((x === 30 || x === 37) && y === 36) { return null; } return varie(BRUN, x, y, z, 2); }, true);
      box(31, 40, 11, 36, 46, 11, function (x, y) { return hs(x, y, 4) % 3 ? [158, 152, 146] : null; });
      box(14, 51, 11, 20, 54, 11, function (x, y) { return hs(x, y, 6) % 4 ? [120, 118, 116] : null; });
      box(1, 51, 6, 3, 57, 11, [120, 84, 54], true);
      box(2, 52, 12, 2, 52, 13, [60, 60, 60]); box(1, 51, 14, 3, 53, 16, [232, 122, 40]);
      feuillage(2, 56, 15, 3, 21);
    }
  },
  cuisine: { ref: [52, 0, 1], refW: 28,
    decoFond: function (x, z) {
      if (x >= 66 && x <= 79 && z >= 13 && z <= 18) {
        var zig = 18 - Math.abs(((x - 66) % 6) - 3);
        if (z === zig || z === zig - 1) { return (x + z) % 2 ? [212, 52, 40] : [242, 192, 44]; }
        if (z === 13 && x % 3 === 0) { return [232, 182, 40]; }
      }
      if (x >= 55 && x <= 58 && z >= 12 && z <= 16) {
        if (x === 55 || x === 58 || z === 12 || z === 16) { return [205, 42, 46]; }
        return [242, 206, 64];
      }
      return null;
    },
    meubles: function (k) {
      var box = k.box, add = k.add, x;
      box(53, 1, 1, 79, 6, 8, function (x, y) { return (y === 6 && x % 5 === 0) ? [210, 210, 206] : [236, 236, 232]; }, true);
      box(53, 1, 9, 79, 6, 9, [196, 196, 192], true);
      box(60, 3, 10, 61, 4, 11, [228, 110, 30]);
      box(64, 3, 10, 64, 3, 13, [140, 182, 222]); box(66, 3, 10, 66, 3, 13, [150, 190, 226]);
      add(58, 3, 10, [240, 236, 226]);
      box(66, 1, 19, 79, 4, 19, [238, 238, 236]);
      for (x = 67; x <= 78; x += 2) { box(x, 2, 20, x, 2, 21, [196, 214, 228]); }
    }
  },
  entree: { ref: [52, 30, 1], refW: 28,
    meubles: function (k) {
      var box = k.box, add = k.add, x, y, z, s, top;
      // escalier : 5 marches qui montent vers le salon (cote gauche de l'entree)
      var M2 = function (xx) { return k.escalierADroite ? 52 + k.largeur - (xx - 52) : xx; };
      for (x = 52; x <= 61; x++) {
        s = Math.floor((x - 52) / 2); top = 4 - s;
        for (y = 44; y <= 58; y++) {
          k.sol(M2(x), y, top + 1);
          for (z = 0; z <= top; z++) { k.addAbs(M2(x), y, z, varie(z === top ? PINE : [140, 86, 46], x, y, z, 3), 1); }
        }
        k.bloque(M2(x), 59); k.addAbs(M2(x), 59, top + 9, [150, 90, 46]);
      }
      for (z = 1; z <= 13; z++) { k.addAbs(M2(61), 59, z, [140, 84, 42]); }
      for (z = 5; z <= 14; z++) { k.addAbs(M2(52), 59, z, [140, 84, 42]); }
      box(69, 44, 1, 71, 46, 1, [190, 196, 202], true); box(70, 45, 2, 70, 45, 7, [190, 196, 202]);
      box(69, 44, 8, 71, 46, 8, [86, 58, 40]); box(70, 46, 4, 71, 47, 9, [26, 26, 30]);
    }
  },
  chambre1: { ref: [134, 28, 1], refW: 46, ancreX: 150,
    meubles: function (k) {
      var box = k.box;
      box(135, 44, 1, 139, 58, 9, function (x, y, z) {
        if (x === 139 && (z === 3 || z === 7) && y % 4 === 2) { return [150, 100, 56]; }
        if (x === 139 && z === 5) { return [196, 150, 96]; }
        return varie([216, 172, 112], x, y, z, 3);
      }, true);
      box(137, 50, 10, 137, 50, 13, function (x, y, z) { return z === 12 ? [242, 224, 150] : [50, 50, 50]; });
      box(158, 38, 1, 178, 52, 3, [150, 150, 154], true);
      box(158, 38, 4, 178, 52, 6, [240, 240, 236], true);
      box(174, 40, 7, 177, 50, 7, [252, 252, 250], true);
      box(158, 38, 7, 171, 52, 7, function (x, y) { return hs(x, y, 8) % 5 ? [222, 224, 230] : [206, 208, 216]; });
      box(160, 42, 8, 168, 48, 8, function (x, y) { return hs(x, y, 2) % 3 ? null : [214, 216, 222]; });
    }
  }
};

/* ---------- construction ---------- */
function construire(plan) {
  var pieces = plan.pieces, i, j, p;
  var SX = 2, SY = 2;
  for (i = 0; i < pieces.length; i++) { SX = Math.max(SX, pieces[i].x1 + 1); SY = Math.max(SY, pieces[i].y1 + 1); }
  var N = SX * SY, ZMAX = 34;
  var fl = new Int8Array(N), occ = new Uint8Array(N), piece = new Int16Array(N), mur = new Uint8Array(N);
  for (i = 0; i < N; i++) { fl[i] = -1; piece[i] = -1; }
  var V = [];
  function I(x, y) { return x + y * SX; }
  function dedans(x, y) { return x >= 0 && y >= 0 && x < SX && y < SY; }
  function add(x, y, z, c, t, cap) { if (c && dedans(x, y) && z >= 0 && z < 40) { V.push([x, y, z, c, (c[3] || t || 0), cap || null]); } }

  // 1. sols des pieces
  for (i = 0; i < pieces.length; i++) {
    p = pieces[i];
    var x, y, z;
    for (x = p.x0 + 1; x < p.x1; x++) {
      for (y = p.y0 + 1; y < p.y1; y++) {
        if (!dedans(x, y)) { continue; }
        piece[I(x, y)] = i; fl[I(x, y)] = p.niveau;
      }
    }
  }
  // 2. murs = bords des pieces
  for (i = 0; i < pieces.length; i++) {
    p = pieces[i];
    for (x = p.x0; x <= p.x1; x++) { if (dedans(x, p.y0)) { mur[I(x, p.y0)] = 1; } if (dedans(x, p.y1)) { mur[I(x, p.y1)] = 1; } }
    for (y = p.y0; y <= p.y1; y++) { if (dedans(p.x0, y)) { mur[I(p.x0, y)] = 1; } if (dedans(p.x1, y)) { mur[I(p.x1, y)] = 1; } }
  }
  // 3. ouvertures (portes, fenetres)
  var fenetre = new Uint8Array(N), porte = new Uint8Array(N);
  function cellulesCote(p, cote, debut, long, fn) {
    var k2;
    for (k2 = debut; k2 < debut + long; k2++) {
      if (cote === 'fond') { fn(p.x0 + k2, p.y0); }
      else if (cote === 'avant') { fn(p.x0 + k2, p.y1); }
      else if (cote === 'gauche') { fn(p.x0, p.y0 + k2); }
      else if (cote === 'droite') { fn(p.x1, p.y0 + k2); }
    }
  }
  for (i = 0; i < pieces.length; i++) {
    p = pieces[i];
    var ouv = p.ouvertures || [];
    for (j = 0; j < ouv.length; j++) {
      (function (o) {
        cellulesCote(p, o.cote, o.debut, o.long, function (cx0, cy0) {
          if (!dedans(cx0, cy0)) { return; }
          if (o.type === 'fenetre') { fenetre[I(cx0, cy0)] = 1; } else { porte[I(cx0, cy0)] = 1; }
        });
      })(ouv[j]);
    }
  }
  function solVoisin(x, y, mode) {
    var v = [[1, 0], [-1, 0], [0, 1], [0, -1]], k2, f, r = mode === 'min' ? 99 : -1;
    for (k2 = 0; k2 < 4; k2++) {
      if (!dedans(x + v[k2][0], y + v[k2][1])) { continue; }
      f = fl[I(x + v[k2][0], y + v[k2][1])];
      if (f < 1 || mur[I(x + v[k2][0], y + v[k2][1])]) { continue; }
      if (mode === 'min' ? f < r : f > r) { r = f; }
    }
    return r === 99 ? -1 : r;
  }
  for (i = 0; i < N; i++) {
    if (mur[i] && porte[i]) {
      x = i % SX; y = (i - x) / SX;
      var lv = solVoisin(x, y, 'min');
      if (lv > 0) { mur[i] = 0; fl[i] = lv; piece[i] = -2; }
    }
  }
  // 4. sols en voxels
  function couleurDe(x, y) {
    var pi = piece[I(x, y)];
    if (pi >= 0) { return couleurSol(pieces[pi].sol, x, y); }
    var v = [[-1, 0], [0, -1], [1, 0], [0, 1]], k2, q2;
    for (k2 = 0; k2 < 4; k2++) {
      if (!dedans(x + v[k2][0], y + v[k2][1])) { continue; }
      q2 = piece[I(x + v[k2][0], y + v[k2][1])];
      if (q2 >= 0) { return couleurSol(pieces[q2].sol, x, y); }
    }
    return bois(x, y);
  }
  var solCouleur = [];
  function poserSol(x, y, niv) {
    var c = couleurDe(x, y), z2, devant = false, vs = [[1, 0], [0, 1]], k2, f2;
    add(x, y, niv - 1, c, 1);
    for (k2 = 0; k2 < 2; k2++) {
      if (!dedans(x + vs[k2][0], y + vs[k2][1])) { devant = true; continue; }
      f2 = fl[I(x + vs[k2][0], y + vs[k2][1])];
      if (f2 < niv - 1 || mur[I(x + vs[k2][0], y + vs[k2][1])]) { devant = true; }
    }
    if (niv > 1 && devant) { for (z2 = 0; z2 < niv - 1; z2++) { add(x, y, z2, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75], 1); } }
  }
  var fermes = [];
  for (i = 0; i < pieces.length; i++) { if (pieces[i].ferme) { fermes.push(pieces[i]); } }

  // 5. kits de meubles (apres les sols, avant les murs pour l'escalier)
  var kitsPoses = [];
  for (i = 0; i < pieces.length; i++) {
    p = pieces[i];
    if (!p.kit || !KITS[p.kit] || p.ferme) { continue; }
    kitsPoses.push({ p: p, k: KITS[p.kit] });
  }
  var surSol = {};
  function ctxKit(p, kit) {
    var r = kit.ref, dw = kit.refW ? (p.x1 - p.x0) - kit.refW : 0;
    function T(x, y) { var ax = (kit.ancreX !== undefined && x >= kit.ancreX) ? dw : 0; return [p.x0 + (x - r[0]) + ax, p.y0 + (y - r[1])]; }
    function TZ(z) { return p.niveau + (z - r[2]); }
    var aDroite = false, q3;
    for (q3 = 0; q3 < pieces.length; q3++) { if (pieces[q3].niveau > p.niveau && pieces[q3].x0 === p.x1 && pieces[q3].y0 < p.y1 && pieces[q3].y1 > p.y0) { aDroite = true; } }
    return {
      largeur: p.x1 - p.x0, escalierADroite: aDroite,
      box: function (x0, y0, z0, x1, y1, z1, c, block) {
        var xx, yy, zz, t, cc;
        for (xx = x0; xx <= x1; xx++) {
          for (yy = y0; yy <= y1; yy++) {
            t = T(xx, yy);
            if (!dedans(t[0], t[1])) { continue; }
            for (zz = z0; zz <= z1; zz++) { cc = typeof c === 'function' ? c(xx, yy, zz) : c; add(t[0], t[1], TZ(zz), cc); }
            if (block) { occ[I(t[0], t[1])] = 1; }
          }
        }
      },
      add: function (x, y, z, c) { var t = T(x, y); add(t[0], t[1], TZ(z), c); },
      addAbs: function (x, y, z, c, ty) { var t = T(x, y); add(t[0], t[1], z, c, ty); },
      sol: function (x, y, niv) { var t = T(x, y); if (dedans(t[0], t[1])) { fl[I(t[0], t[1])] = niv; mur[I(t[0], t[1])] = 0; occ[I(t[0], t[1])] = 0; surSol[I(t[0], t[1])] = 1; } },
      bloque: function (x, y) { var t = T(x, y); if (dedans(t[0], t[1])) { occ[I(t[0], t[1])] = 1; } },
      feuillage: function (cx0, cy0, cz0, rr, seed) {
        var xx, yy, zz, d, h, t;
        for (xx = cx0 - rr; xx <= cx0 + rr; xx++) {
          for (yy = cy0 - rr; yy <= cy0 + rr; yy++) {
            for (zz = cz0 - rr; zz <= cz0 + rr; zz++) {
              d = (xx - cx0) * (xx - cx0) + (yy - cy0) * (yy - cy0) + (zz - cz0) * (zz - cz0) * 0.8;
              h = hs(xx, yy, zz + seed);
              if (d <= rr * rr && h % 3 !== 0) { t = T(xx, yy); add(t[0], t[1], TZ(zz), [52 + h % 30, 112 + h % 40, 46 + h % 20]); }
            }
          }
        }
      }
    };
  }
  for (i = 0; i < kitsPoses.length; i++) { kitsPoses[i].k.meubles(ctxKit(kitsPoses[i].p, kitsPoses[i].k)); }

  // sols (sauf cases deja posees par un kit, ex. escalier)
  for (i = 0; i < N; i++) {
    if (fl[i] > 0 && !mur[i] && !surSol[i]) { poserSol(i % SX, (i - i % SX) / SX, fl[i]); }
  }

  // 6. murs : haut au fond, bas a l'interieur, muret devant
  function solInt(x, y) { if (!dedans(x, y)) { return -1; } var k3 = I(x, y); return (fl[k3] > 0 && !mur[k3]) ? fl[k3] : -1; }
  var hMur = new Int8Array(N);
  for (i = 0; i < N; i++) {
    if (!mur[i]) { continue; }
    x = i % SX; y = (i - x) / SX;
    var arr = Math.max(solInt(x + 1, y), solInt(x, y + 1)), dev = Math.max(solInt(x - 1, y), solInt(x, y - 1));
    if (arr < 0 && dev < 0) { arr = solInt(x + 1, y + 1); dev = solInt(x - 1, y - 1); }
    var murG = dedans(x - 1, y) && mur[I(x - 1, y)], murH = dedans(x, y - 1) && mur[I(x, y - 1)];
    if (arr > 0 && dev < 0 && (solInt(x - 1, y - 1) > 0 || (murG && murH))) { dev = arr; }
    if (arr > 0 && dev < 0) { hMur[i] = ZMAX - 1; }
    else if (arr > 0 && dev > 0) { hMur[i] = Math.max(arr, dev) + 5; }
    else if (dev > 0) { hMur[i] = dev; }
    else { hMur[i] = -2; }
  }
  for (i = 0; i < N; i++) {                      // coins
    if (!mur[i] || hMur[i] !== -2) { continue; }
    x = i % SX; y = (i - x) / SX;
    var m = -1, vv = [[1, 0], [-1, 0], [0, 1], [0, -1]], k4;
    for (k4 = 0; k4 < 4; k4++) { if (dedans(x + vv[k4][0], y + vv[k4][1]) && mur[I(x + vv[k4][0], y + vv[k4][1])]) { m = Math.max(m, hMur[I(x + vv[k4][0], y + vv[k4][1])]); } }
    hMur[i] = m;
  }
  function decoMur(x, y, z) {
    var k5, kp, p2, r, base2 = 0;
    for (k5 = 0; k5 < kitsPoses.length; k5++) {
      kp = kitsPoses[k5]; p2 = kp.p; r = kp.k.ref;
      if (kp.k.decoFond && y === p2.y0 && x > p2.x0 && x < p2.x1) {
        var c = kp.k.decoFond(x - p2.x0 + r[0], z - p2.niveau + r[2]);
        if (c) { return c; }
      }
    }
    return null;
  }
  function niveauFenetre(x, y) {
    var a = Math.max(solInt(x + 1, y), solInt(x, y + 1), solInt(x - 1, y), solInt(x, y - 1));
    return a > 0 ? a : 1;
  }
  for (i = 0; i < N; i++) {
    if (!mur[i] || hMur[i] < 0) { continue; }
    x = i % SX; y = (i - x) / SX;
    occ[i] = 1;
    var top = hMur[i], grand = top >= ZMAX - 1, nf = niveauFenetre(x, y), c2, zz2;
    for (zz2 = 0; zz2 <= top; zz2++) {
      c2 = null;
      if (fenetre[i] && grand) {
        var zr = zz2 - nf;
        var deb = (fenetre[i - 1] || fenetre[i - SX]) ? 1 : 0, fin = (fenetre[i + 1] || (i + SX < N && fenetre[i + SX])) ? 1 : 0;
        if (zr === 7) { c2 = [210, 206, 198]; }
        else if (zr >= 8 && zr <= 25) {
          if (!deb || !fin || zr === 8 || zr === 25 || zr === 14 || zr === 20) { c2 = [236, 233, 226]; } else { c2 = [0, 0, 0, 2]; }
        }
      }
      if (!c2 && grand) { c2 = decoMur(x, y, zz2); }
      add(x, y, zz2, c2 || (grand || top > nf ? varie(WALL, x, y, zz2, 1) : varie(CURB, x, y, zz2, 1)), 4, zz2 === top ? CAP : null);
    }
  }
  // 7. pieces fermees (toit plat)
  for (i = 0; i < fermes.length; i++) {
    p = fermes[i];
    for (x = p.x0 + 1; x < p.x1; x++) {
      for (y = p.y0 + 1; y < p.y1; y++) {
        if (!dedans(x, y)) { continue; }
        occ[I(x, y)] = 1;
        for (z = 0; z <= p.niveau + 6; z++) { add(x, y, z, varie(WALL, x, y, z, 1), 4, z === p.niveau + 6 ? ROOF : null); }
      }
    }
  }

  // 8. rasterisation
  var W = 2 * (SX + SY) + 8, H = SX + SY + 2 * ZMAX + 12, OX = 2 * SY + 4, OY = 2 * ZMAX + 6;
  var base = new Uint32Array(W * H), depth = new Int16Array(W * H), ptype = new Uint8Array(W * H);
  var bg = pack(22, 20, 27);
  for (i = 0; i < W * H; i++) { base[i] = bg; depth[i] = -1; }
  function px(x2, y2, col, d, t) {
    if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) { return; }
    var q = x2 + y2 * W; base[q] = col; depth[q] = d; ptype[q] = t;
  }
  var buckets = [], k, v, sx, sy, c, nz, tp, rr2, ll, d, t2;
  for (j = 0; j < V.length; j++) { k = (V[j][0] + V[j][1]) * 40 + V[j][2]; (buckets[k] || (buckets[k] = [])).push(V[j]); }
  for (k = 0; k < buckets.length; k++) {
    if (!buckets[k]) { continue; }
    for (j = 0; j < buckets[k].length; j++) {
      v = buckets[k][j]; c = v[3]; t2 = v[4];
      sx = OX + 2 * (v[0] - v[1]); sy = OY + v[0] + v[1] - 2 * v[2];
      nz = ((hs(v[0], v[1], v[2]) % 5) - 2) * 2;
      tp = v[5] ? pack(v[5][0], v[5][1], v[5][2]) : pack(c[0] + nz, c[1] + nz, c[2] + nz);
      rr2 = pack(c[0] * 0.86 + nz, c[1] * 0.86 + nz, c[2] * 0.86 + nz);
      ll = pack(c[0] * 0.70 + nz, c[1] * 0.70 + nz, c[2] * 0.72 + nz);
      if (t2 === 4 && !v[5]) { tp = (v[0] === 0 || mur[I(v[0], v[1])] && !(v[1] === 0)) ? rr2 : ll; }
      d = t2 === 1 ? -1 : v[0] + v[1];
      px(sx + 1, sy, tp, d, t2); px(sx + 2, sy, tp, d, t2);
      px(sx, sy + 1, tp, d, t2); px(sx + 1, sy + 1, tp, d, t2); px(sx + 2, sy + 1, tp, d, t2); px(sx + 3, sy + 1, tp, d, t2);
      px(sx, sy + 2, ll, d, t2); px(sx + 1, sy + 2, ll, d, t2); px(sx + 2, sy + 2, rr2, d, t2); px(sx + 3, sy + 2, rr2, d, t2);
      px(sx + 1, sy + 3, ll, d, t2); px(sx + 2, sy + 3, rr2, d, t2);
    }
  }
  var winPx = [], tvPx = [];
  for (i = 0; i < W * H; i++) { if (ptype[i] === 2) { winPx.push(i); } else if (ptype[i] === 3) { tvPx.push(i); } }

  // 9. grille de deplacement (cases de 2 x 2)
  var CW = Math.ceil(SX / 2), CH = Math.ceil(SY / 2), cwalk = new Uint8Array(CW * CH), cht = new Int8Array(CW * CH);
  var a, b, dx, dy, f, ok, h;
  for (b = 0; b < CH; b++) {
    for (a = 0; a < CW; a++) {
      ok = 1; h = -1;
      for (dx = 0; dx < 2; dx++) {
        for (dy = 0; dy < 2; dy++) {
          x = a * 2 + dx; y = b * 2 + dy;
          if (!dedans(x, y)) { ok = 0; continue; }
          f = fl[I(x, y)];
          if (f < 1 || occ[I(x, y)] || mur[I(x, y)]) { ok = 0; } else if (f > h) { h = f; }
        }
      }
      cwalk[a + b * CW] = ok; cht[a + b * CW] = h;
    }
  }

  // reperes des kits -> coordonnees du monde
  var reperes = {};
  for (i = 0; i < kitsPoses.length; i++) { reperes[kitsPoses[i].p.kit] = { p: kitsPoses[i].p, ref: kitsPoses[i].k.ref }; }
  function versMonde(kit, x, y, z) {
    var R = reperes[kit];
    if (!R) { return null; }
    var K2 = KITS[kit], ax = (K2.ancreX !== undefined && x >= K2.ancreX && K2.refW) ? (R.p.x1 - R.p.x0) - K2.refW : 0;
    return [R.p.x0 + (x - R.ref[0]) + ax, R.p.y0 + (y - R.ref[1]), z === undefined ? undefined : R.p.niveau + (z - R.ref[2])];
  }

  return {
    W: W, H: H, OX: OX, OY: OY, SX: SX, SY: SY,
    base: base, depth: depth, winPx: winPx, tvPx: tvPx,
    fl: fl, occ: occ, CW: CW, CH: CH, cwalk: cwalk, cht: cht,
    versMonde: versMonde,
    proj: function (x2, y2, z2) { return [OX + 2 * (x2 - y2) + 2, OY + x2 + y2 - 2 * z2 + 1]; }
  };
}

return { construire: construire, PLAN_DEFAUT: PLAN_DEFAUT, pack: pack, hs: hs, KITS: KITS };
})();
