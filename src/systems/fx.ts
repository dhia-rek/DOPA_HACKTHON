import Phaser from 'phaser';

/**
 * Small, short-lived visual effects shared by the run scene, player and
 * enemies. Everything here is tween-driven and destroys itself.
 */

/** Dust puffs at ground level (footsteps, wind-ups, wall hits). */
export function dust(scene: Phaser.Scene, x: number, y: number, count = 1, color = 0xd8c8a8, size = 5): void {
  for (let i = 0; i < count; i++) {
    const p = scene.add.circle(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-3, 3), size + Math.random() * 3, color, 0.45).setDepth(6);
    scene.tweens.add({ targets: p, y: p.y - 10 - Math.random() * 10, scale: 1.8, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => p.destroy() });
  }
}

/** Impact flash, expanding ring and sparks fanning back along `angle` (the hit's travel direction). */
export function hitSpark(scene: Phaser.Scene, x: number, y: number, angle: number, color = 0xffffff, power = 1): void {
  const flash = scene.add.circle(x, y, 10 * power, 0xffffff, 0.95).setDepth(25);
  scene.tweens.add({ targets: flash, scale: 0.2, alpha: 0, duration: 90, onComplete: () => flash.destroy() });
  const ring = scene.add.image(x, y, 'fx_ring').setDepth(25).setTint(color).setScale(0.3 * power).setAlpha(0.9);
  scene.tweens.add({ targets: ring, scale: 1.3 * power, alpha: 0, duration: 220, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  const n = 4 + Math.round(2 * power);
  for (let i = 0; i < n; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.6;
    const dist = (28 + Math.random() * 30) * power;
    const s = scene.add.image(x, y, 'fx_spark').setDepth(25).setTint(color).setRotation(a).setScale(0.6 + Math.random() * 0.6, 1);
    scene.tweens.add({
      targets: s, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, scaleX: 0.1,
      duration: 200 + Math.random() * 120, ease: 'Quad.Out', onComplete: () => s.destroy(),
    });
  }
}

/** Ground shockwave for slams and charges ending in a wall. */
export function shockwave(scene: Phaser.Scene, x: number, y: number, color = 0xe8d8b8, radius = 1): void {
  const ring = scene.add.image(x, y, 'fx_ring').setDepth(6).setTint(color).setScale(0.4 * radius, 0.25 * radius).setAlpha(0.8);
  scene.tweens.add({ targets: ring, scaleX: 2.6 * radius, scaleY: 1.5 * radius, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  dust(scene, x, y + 10, 6 + Math.round(4 * radius), 0xcfc0a0, 6);
}

/** One speed streak trailing a charging body; call every few frames while charging. */
export function speedLine(scene: Phaser.Scene, x: number, y: number, vx: number, vy: number, color = 0xffffff): void {
  const a = Math.atan2(vy, vx);
  const l = scene.add
    .image(x - Math.cos(a) * 24 + (Math.random() - 0.5) * 24, y - Math.sin(a) * 24 + (Math.random() - 0.5) * 24, 'fx_spark')
    .setDepth(7).setTint(color).setAlpha(0.6).setRotation(a).setScale(1.6 + Math.random(), 0.7);
  scene.tweens.add({ targets: l, x: l.x - Math.cos(a) * 30, y: l.y - Math.sin(a) * 30, alpha: 0, duration: 160, onComplete: () => l.destroy() });
}

/** Pop-in "!" over an enemy winding up an attack. */
export function warnMark(scene: Phaser.Scene, x: number, y: number, color = 0xff5a3c): void {
  const t = scene.add
    .text(x, y, '!', { fontFamily: "'Cinzel', serif", fontSize: '30px', fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#0b0a0f', strokeThickness: 5 })
    .setOrigin(0.5, 1).setDepth(26).setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1.15, duration: 120, ease: 'Back.Out', yoyo: true, hold: 160, onComplete: () => t.destroy() });
}
