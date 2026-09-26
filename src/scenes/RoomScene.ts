import Phaser from 'phaser';
import {
  Dir,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  OPPOSITE,
  ROOM_COLS,
  ROOM_ROWS,
  TILE,
} from '../config';
import { ROOM_TEMPLATES } from '../data/rooms';
import { Player } from '../entities/Player';

const DOOR_TILES: Record<Dir, { col: number; row: number }> = {
  up: { col: Math.floor(GRID_COLS / 2), row: 0 },
  down: { col: Math.floor(GRID_COLS / 2), row: GRID_ROWS - 1 },
  left: { col: 0, row: Math.floor(GRID_ROWS / 2) },
  right: { col: GRID_COLS - 1, row: Math.floor(GRID_ROWS / 2) },
};

interface RoomData {
  templateIndex: number;
  enterFrom?: Dir;
}

export class RoomScene extends Phaser.Scene {
  private player!: Player;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doors!: Phaser.Physics.Arcade.StaticGroup;
  private transitioning = false;

  constructor() {
    super('room');
  }

  create(data: RoomData): void {
    this.transitioning = false;
    const templateIndex = data.templateIndex ?? 0;
    const template = ROOM_TEMPLATES[templateIndex];

    this.walls = this.physics.add.staticGroup();
    this.doors = this.physics.add.staticGroup();

    this.buildWalls();
    this.buildInterior(template);

    const spawn = this.spawnPoint(data.enterFrom);
    this.player = new Player(this, spawn.x, spawn.y);

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.overlap(this.player, this.doors, (_p, door) => {
      const dir = (door as Phaser.GameObjects.Image).getData('dir') as Dir;
      this.leaveThrough(dir);
    });

    this.add
      .text(8, 6, `Room ${templateIndex + 1}/${ROOM_TEMPLATES.length}  ·  WASD / arrows  ·  doors → next room`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#c9a45c',
      })
      .setDepth(100);

    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  update(): void {
    this.player.update();
  }

  private buildWalls(): void {
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const isBorder = row === 0 || col === 0 || row === GRID_ROWS - 1 || col === GRID_COLS - 1;
        if (!isBorder) continue;
        const { x, y } = this.tileCenter(col, row);
        const doorDir = this.doorAt(col, row);
        if (doorDir) {
          const door = this.doors.create(x, y, 'door') as Phaser.GameObjects.Image;
          door.setData('dir', doorDir);
          if (doorDir === 'left') door.setAngle(-90);
          if (doorDir === 'right') door.setAngle(90);
          if (doorDir === 'down') door.setAngle(180);
        } else {
          this.walls.create(x, y, 'wall');
        }
      }
    }
  }

  private buildInterior(template: string[]): void {
    for (let r = 0; r < ROOM_ROWS; r++) {
      for (let c = 0; c < ROOM_COLS; c++) {
        const { x, y } = this.tileCenter(c + 1, r + 1);
        this.add.image(x, y, 'floor').setDepth(0);
        const ch = template[r][c];
        if (ch === '#') {
          const rock = this.walls.create(x, y, 'rock') as Phaser.Physics.Arcade.Image;
          rock.setDepth(1);
          (rock.body as Phaser.Physics.Arcade.StaticBody).setCircle(TILE / 2 - 10, 10, 10);
        } else if (ch === 'P') {
          const pit = this.walls.create(x, y, 'pit') as Phaser.Physics.Arcade.Image;
          pit.setDepth(1);
          (pit.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE - 16, TILE - 16, true);
        }
      }
    }
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
    const inward = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[enterFrom];
    return this.tileCenter(d.col + inward[0] * 2, d.row + inward[1] * 2);
  }

  private leaveThrough(dir: Dir): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.body.stop();

    const next = Phaser.Math.Between(0, ROOM_TEMPLATES.length - 1);
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data: RoomData = { templateIndex: next, enterFrom: OPPOSITE[dir] };
      this.scene.restart(data);
    });
  }
}
