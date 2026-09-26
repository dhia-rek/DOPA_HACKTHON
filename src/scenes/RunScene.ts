import Phaser from 'phaser';
import { COLORS, Dir, DIR_VECTORS, GAME_HEIGHT, GAME_WIDTH, GRID_COLS, GRID_ROWS, OPPOSITE, ROOM_COLS, ROOM_ROWS, TILE } from '../config';
import { events } from '../core/events';
import type { RunState } from '../core/run';
import { getEnemy } from '../data/enemies';
import { getItem } from '../data/items';
import { doorsOf, neighbour, RoomNode } from '../gen/floorGen';
import { Enemy } from '../entities/Enemy';
import { Pickup, PickupKind } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { Projectile, ProjectilePool } from '../entities/Projectile';
import { achievements } from '../systems/achievements';
import { BEHAVIOURS } from '../systems/behaviours';

const DOOR_TILES: Record<Dir, { col: number; row: number }> = {
  up: { col: Math.floor(GRID_COLS / 2), row: 0 },
  down: { col: Math.floor(GRID_COLS / 2), row: GRID_ROWS - 1 },
  left: { col: 0, row: Math.floor(GRID_ROWS / 2) },
  right: { col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) },
};

export interface RunSceneData {
  enterFrom?: Dir;
}

/**
 * One instance of this scene = one room. Moving through a door restarts the
 * scene with the neighbouring RoomNode as the current room. All persistent
 * state lives in RunState (registry key "run"), not on the scene.
 */
export class RunScene extends Phaser.Scene {
  private run!: RunState;
  private room!: RoomNode;
  private player!: Player;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private rocks!: Phaser.Physics.Arcade.StaticGroup;
  private pits!: Phaser.Physics.Arcade.StaticGroup;
  private doors!: Phaser.Physics.Arcade.StaticGroup;
  private doorSprites: Partial<Record<Dir, Phaser.Physics.Arcade.Image>> = {};
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private playerShots!: ProjectilePool;
  private enemyShots!: ProjectilePool;
  private pedestal: Phaser.Physics.Arcade.Image | null = null;
  private trapdoor: Phaser.Physics.Arcade.Image | null = null;
  private transitioning = false;
  private dead = false;

  constructor() {
    super('run');
  }

  create(data: RunSceneData): void {
    this.transitioning = false;
    this.dead = false;
    this.doorSprites = {};
    this.pedestal = null;
    this.trapdoor = null;

    this.run = this.registry.get('run') as RunState;
    achievements.attachRun(this.run);
    const map = this.run.ensureFloor();
    this.room = this.run.room ?? map.start;
    this.room.visited = true;

    this.walls = this.physics.add.staticGroup();
    this.rocks = this.physics.add.staticGroup();
    this.pits = this.physics.add.staticGroup();
    this.doors = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.pickups = this.physics.add.group({ runChildUpdate: false });
    this.playerShots = new ProjectilePool(this);
    this.enemyShots = new ProjectilePool(this);

    this.buildBorder();
    this.buildInterior();

    const spawn = this.spawnPoint(data?.enterFrom);
    this.player = new Player(this, spawn.x, spawn.y, this.run, this.playerShots);

    this.wireCollisions();
    this.spawnRoomContents();
    if (!this.room.cleared && this.enemies.getLength() === 0) this.room.cleared = true;
    this.refreshDoors();

    events.emit('room_entered', { roomType: this.room.type, floor: this.run.floor });
    events.emit('hud_update', {});
    this.cameras.main.fadeIn(180, 0, 0, 0);

    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    this.scene.bringToTop('hud');
  }

  update(time: number, delta: number): void {
    if (this.dead) return;
    this.player.nearestEnemy = this.nearestEnemy();
    this.player.update(time, delta);
    this.playerShots.step();
    this.enemyShots.step();

    const alive = this.enemies.getChildren().filter((e) => e.active) as Enemy[];
    for (const enemy of alive) {
      enemy.step(delta);
      if (enemy.hp <= 0) {
        this.killEnemy(enemy);
        continue;
      }
      if (enemy.isSpawning) {
        enemy.body.setVelocity(0, 0);
        continue;
      }
      BEHAVIOURS[enemy.def.behaviour]({
        enemy,
        player: this.player,
        enemyShots: this.enemyShots,
        rng: this.run.rng,
        now: time,
        delta,
        difficulty: this.run.difficulty,
      });
    }

    if (!this.room.cleared && alive.length === 0 && this.roomHadEnemies()) this.clearRoom();
  }

  // ---------------------------------------------------------------- building

  private buildBorder(): void {
    const doorDirs = doorsOf(this.run.floorMap!, this.room);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const isBorder = row === 0 || col === 0 || row === GRID_ROWS - 1 || col === GRID_COLS - 1;
        if (!isBorder) continue;
        const { x, y } = this.tileCenter(col, row);
        const doorDir = this.doorAt(col, row);
        if (doorDir && doorDirs.includes(doorDir)) {
          const door = this.doors.create(x, y, 'door_closed') as Phaser.Physics.Arcade.Image;
          door.setData('dir', doorDir);
          if (doorDir === 'left') door.setAngle(-90);
          if (doorDir === 'right') door.setAngle(90);
          if (doorDir === 'down') door.setAngle(180);
          this.doorSprites[doorDir] = door;
        } else {
          (this.walls.create(x, y, 'wall') as Phaser.Physics.Arcade.Image).setTint(this.run.stage.palette.wall);
        }
      }
    }
  }

  private buildInterior(): void {
    const tint = this.run.stage.palette.floor;
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const { x, y } = this.tileCenter(c + 1, r + 1);
        this.add.image(x, y, 'floor').setDepth(0).setTint(tint);
        const ch = this.room.template[r][c];
        if (ch === '#') {
          const rock = this.rocks.create(x, y, 'rock') as Phaser.Physics.Arcade.Image;
          rock.setDepth(1);
          (rock.body as Phaser.Physics.Arcade.StaticBody).setCircle(TILE / 2 - 10, 10, 10);
        } else if (ch === 'P') {
          const pit = this.pits.create(x, y, 'pit') as Phaser.Physics.Arcade.Image;
          pit.setDepth(1);
          (pit.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE - 16, TILE - 16, true);
        }
      }
    }
  }

  private slots(ch: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        if (this.room.template[r][c] === ch) out.push(this.tileCenter(c + 1, r + 1));
      }
    }
    return out;
  }

  private spawnRoomContents(): void {
    const room = this.room;
    if (!room.cleared) {
      if (room.type === 'boss' && room.bossId) {
        const slot = this.slots('B')[0] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 - TILE };
        this.spawnEnemy(room.bossId, slot.x, slot.y);
      } else {
        const slots = room.type === 'normal' ? this.slots('E') : [];
        // Never spawn on top of the player.
        const safe = slots.filter((s) => Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) > TILE * 1.5);
        const use = safe.length ? safe : slots;
        room.enemies.forEach((id, i) => {
          const s = use[i % Math.max(1, use.length)];
          if (s) this.spawnEnemy(id, s.x, s.y);
        });
      }
    }

    if (room.type === 'treasure' && room.itemId && !room.itemTaken) {
      const slot = this.slots('I')[0] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
      this.pedestal = this.physics.add.staticImage(slot.x, slot.y, 'pedestal').setDepth(2);
      const icon = this.add.image(slot.x, slot.y - 18, `item_${room.itemId}`).setDepth(3);
      this.tweens.add({ targets: icon, y: slot.y - 24, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.InOut' });
      this.pedestal.setData('icon', icon);
      this.physics.add.overlap(this.player, this.pedestal, () => this.takeItem());
    }

    if (room.type === 'boss' && room.cleared) this.spawnTrapdoor();
  }

  private spawnEnemy(id: string, x: number, y: number): Enemy {
    return new Enemy(this, this.enemies, x, y, getEnemy(id), this.run.difficulty);
  }

  private spawnTrapdoor(): void {
    if (this.trapdoor) return;
    this.trapdoor = this.physics.add.staticImage(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'trapdoor').setDepth(1);
    (this.trapdoor.body as Phaser.Physics.Arcade.StaticBody).setCircle(18, 14, 14);
    this.physics.add.overlap(this.player, this.trapdoor, () => this.descend());
  }

  // -------------------------------------------------------------- collisions

  private wireCollisions(): void {
    const solids = [this.walls, this.rocks, this.pits, this.doors];
    for (const s of solids) {
      if (s !== this.doors) this.physics.add.collider(this.player, s);
      this.physics.add.collider(this.enemies, s);
    }
    // Closed doors are solid for the player; open ones are walked through (see the overlap below).
    this.physics.add.collider(this.player, this.doors, undefined, () => !this.room.cleared);
    this.physics.add.collider(this.pickups, [this.walls, this.rocks, this.pits]);
    this.physics.add.collider(this.enemies, this.enemies);

    // Shots die on walls; rocks stop them unless spectral.
    for (const pool of [this.playerShots, this.enemyShots]) {
      this.physics.add.overlap(pool, [this.walls, this.doors], (shot) => this.shotHitsWall(shot as Projectile));
      this.physics.add.overlap(pool, this.rocks, (shot) => {
        const s = shot as Projectile;
        if (!s.flags.spectral) this.shotHitsWall(s);
      });
    }

    this.physics.add.overlap(this.playerShots, this.enemies, (shot, target) => this.shotHitsEnemy(shot as Projectile, target as Enemy));
    this.physics.add.overlap(this.player, this.enemyShots, (_p, shot) => {
      const s = shot as Projectile;
      if (!s.active) return;
      s.kill();
      this.hurtPlayer(s.damage, 'projectile', s.x, s.y);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      const enemy = e as Enemy;
      if (enemy.isSpawning) return;
      this.hurtPlayer(enemy.contactDamage, enemy.def.id, enemy.x, enemy.y);
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, pk) => this.collect(pk as Pickup));
    this.physics.add.overlap(this.player, this.doors, (_p, door) => {
      if (!this.room.cleared) return;
      this.leaveThrough((door as Phaser.GameObjects.Image).getData('dir') as Dir);
    });
  }

  private shotHitsWall(shot: Projectile): void {
    if (!shot.active) return;
    if (shot.owner === 'player' && shot.flags.splitOnWall && !shot.flags.piercing) {
      const v = shot.body.velocity;
      const speed = v.length();
      for (const sign of [-1, 1]) {
        const a = Math.atan2(-v.y, -v.x) + sign * 0.6;
        this.playerShots.shoot({
          x: shot.x,
          y: shot.y,
          dx: Math.cos(a),
          dy: Math.sin(a),
          speed: speed * 0.8,
          damage: shot.damage * 0.5,
          range: 180,
          owner: 'player',
          flags: { ...shot.flags, splitOnWall: false },
        });
      }
    }
    shot.kill();
  }

  private shotHitsEnemy(shot: Projectile, enemy: Enemy): void {
    if (!shot.active || !enemy.active || enemy.isSpawning) return;
    if (shot.hitSet.has(enemy)) return;
    shot.hitSet.add(enemy);
    enemy.takeHit(shot.damage, shot.x, shot.y, shot.flags.knockback ?? 1, shot.flags.poison ?? false);
    if (!shot.flags.piercing) shot.kill();
  }

  private hurtPlayer(amount: number, source: string, fromX: number, fromY: number): void {
    if (this.dead || this.player.isInvulnerable) return;
    if (this.run.character.passive === 'glass') amount = Math.max(amount, 2);
    const died = this.player.hurt(amount, source, fromX, fromY);
    if (died) this.die();
  }

  private killEnemy(enemy: Enemy): void {
    this.run.killsThisRun++;
    const isBoss = !!enemy.def.isBoss;
    this.burst(enemy.x, enemy.y, enemy.def.color, isBoss ? 24 : 8);
    events.emit('enemy_killed', { enemyId: enemy.def.id, isBoss });
    if (isBoss) {
      this.cameras.main.shake(300, 0.012);
      events.emit('boss_killed', { enemyId: enemy.def.id, floor: this.run.floor });
    } else if (this.run.dropRng.chance(enemy.def.dropChance ?? 0)) {
      this.dropPickup(enemy.x, enemy.y, this.run.dropRng.chance(0.4) ? 'heart' : 'coin');
    }
    enemy.destroy();
  }

  private dropPickup(x: number, y: number, kind: PickupKind): void {
    const p = new Pickup(this, this.pickups, x, y, kind);
    p.body.setVelocity(this.run.dropRng.float(-120, 120), this.run.dropRng.float(-120, 120));
  }

  private collect(p: Pickup): void {
    if (!p.active) return;
    if (p.kind === 'heart') {
      if (this.run.hp >= this.run.stats.maxHp) return;
      this.run.heal(2);
    } else {
      this.run.addCoins(1);
    }
    events.emit('pickup_collected', { kind: p.kind });
    p.destroy();
  }

  private takeItem(): void {
    if (!this.pedestal || this.room.itemTaken || !this.room.itemId) return;
    this.room.itemTaken = true;
    const item = getItem(this.room.itemId);
    this.run.addItem(item.id);
    (this.pedestal.getData('icon') as Phaser.GameObjects.Image).destroy();
    this.toast(item.name, item.description);
  }

  private clearRoom(): void {
    this.room.cleared = true;
    this.room.enemies = [];
    this.enemyShots.killAll();
    this.refreshDoors();
    events.emit('room_cleared', { roomType: this.room.type, floor: this.run.floor });

    if (this.room.type === 'boss') {
      events.emit('floor_cleared', { floor: this.run.floor });
      if (this.run.isVictoryFloor && !this.run.won) {
        this.run.won = true;
        events.emit('run_won', { seed: this.run.seed, characterId: this.run.character.id, timeMs: this.run.elapsedMs });
        this.toast('Nostos', 'You have descended through every realm. The descent continues, ever deeper…');
      }
      this.dropPickup(GAME_WIDTH / 2 - TILE, GAME_HEIGHT / 2, 'heart');
      this.spawnTrapdoor();
    }
  }

  private roomHadEnemies(): boolean {
    return this.room.type === 'boss' || this.room.enemies.length > 0;
  }

  private refreshDoors(): void {
    const open = this.room.cleared;
    for (const dir of Object.keys(this.doorSprites) as Dir[]) {
      const door = this.doorSprites[dir]!;
      door.setTexture(open ? 'door_open' : 'door_closed');
    }
  }

  // ------------------------------------------------------------- transitions

  private leaveThrough(dir: Dir): void {
    if (this.transitioning) return;
    const next = neighbour(this.run.floorMap!, this.room, dir);
    if (!next) return;
    this.transitioning = true;
    this.player.body.stop();
    this.run.room = next;
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data: RunSceneData = { enterFrom: OPPOSITE[dir] };
      this.scene.restart(data);
    });
  }

  private descend(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.body.stop();
    this.run.nextFloor();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({}));
  }

  private die(): void {
    this.dead = true;
    this.player.body.stop();
    this.playerShots.killAll();
    this.enemyShots.killAll();
    this.physics.pause();
    events.emit('run_lost', { seed: this.run.seed, characterId: this.run.character.id, floor: this.run.floor, timeMs: this.run.elapsedMs });
    this.tweens.add({ targets: this.player, angle: 90, alpha: 0.3, duration: 600 });
    this.time.delayedCall(900, () => {
      this.scene.stop('hud');
      this.scene.start('gameover');
    });
  }

  // ----------------------------------------------------------------- helpers

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const child of this.enemies.getChildren()) {
      const e = child as Enemy;
      if (!e.active || e.isSpawning) continue;
      const d = Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.circle(x, y, this.run.rng.float(3, 7), color).setDepth(20);
      const a = this.run.rng.float(0, Math.PI * 2);
      const d = this.run.rng.float(20, 70);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.2,
        duration: 350,
        onComplete: () => p.destroy(),
      });
    }
  }

  private toast(title: string, body: string): void {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, `${title}\n${body}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
        align: 'center',
        backgroundColor: '#0b0a0fcc',
        padding: { x: 12, y: 8 },
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 500, onComplete: () => t.destroy() });
  }

  private doorAt(col: number, row: number): Dir | null {
    for (const dir of Object.keys(DOOR_TILES) as Dir[]) {
      const d = DOOR_TILES[dir];
      if (d.col === col && d.row === row) return dir;
    }
    return null;
  }

  private tileCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
  }

  private spawnPoint(enterFrom?: Dir): { x: number; y: number } {
    if (!enterFrom) return { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    const d = DOOR_TILES[enterFrom];
    const [ix, iy] = DIR_VECTORS[OPPOSITE[enterFrom]];
    return this.tileCenter(d.col + ix * 2, d.row + iy * 2);
  }
}
