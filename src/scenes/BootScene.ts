import Phaser from 'phaser';
import { COLORS, PLAYER, TILE } from '../config';

/**
 * Generates placeholder textures at runtime so the POC needs no art assets.
 * Replace these with real sprites later (this.load.image / spritesheet).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.makeFloor();
    this.makeWall();
    this.makeDoor();
    this.makeRock();
    this.makePit();
    this.makePlayer();
    this.scene.start('room');
  }

  private makeFloor(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.floorAlt);
    g.fillRect(0, 0, TILE / 2, TILE / 2);
    g.fillRect(TILE / 2, TILE / 2, TILE / 2, TILE / 2);
    g.generateTexture('floor', TILE, TILE);
    g.destroy();
  }

  private makeWall(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.wall).fillRect(4, 4, TILE - 8, TILE - 8);
    g.lineStyle(2, COLORS.wallEdge);
    g.strokeRect(4, 4, TILE / 2 - 4, TILE / 2 - 4);
    g.strokeRect(TILE / 2, TILE / 2, TILE / 2 - 4, TILE / 2 - 4);
    g.generateTexture('wall', TILE, TILE);
    g.destroy();
  }

  private makeDoor(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.wallEdge).fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.doorFrame).fillRect(8, 4, TILE - 16, TILE - 8);
    g.fillStyle(COLORS.door).fillRect(14, 10, TILE - 28, TILE - 20);
    g.generateTexture('door', TILE, TILE);
    g.destroy();
  }

  private makeRock(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.rockShade).fillCircle(TILE / 2, TILE / 2 + 4, TILE / 2 - 8);
    g.fillStyle(COLORS.rock).fillCircle(TILE / 2 - 3, TILE / 2 - 2, TILE / 2 - 12);
    g.generateTexture('rock', TILE, TILE);
    g.destroy();
  }

  private makePit(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.floor).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x0b0a0f).fillRect(6, 6, TILE - 12, TILE - 12);
    g.generateTexture('pit', TILE, TILE);
    g.destroy();
  }

  private makePlayer(): void {
    const size = PLAYER.radius * 2 + 8;
    const cx = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.playerShade).fillCircle(cx, cx + 3, PLAYER.radius);
    g.fillStyle(COLORS.player).fillCircle(cx, cx, PLAYER.radius);
    g.fillStyle(COLORS.playerEye);
    g.fillCircle(cx - 7, cx - 4, 3);
    g.fillCircle(cx + 7, cx - 4, 3);
    g.generateTexture('player', size, size);
    g.destroy();
  }
}
