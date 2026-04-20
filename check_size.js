const fs = require('fs');
const players = [
  {
    id: 1, color: '#44aaff',
    x: 200, y: 600,
    w: 36, h: 44, speed: 9,
    hp: 6, maxHp: 6,
    shootTimer: 0, shootInterval: 14,
    invincible: 0, thrustAnim: 0, trail: [{x:1, y:1, life:1}, {x:2,y:2,life:0.5}],
    gunLevel: 1, baseGunLevel: 1, gunTimer: 0,
    shield: false, shieldAnim: 0, shields: 0,
    dead: false, deathAnim: 0, laserTargetY: 0
  }
];
const enemies = [];
for (let i=0; i<10; i++) {
  enemies.push({ id: i, type: 'small', x: 100, y: 100, w: 30, h: 30, hp: 4, maxHp: 4, hitFlash: 0, dead: false, deathAnim: 0, timer: 0 });
}
const payload = {
   p: players, e: enemies, pb: [], eb: [], el: [], 
   gd: [], hp: [], sd: [], ip: [],
   sc: { s: 0, k: 0, w: 1, wt: 0, c: 0, h1: 6, h2: 6, bm: 'regular' },
   ne: []
};

const str = JSON.stringify({ t:'s', p: payload });
console.log('Size (bytes):', Buffer.byteLength(str));
