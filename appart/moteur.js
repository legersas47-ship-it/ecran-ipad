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

/* ---------- objets (meubles) ----------
   Chaque objet a une boite x0..x1, y0..y1 (en voxels de 10 cm) et une face : le cote vers lequel il regarde
   ('+x', '-x', '+y', '-y'). u = largeur, v = profondeur du dos vers l'avant, z = hauteur depuis le sol. */
var AFFICHE = [[124, 74, 44], [58, 104, 62], [206, 160, 70], [92, 64, 120], [170, 92, 58], [90, 56, 40]];
var BRUN = [94, 60, 46], MARBRE = [138, 56, 44], VEINE = [222, 204, 198];
var INVERSE = { '+x': '-x', '-x': '+x', '+y': '-y', '-y': '+y' };
function vueCam(dir) { return dir === '+x' || dir === '+y'; }

function cadre(o) {
  var x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1), y0 = Math.min(o.y0, o.y1), y1 = Math.max(o.y0, o.y1);
  var f = o.face || '+y', W, D, at;
  if (f === '+y') { W = x1 - x0 + 1; D = y1 - y0 + 1; at = function (u, v) { return [x0 + u, y0 + v]; }; }
  else if (f === '-y') { W = x1 - x0 + 1; D = y1 - y0 + 1; at = function (u, v) { return [x1 - u, y1 - v]; }; }
  else if (f === '+x') { W = y1 - y0 + 1; D = x1 - x0 + 1; at = function (u, v) { return [x0 + v, y1 - u]; }; }
  else { W = y1 - y0 + 1; D = x1 - x0 + 1; at = function (u, v) { return [x1 - v, y0 + u]; }; }
  return { W: W, D: D, at: at, face: f, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

var RENDUS = {
  cheminee: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 4), m = Math.floor(W / 2), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 9, function (u, v, z) {
      if (v === d - 1) {
        if (u >= 2 && u <= W - 3 && z <= 6) { return [30, 22, 20]; }
        if (u >= 1 && u <= W - 2 && z <= 7) { return [236, 231, 226]; }
      }
      return hs(u, v, z) % 9 === 0 ? VEINE : varie(MARBRE, u, v, z, 4);
    }, true);
    B(-1, 0, 10, W, d, 10, function (u, v, z) { return hs(u, v, z) % 8 === 0 ? VEINE : [150, 64, 50]; }, true);
    B(-1, d, 0, W, d + 1, 0, function (u, v, z) { return hs(u, v, z) % 7 === 0 ? VEINE : [128, 52, 42]; });
    B(m - 1, 1, 0, m + 1, 1, 1, [120, 78, 44]);
    B(m - 3, 1, 11, m + 3, 1, 19, function (u, v, z) { return (u === m - 3 || u === m + 3 || z === 11 || z === 19) ? [196, 200, 206] : [150, 166, 178]; });
    B(W - 2, 2, 11, W - 2, 2, 12, [240, 232, 206]);
    B(m + 4, 2, 11, m + 5, 2, 13, [210, 200, 190]);
    A.lumiere('bougie', W - 2, 2, 14);
    A.acte('cheminee', m, d + 4, { pose: 'stand' });
  },
  meuble_tv: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 5), m = Math.floor(W / 2), B = A.B, tw = Math.min(W - 4, 14), a = m - Math.floor(tw / 2), b = a + tw - 1;
    B(0, 0, 0, W - 1, d - 1, 7, function (u, v, z) {
      if (v === d - 1 && z >= 5 && z <= 6 && u > 0 && u < W - 1) { return hs(u, v, z) % 4 === 0 ? [180, 140, 90] : [20, 15, 14]; }
      if (v === d - 1 && u % 4 === 0 && z < 5) { return [26, 20, 18]; }
      return [44, 33, 30];
    }, true);
    B(a, 2, 8, b, 2, 15, function (u, v, z) { return (u === a || u === b || z === 8 || z === 15) ? [18, 18, 20] : [0, 0, 0, 3]; });
    B(W - 2, 2, 8, W - 2, 3, 10, [36, 30, 30]);
    A.lumiere('tv', m, 4, 12);
  },
  etagere_basse: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 5), m = Math.floor(W / 2), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 6, function (u, v, z) { return (v === d - 1 && (z === 3) ) ? [210, 210, 206] : [236, 236, 234]; }, true);
    B(0, 0, 7, W - 1, d - 1, 7, [208, 184, 144], true);
    B(1, 1, 8, 3, 3, 9, [196, 104, 52]); A.feuillage(2, 2, 13, 3, 11);
    B(m, 2, 8, m, 2, 9, [60, 60, 60]); B(m - 1, 1, 10, m + 1, 3, 12, [236, 228, 200]);
    A.lumiere('lampe', m, 2, 11);
    B(m + 3, 1, 8, m + 4, 3, 8, [190, 50, 46]);
    B(W - 2, 2, 8, W - 2, 2, 11, [202, 162, 62]);
    B(W - 4, 2, 8, W - 4, 2, 9, [70, 70, 160]); B(W - 4, 2, 10, W - 4, 2, 10, [236, 236, 230]);
    A.acte('plantes', m, d + 3, { pose: 'stand' });
  },
  lampadaire: function (o, A) {
    var c = A.cadre, u = Math.floor(c.W / 2), v = Math.floor(c.D / 2), B = A.B;
    B(u, v, 0, u, v, 21, [192, 160, 90], true); B(u - 1, v - 1, 22, u + 1, v + 1, 23, [232, 224, 202]);
    A.lumiere('lampadaire', u, v, 22);
  },
  lampe_plante: function (o, A) {
    var c = A.cadre, W = c.W, B = A.B;
    B(0, 0, 0, 3, 3, 5, [120, 84, 54], true);
    B(1, 1, 6, 1, 1, 7, [60, 60, 60]); B(0, 0, 8, 2, 2, 10, [232, 122, 40]);
    A.lumiere('lampe_orange', 1, 1, 9);
    B(W - 3, 1, 0, W - 2, 2, 3, [196, 104, 52], true); A.feuillage(W - 3, 2, 8, 3, 21);
  },
  canape: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, m = Math.floor(W / 2), B = A.B;
    B(0, 0, 0, W - 1, 2, 9, function (u, v, z) { return varie(z === 9 ? [104, 68, 52] : BRUN, u, v, z, 2); }, true);
    B(0, 3, 0, W - 1, D - 1, 4, function (u, v, z) { if ((u === 0 || u === W - 1) && v === D - 1) { return null; } return varie(BRUN, u, v, z, 2); }, true);
    B(0, 3, 5, 1, D - 1, 7, function (u, v, z) { return varie(BRUN, u, v, z, 2); }, true);
    B(W - 2, 3, 5, W - 1, D - 1, 7, function (u, v, z) { return varie(BRUN, u, v, z, 2); }, true);
    B(3, 3, 5, 8, 6, 5, function (u, v) { return hs(u, v, 6) % 4 ? [120, 118, 116] : null; });
    A.acte('canape', m, D + 3, { pose: 'sit', sx: m, sy: 4, sz: 6, regarde: c.face });
  },
  meridienne: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B;
    B(0, 0, 0, W - 1, D - 1, 4, function (u, v, z) { if ((u === 0 || u === W - 1) && (v === D - 1)) { return null; } return varie(BRUN, u, v, z, 2); }, true);
    B(1, 2, 5, W - 2, D - 3, 5, function (u, v) { return hs(u, v, 4) % 3 ? [158, 152, 146] : null; });
  },
  table_basse: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B;
    B(0, 0, 4, W - 1, D - 1, 4, [74, 44, 32], true);
    B(0, 0, 0, 0, 0, 3, [64, 38, 28]); B(W - 1, 0, 0, W - 1, 0, 3, [64, 38, 28]); B(0, D - 1, 0, 0, D - 1, 3, [64, 38, 28]); B(W - 1, D - 1, 0, W - 1, D - 1, 3, [64, 38, 28]);
    B(1, 1, 5, 1, 1, 7, [40, 110, 60]); B(3, 2, 5, 3, 2, 8, [40, 110, 60]); B(W - 3, D - 3, 5, W - 2, D - 2, 6, [170, 190, 182]);
  },
  table: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, m = Math.floor(W / 2), B = A.B;
    B(0, 0, 7, W - 1, D - 1, 7, [228, 224, 214], true);
    B(0, 0, 0, 0, 0, 6, [200, 196, 188]); B(W - 1, 0, 0, W - 1, 0, 6, [200, 196, 188]);
    B(0, D - 1, 0, 0, D - 1, 6, [200, 196, 188]); B(W - 1, D - 1, 0, W - 1, D - 1, 6, [200, 196, 188]);
    B(2, 2, 8, 6, 5, 8, function (u, v) { return (u + v) % 3 ? [230, 230, 236] : [190, 60, 50]; });
    B(W - 6, 2, 8, W - 3, 4, 8, [120, 128, 140]);
    // chaise blanche devant
    B(m - 1, D + 1, 0, m + 1, D + 3, 4, function (u, v, z) { return z === 4 ? [236, 236, 230] : ((u === m - 1 || u === m + 1) && (v === D + 1 || v === D + 3) ? [220, 220, 214] : null); }, true);
    B(m - 1, D + 3, 5, m + 1, D + 3, 11, function (u, v, z) { return u === m && z % 2 ? null : [240, 240, 236]; });
    A.acte('table', m, D + 6, { pose: 'sit', sx: m, sy: D + 2, sz: 6, regarde: INVERSE[c.face] });
  },
  plante: function (o, A) {
    var c = A.cadre, u = Math.floor(c.W / 2), v = Math.floor(c.D / 2), B = A.B;
    B(u - 1, v - 1, 0, u + 1, v + 1, 3, [196, 104, 52], true);
    A.feuillage(u, v, 9, 4, 31); A.feuillage(u + 2, v - 1, 13, 3, 32); A.feuillage(u - 2, v + 1, 12, 3, 33);
  },
  escalier: function (o, A) {
    A.escalier(o);
  },
  rambarde: function (o, A) {
    A.rambarde(o);
  },
  chaussures: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 3), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 15, function (u, v, z) { return (v === d - 1 && (z === 5 || z === 10 || u === Math.floor(W / 2))) ? [200, 196, 188] : [236, 234, 228]; }, true);
  },
  cuisine_plan: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 6), m = Math.floor(W / 2), B = A.B, u;
    B(0, 0, 0, W - 1, d - 1, 8, function (u2, v) { return (v === d - 1 && u2 % 5 === 0) ? [210, 210, 206] : [236, 236, 232]; }, true);
    B(0, 0, 9, W - 1, d - 1, 9, function (u2, v) {
      if (u2 >= 2 && u2 <= 7 && v >= 1 && v <= d - 2) { return (u2 === 2 || u2 === 7 || v === 1 || v === d - 2) ? [190, 194, 200] : [120, 126, 134]; }
      if (u2 >= W - 10 && u2 <= W - 3 && v >= 1 && v <= d - 2) { return ((u2 - (W - 10)) % 4 === 1 && (v === 2 || v === d - 3)) ? [150, 60, 50] : [30, 30, 34]; }
      return [196, 196, 192];
    }, true);
    B(4, 0, 10, 5, 0, 12, [180, 184, 190]);
    B(2, 0, 19, W - 3, 2, 19, [238, 238, 236]);
    for (u = 3; u <= W - 4; u += 2) { B(u, 1, 20, u, 1, 21, [196, 214, 228]); }
    for (u = 1; u < W - 1; u++) {
      var zig = 17 - Math.abs((u % 6) - 3);
      B(u, 0, zig, u, 0, zig, (u % 2) ? [212, 52, 40] : [242, 192, 44]);
      if (u % 3 === 0) { B(u, 0, 13, u, 0, 13, [232, 182, 40]); }
    }
    B(m - 6, 0, 12, m - 3, 0, 16, function (u2, v, z) { return (u2 === m - 6 || u2 === m - 3 || z === 12 || z === 16) ? [205, 42, 46] : [242, 206, 64]; });
    A.lumiere('cuisine', m, 3, 22);
    A.vapeur(W - 6, 3, 11);
    A.acte('cuisine', W - 6, d + 3, { pose: 'stand', regarde: INVERSE[c.face] });
  },
  comptoir: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B;
    B(0, 0, 0, W - 1, D - 1, 8, [236, 236, 232], true);
    B(0, 0, 9, W - 1, D - 1, 9, [196, 160, 110], true);
    B(3, 1, 10, 4, 1, 11, [228, 110, 30]); B(7, 1, 10, 7, 1, 13, [140, 182, 222]); B(9, 1, 10, 9, 1, 10, [240, 236, 226]);
  },
  placard: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 3), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 22, function (u, v, z) {
      if (v === d - 1 && u % 8 === 0) { return [204, 200, 192]; }
      if (v === d - 1 && u % 8 === 6 && z >= 9 && z <= 11) { return [150, 150, 150]; }
      return [238, 236, 232];
    }, true);
  },
  lit: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, m = Math.floor(W / 2), B = A.B, coul = o.couleur || [70, 110, 150];
    B(0, 0, 0, W - 1, 0, 9, function (u, v, z) { return z === 9 ? [176, 132, 84] : [196, 152, 100]; }, true);
    B(0, 1, 0, W - 1, D - 1, 2, [150, 150, 154], true);
    B(0, 1, 3, W - 1, D - 1, 5, [240, 240, 236], true);
    B(1, 1, 6, m - 1, 3, 7, [252, 252, 250], true); B(m + 1, 1, 6, W - 2, 3, 7, [250, 250, 246], true);
    B(0, 5, 6, W - 1, D - 1, 6, function (u, v) { return hs(u, v, 8) % 5 ? [226, 228, 234] : [210, 212, 220]; });
    B(0, Math.floor(D * 0.65), 7, W - 1, Math.floor(D * 0.65) + 3, 7, function (u, v) { return (u + v) % 4 === 0 ? [coul[0] + 30, coul[1] + 30, coul[2] + 30] : coul; });
    B(2, 6, 7, W - 3, Math.floor(D * 0.6), 7, function (u, v) { return hs(u, v, 2) % 4 ? null : [216, 218, 226]; });
    A.acte(o.perso ? 'lit' : 'lit_coloc', m, D + 3, { pose: 'sleep', tx: m, ty: 2, tz: 8 });
  },
  tapis: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B, p = o.couleur || [150, 60, 50];
    B(0, 0, 0, W - 1, D - 1, 0, function (u, v) {
      if (u === 0 || v === 0 || u === W - 1 || v === D - 1) { return [220, 200, 160]; }
      var k = (Math.abs(u - W / 2) + Math.abs(v - D / 2)) | 0;
      return k % 4 === 0 ? [230, 214, 176] : (k % 4 === 2 ? [p[0] * 0.7, p[1] * 0.7, p[2] * 0.7] : p);
    });
  },
  chevet: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 4), B = A.B, m = Math.floor(W / 2);
    B(0, 0, 0, W - 1, d - 1, 5, function (u, v, z) { return (v === d - 1 && z === 3) ? [150, 100, 56] : varie([210, 166, 108], u, v, z, 2); }, true);
    B(m, 1, 6, m, 1, 7, [60, 60, 60]); B(m - 1, 0, 8, m + 1, 2, 10, [240, 226, 190]);
    B(W - 1, 2, 6, W - 1, 2, 6, [40, 40, 44]);
    A.lumiere('lampe', m, 1, 9);
  },
  chaise_bureau: function (o, A) {
    var c = A.cadre, u = Math.floor(c.W / 2), v = Math.floor(c.D / 2), B = A.B;
    B(u - 1, v - 1, 0, u + 1, v + 1, 0, [40, 40, 44], true); B(u, v, 1, u, v, 4, [60, 60, 64]);
    B(u - 1, v - 1, 5, u + 1, v + 1, 5, [50, 50, 58]); B(u - 1, v + 1, 6, u + 1, v + 1, 11, [50, 50, 58]);
  },
  vetements: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B;
    B(0, 0, 0, W - 1, D - 1, 2, function (u, v, z) { var h = hs(u, v, z); if (z === 2 && h % 2) { return null; } return [[40, 40, 46], [90, 110, 140], [200, 200, 196], [150, 60, 60]][h % 4]; });
  },
  serviettes: function (o, A) {
    var c = A.cadre, W = c.W, B = A.B;
    B(0, 0, 0, 0, 0, 15, [190, 196, 204]); B(W - 1, 0, 0, W - 1, 0, 15, [190, 196, 204]);
    B(0, 0, 14, W - 1, 0, 14, [190, 196, 204]);
    B(1, 0, 8, W - 2, 0, 13, function (u) { return u < W / 2 ? [230, 120, 150] : [120, 170, 200]; });
  },
  guitare: function (o, A) {
    var c = A.cadre, u = Math.floor(c.W / 2), B = A.B;
    B(u - 1, 0, 1, u + 1, 1, 6, function (uu, v, z) { return (uu !== u || z === 1 || z === 6) ? [70, 34, 20] : [214, 140, 40]; }, true);
    B(u, 0, 7, u, 0, 15, [52, 36, 26]); B(u, 0, 16, u, 0, 17, [30, 24, 20]);
    A.acte('guitare', u, 4, { pose: 'guitar' });
  },
  frigo: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 7), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 18, function (u, v, z) { if (v === d - 1 && z === 12) { return [170, 176, 184]; } if (v === d - 1 && u === W - 2 && z >= 13 && z <= 16) { return [120, 124, 130]; } return [226, 230, 234]; }, true);
  },
  lave_linge: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 6), m = Math.floor(W / 2), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 8, function (u, v, z) { var du = u - m, dz = z - 4; if (v === d - 1 && du * du + dz * dz <= 5) { return du * du + dz * dz <= 2 ? [60, 80, 100] : [170, 176, 184]; } return [240, 240, 238]; }, true);
  },
  wc: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, m = Math.floor(W / 2), B = A.B, f = Math.min(D - 1, 6);
    B(m - 2, 0, 0, m + 2, 1, 9, function (u, v, z) { return z === 9 ? [226, 228, 232] : (z === 8 && u === m && v === 1 ? [190, 196, 204] : [246, 246, 244]); }, true);
    B(m - 1, 2, 0, m + 1, f, 2, [240, 240, 238], true);
    B(m - 2, 2, 3, m + 2, f, 3, function (u, v) { var bord = (u === m - 2 || u === m + 2 || v === f || v === 2); if ((u === m - 2 || u === m + 2) && v === f) { return null; } return bord ? [250, 250, 250] : [150, 180, 200]; });
    B(m - 2, 2, 4, m + 2, 2, 8, [236, 236, 234]);
    B(W - 1, 2, 5, W - 1, 3, 6, [252, 252, 250]);
    B(0, f, 0, 0, f, 2, [120, 160, 200]);
  },
  douche: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B;
    B(0, 0, 0, W - 1, D - 1, 0, function (u, v) { return ((u >> 1) + (v >> 1)) % 2 ? [228, 236, 242] : [196, 214, 228]; }, true);
    B(1, 1, 1, W - 2, D - 2, 1, function (u, v) { return (u === Math.floor(W / 2) && v === Math.floor(D / 2)) ? [120, 126, 134] : null; });
    B(W - 1, 0, 1, W - 1, D - 1, 19, function (u, v, z) { return (v === 0 || v === D - 1 || z === 19) ? [180, 186, 194] : (z % 3 === 0 ? [206, 226, 238] : null); });
    B(0, D - 1, 1, W - 2, D - 1, 19, function (u, v, z) { return (u === 0 || z === 19) ? [180, 186, 194] : (z % 3 === 0 ? [206, 226, 238] : null); });
    B(1, 0, 1, 1, 0, 18, [170, 176, 184]); B(1, 0, 18, 3, 1, 18, [190, 196, 204]); B(3, 1, 17, 3, 1, 17, [220, 230, 240]);
    B(Math.floor(W / 2), 0, 10, Math.floor(W / 2) + 1, 0, 10, [230, 120, 150]);
    B(W + 1, 1, 0, W + 4, 3, 0, [120, 170, 200]);
  },
  lavabo: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 5), m = Math.floor(W / 2), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 7, [238, 238, 236], true);
    B(1, 1, 8, W - 2, d - 2, 8, function (u, v) { return (u === 1 || u === W - 2 || v === 1 || v === d - 2) ? [248, 248, 248] : [196, 204, 212]; });
    B(m - 2, 0, 11, m + 2, 0, 18, function (u, v, z) { return (u === m - 2 || u === m + 2 || z === 11 || z === 18) ? [200, 200, 204] : [160, 176, 188]; });
  },
  etagere_bar: function (o, A) {
    var c = A.cadre, W = c.W, D = c.D, B = A.B, u;
    B(0, 0, 10, 0, 0, 22, [60, 60, 64]); B(W - 1, 0, 10, W - 1, 0, 22, [60, 60, 64]);
    B(0, 0, 23, W - 1, D - 1, 23, [196, 160, 110]);
    for (u = 2; u < W - 2; u += 2) { B(u, Math.floor(D / 2), 20, u, Math.floor(D / 2), 21, [196, 214, 228]); }
  },
  tabouret: function (o, A) {
    var c = A.cadre, u = Math.floor(c.W / 2), v = Math.floor(c.D / 2), B = A.B;
    B(u - 1, v - 1, 0, u + 1, v + 1, 0, [190, 196, 202], true); B(u, v, 1, u, v, 6, [190, 196, 202]);
    B(u - 1, v - 1, 7, u + 1, v + 1, 7, [86, 58, 40]);
  },
  dressing: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 6), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 21, function (u, v, z) { if (v === d - 1 && u % 7 === 0) { return [190, 150, 100]; } if (v === d - 1 && u % 7 === 5 && z >= 9 && z <= 12) { return [120, 90, 60]; } return varie([216, 176, 120], u, v, z, 2); }, true);
  },
  bureau_tv: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 7), m = Math.floor(W / 2), B = A.B, tw = Math.min(W - 4, 12), a = m - Math.floor(tw / 2), b = a + tw - 1;
    B(0, 0, 7, W - 1, d - 1, 7, [232, 230, 224], true);
    B(0, 0, 0, 0, d - 1, 6, [210, 208, 202]); B(W - 1, 0, 0, W - 1, d - 1, 6, [210, 208, 202]);
    B(a, 1, 8, b, 1, 14, function (u, v, z) { return (u === a || u === b || z === 8 || z === 14) ? [18, 18, 20] : [0, 0, 0, 3]; });
    B(m - 2, 3, 8, m + 2, 4, 8, [60, 60, 64]);
  },
  bibliotheque: function (o, A) {
    var c = A.cadre, W = c.W, d = Math.min(c.D, 3), B = A.B;
    B(0, 0, 0, W - 1, d - 1, 20, function (u, v, z) {
      if (v < d - 1 || u === 0 || u === W - 1 || z % 5 === 0 || z === 20) { return [240, 240, 238]; }
      var h = hs(u, z, 7);
      if (z % 5 === 4 && h % 3 === 0) { return null; }
      if (u === 2 && z === 12) { return [230, 186, 40]; }
      if (u === W - 3 && z === 7) { return [170, 60, 140]; }
      return [[170, 50, 46], [40, 80, 140], [60, 120, 70], [210, 170, 60], [90, 60, 40], [230, 230, 220]][h % 6];
    }, true);
  },
  affiche: function (o, A) {
    var c = A.cadre, W = c.W, B = A.B, z0 = o.z0 || 18, z1 = o.z1 || 26;
    B(0, 0, z0, W - 1, 0, z1, function (u, v, z) {
      if (u === 0 || u === W - 1 || z === z0 || z === z1) { return [240, 238, 232]; }
      return AFFICHE[hs(u >> 1, z >> 1, 3) % AFFICHE.length];
    });
  }
};

/* ---------- construction ---------- */
function vue180(plan) {
  var q = JSON.parse(JSON.stringify(plan)), MX = 0, MY = 0, i, j, p, o, L, CO = { fond: 'avant', avant: 'fond', gauche: 'droite', droite: 'gauche' };
  for (i = 0; i < q.pieces.length; i++) { MX = Math.max(MX, q.pieces[i].x1); MY = Math.max(MY, q.pieces[i].y1); }
  for (i = 0; i < q.pieces.length; i++) {
    p = q.pieces[i];
    var x0 = MX - p.x1, x1 = MX - p.x0, y0 = MY - p.y1, y1 = MY - p.y0;
    p.x0 = x0; p.x1 = x1; p.y0 = y0; p.y1 = y1;
    for (j = 0; j < (p.ouvertures || []).length; j++) {
      o = p.ouvertures[j]; L = (o.cote === 'fond' || o.cote === 'avant') ? p.x1 - p.x0 : p.y1 - p.y0;
      o.cote = CO[o.cote]; o.debut = L - o.debut - o.long;
    }
  }
  for (i = 0; i < (q.objets || []).length; i++) {
    o = q.objets[i];
    if (o.x0 !== undefined) { var a = MX - o.x1, b = MX - o.x0, c = MY - o.y1, d = MY - o.y0; o.x0 = a; o.x1 = b; o.y0 = c; o.y1 = d; }
    if (o.face) { o.face = INVERSE[o.face]; }
    if (o.monte) { o.monte = INVERSE[o.monte]; }
    if (o.pts) { for (j = 0; j < o.pts.length; j++) { o.pts[j] = [MX - o.pts[j][0], MY - o.pts[j][1]]; } }
  }
  return q;
}

function construire(plan) {
  if (plan.vue === 180) { plan = vue180(plan); }
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
      var lv = solVoisin(x, y, 'max');
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

  // 5. objets
  var actes = {}, lumieres = [], vapeur = null, surSol = {}, jours = [];
  function niveauA(x, y) { if (!dedans(x, y)) { return 1; } var f = fl[I(x, y)]; return f > 0 ? f : 1; }
  function poserObjet(o) {
    var R = RENDUS[o.type];
    if (!R) { return; }
    var cd = o.x0 !== undefined ? cadre(o) : null;
    var b0 = cd ? niveauA(Math.round(cd.cx), Math.round(cd.cy)) : 1;
    var zCoupe = (cd && o.face && !vueCam(cd.face)) ? 9 : 99;   // dos tourne vers la camera : coupe comme les murs
    var A = {
      cadre: cd,
      B: function (u0, v0, z0, u1, v1, z1, col, block) {
        var u, v, z, p2, cc;
        for (u = u0; u <= u1; u++) {
          for (v = v0; v <= v1; v++) {
            p2 = cd.at(u, v);
            if (!dedans(p2[0], p2[1])) { continue; }
            for (z = z0; z <= Math.min(z1, zCoupe); z++) { cc = typeof col === 'function' ? col(u, v, z) : col; add(p2[0], p2[1], b0 + z, cc); }
            if (block) { occ[I(p2[0], p2[1])] = 1; }
          }
        }
      },
      feuillage: function (u0, v0, zc, r, seed) {
        var du, dv, dz, dd, h, p2;
        for (du = -r; du <= r; du++) {
          for (dv = -r; dv <= r; dv++) {
            for (dz = -r; dz <= r; dz++) {
              dd = du * du + dv * dv + dz * dz * 0.8; h = hs(u0 + du + seed, v0 + dv, zc + dz);
              if (dd <= r * r && h % 3 !== 0) { p2 = cd.at(u0 + du, v0 + dv); add(p2[0], p2[1], b0 + zc + dz, [52 + h % 30, 112 + h % 40, 46 + h % 20]); }
            }
          }
        }
      },
      lumiere: function (type, u, v, z) { var p2 = cd.at(u, v); lumieres.push({ type: type, x: p2[0], y: p2[1], z: b0 + z }); },
      vapeur: function (u, v, z) { var p2 = cd.at(u, v); vapeur = { x: p2[0], y: p2[1], z: b0 + z }; },
      acte: function (nom, u, v, op) {
        if (actes[nom]) { return; }
        var p2 = cd.at(u, v), a = { ax: p2[0] + 0.5, ay: p2[1] + 0.5, pose: op.pose };
        var reg = op.regarde || INVERSE[cd.face];
        a.dos = op.pose === 'guitar' ? false : !vueCam(reg);
        if (op.sx !== undefined) { var q2 = cd.at(op.sx, op.sy); a.sx = q2[0] + 0.5; a.sy = q2[1] + 0.5; a.sz = b0 + op.sz; }
        if (op.tx !== undefined) { var t2 = cd.at(op.tx, op.ty); a.tx = t2[0] + 0.5; a.ty = t2[1] + 0.5; a.tz = b0 + op.tz; }
        actes[nom] = a;
      },
      escalier: function (o2) {
        var x0 = Math.min(o2.x0, o2.x1), x1 = Math.max(o2.x0, o2.x1), y0 = Math.min(o2.y0, o2.y1), y1 = Math.max(o2.y0, o2.y1);
        var dir = o2.monte || '+x', axeX = dir.charAt(1) === 'x', pos = dir.charAt(0) === '+';
        var len = axeX ? x1 - x0 + 1 : y1 - y0 + 1, xx, yy, pr, bas, haut, n, niv, zz;
        if (axeX) { bas = niveauA(pos ? x0 - 1 : x1 + 1, Math.round((y0 + y1) / 2)); haut = niveauA(pos ? x1 + 1 : x0 - 1, Math.round((y0 + y1) / 2)); }
        else { bas = niveauA(Math.round((x0 + x1) / 2), pos ? y0 - 1 : y1 + 1); haut = niveauA(Math.round((x0 + x1) / 2), pos ? y1 + 1 : y0 - 1); }
        n = Math.max(0, haut - bas - 1);
        for (xx = x0; xx <= x1; xx++) {
          for (yy = y0; yy <= y1; yy++) {
            if (!dedans(xx, yy)) { continue; }
            pr = axeX ? (pos ? xx - x0 : x1 - xx) : (pos ? yy - y0 : y1 - yy);
            niv = bas + 1 + Math.floor(pr * n / len);
            if (n === 0) { niv = bas; }
            fl[I(xx, yy)] = niv; mur[I(xx, yy)] = 0; occ[I(xx, yy)] = 0; surSol[I(xx, yy)] = 1;
            for (zz = 0; zz < niv; zz++) { add(xx, yy, zz, varie(zz === niv - 1 ? PINE : [140, 86, 46], xx, yy, zz, 3), 1); }
          }
        }
      },
      rambarde: function (o2) {
        var pts = o2.pts || [], cells = [], vu = {}, k2, a2, b2, st, t, cx2, cy2, key;
        for (k2 = 0; k2 < pts.length - 1; k2++) {
          a2 = pts[k2]; b2 = pts[k2 + 1]; st = Math.max(1, Math.ceil(Math.max(Math.abs(b2[0] - a2[0]), Math.abs(b2[1] - a2[1]))));
          for (t = 0; t <= st; t++) {
            cx2 = Math.round(a2[0] + (b2[0] - a2[0]) * t / st); cy2 = Math.round(a2[1] + (b2[1] - a2[1]) * t / st); key = cx2 + ',' + cy2;
            if (!vu[key]) { vu[key] = 1; cells.push([cx2, cy2]); }
          }
        }
        for (k2 = 0; k2 < cells.length; k2++) {
          var cx3 = cells[k2][0], cy3 = cells[k2][1], bb = niveauA(cx3, cy3), z3;
          if (!dedans(cx3, cy3)) { continue; }
          occ[I(cx3, cy3)] = 1;
          if (k2 % 2 === 0) { for (z3 = bb; z3 < bb + 9; z3++) { add(cx3, cy3, z3, k2 % 6 === 0 ? [140, 84, 42] : [160, 100, 54]); } }
          add(cx3, cy3, bb + 9, [150, 90, 46]);
        }
      }
    };
    R(o, A);
  }
  var objets = plan.objets || [];
  for (i = 0; i < objets.length; i++) { poserObjet(objets[i]); }
  // lumiere du jour devant chaque fenetre
  for (i = 0; i < pieces.length; i++) {
    p = pieces[i];
    for (j = 0; j < (p.ouvertures || []).length; j++) {
      var ow = p.ouvertures[j]; if (ow.type !== 'fenetre') { continue; }
      var mil = ow.debut + ow.long / 2, jx, jy;
      if (ow.cote === 'fond') { jx = p.x0 + mil; jy = p.y0 + 8; } else if (ow.cote === 'avant') { jx = p.x0 + mil; jy = p.y1 - 8; }
      else if (ow.cote === 'gauche') { jx = p.x0 + 8; jy = p.y0 + mil; } else { jx = p.x1 - 8; jy = p.y0 + mil; }
      jours.push({ x: jx, y: jy, z: p.niveau, arriere: ow.cote === 'fond' || ow.cote === 'gauche' });
    }
  }

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
  function decoMur() { return null; }
  // ce qu'on voit par la fenetre : 0 = ciel, 1-3 = feuillage (ombre a clair), 4 = tronc
  function vegetal(x, y, zr) {
    var a = (x === 0 || (dedans(x - 1, y) && mur[I(x - 1, y)] === 0 && dedans(x + 1, y) && mur[I(x + 1, y)] === 0)) ? y : x;
    var top = 18 + 4 * Math.sin(a * 0.31) + 2.5 * Math.sin(a * 0.83 + 1.7) + (hs(a >> 2, 3, 9) % 3);
    var h = hs(a, zr, 17);
    if (zr <= top) {
      if (a % 13 === 6 && zr <= 12 && zr > 8) { return 4; }
      if (zr > top - 1.5) { return h % 3 ? 3 : 2; }
      if (zr > top - 5) { return h % 4 === 0 ? 3 : 2; }
      return h % 5 === 0 ? 2 : 1;
    }
    if (zr <= top + 1.5 && h % 3 === 0) { return 2; }
    return 0;
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
          if (!deb || !fin || zr === 8 || zr === 25 || zr === 14 || zr === 20) { c2 = [236, 233, 226]; } else { c2 = [0, 0, 0, 2, vegetal(x, y, zr)]; }
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
  var wtree = new Uint8Array(W * H), wtCour = 0;
  function px(x2, y2, col, d, t) {
    if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) { return; }
    var q = x2 + y2 * W; base[q] = col; depth[q] = d; ptype[q] = t; wtree[q] = wtCour;
  }
  var buckets = [], k, v, sx, sy, c, nz, tp, rr2, ll, d, t2;
  for (j = 0; j < V.length; j++) { k = (V[j][0] + V[j][1]) * 40 + V[j][2]; (buckets[k] || (buckets[k] = [])).push(V[j]); }
  for (k = 0; k < buckets.length; k++) {
    if (!buckets[k]) { continue; }
    for (j = 0; j < buckets[k].length; j++) {
      v = buckets[k][j]; c = v[3]; t2 = v[4]; wtCour = t2 === 2 ? (c[4] || 0) : 0;
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
  var winPx = [], tvPx = [], winVeg = [];
  for (i = 0; i < W * H; i++) { if (ptype[i] === 2) { winPx.push(i); winVeg.push(wtree[i]); } else if (ptype[i] === 3) { tvPx.push(i); } }

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

  return {
    W: W, H: H, OX: OX, OY: OY, SX: SX, SY: SY,
    base: base, depth: depth, winPx: winPx, winVeg: winVeg, tvPx: tvPx,
    fl: fl, occ: occ, CW: CW, CH: CH, cwalk: cwalk, cht: cht,
    actes: actes, lumieres: lumieres, vapeur: vapeur, jours: jours,
    proj: function (x2, y2, z2) { return [OX + 2 * (x2 - y2) + 2, OY + x2 + y2 - 2 * z2 + 1]; }
  };
}

return { construire: construire, PLAN_DEFAUT: PLAN_DEFAUT, pack: pack, hs: hs, RENDUS: RENDUS };
})();
