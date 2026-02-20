"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";

class RunnerScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private dragons!: Phaser.Physics.Arcade.Group;
  private fireParticles!: Phaser.Physics.Arcade.Group;
  private particles!: Phaser.Physics.Arcade.Group;
  private ground!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private highscoreText!: Phaser.GameObjects.Text;
  private score = 0;
  private level = 1;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private dragonSpawnTimer?: Phaser.Time.TimerEvent;
  private dragonFireTimer?: Phaser.Time.TimerEvent;
  private baseSpawnDelay = 1200;
  private gameActive = true;
  private dragonHealth = 0;

  constructor() {
    super("RunnerScene");
  }

  create() {
    const { width, height } = this.scale;

    // Bakgrunn med gradient-effekt
    this.cameras.main.setBackgroundColor("#0a0e27");

    // Gi scene en referanse for particle creation
    (this as any).particleScene = this;

    // "Ground" (statisk)
    this.ground = this.add.rectangle(width / 2, height - 40, width, 80, 0x1f2937);
    this.physics.add.existing(this.ground, true);
    this.ground.setDepth(10);

    // Decorative stripes on ground
    for (let i = 0; i < width; i += 60) {
      this.add.rectangle(i, height - 40, 20, 80, 0x374151).setDepth(9);
    }

    // Player - bedre styling
    const playerTextureKey = "playerBox";
    if (!this.textures.exists(playerTextureKey)) {
      const g = this.add.graphics();
      g.fillStyle(0x10b981, 1);
      g.fillRoundedRect(0, 0, 48, 64, 12);
      g.lineStyle(2, 0x059669, 1);
      g.strokeRoundedRect(0, 0, 48, 64, 12);
      g.generateTexture(playerTextureKey, 48, 64);
      g.destroy();
    }

    this.player = this.physics.add.sprite(120, height - 120, playerTextureKey);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDepth(50);

    // Collide med ground
    this.physics.add.collider(this.player, this.ground as unknown as Phaser.GameObjects.GameObject);

    // Obstacles (gruppe)
    this.obstacles = this.physics.add.group({
      immovable: true,
      allowGravity: false,
    });

    // Dragons (gruppe)
    this.dragons = this.physics.add.group({
      immovable: true,
      allowGravity: false,
    });

    // Fire particles (gruppe)
    this.fireParticles = this.physics.add.group({
      allowGravity: true,
    });

    // Particles
    this.particles = this.physics.add.group({
      allowGravity: true,
    });

    // Kollisjon: player vs obstacles = game over
    this.physics.add.overlap(this.player, this.obstacles, () => this.gameOver(), undefined, this);

    // Kollisjon: player vs dragons = damage dragon or game over
    this.physics.add.overlap(
      this.player,
      this.dragons,
      (player, dragon) => this.damageDragon(dragon),
      undefined,
      this
    );

    // Kollisjon: player vs fire = game over
    this.physics.add.overlap(
      this.player,
      this.fireParticles,
      () => this.gameOver(),
      undefined,
      this
    );

    // Input: Space / Pointer (klikk/touch) for jump
    const jump = () => {
      if (!this.gameActive) return;
      if (this.player.body.blocked.down || this.player.body.touching.down) {
        this.player.setVelocityY(-520);
        this.createDustParticles(this.player.x, this.player.y + 32);
      }
    };

    this.input.keyboard?.on("keydown-SPACE", jump);
    this.input.on("pointerdown", jump);

    // Tyngdekraft
    this.physics.world.gravity.y = 1200;

    // UI - Score, Level, Highscore
    this.scoreText = this.add.text(16, 16, "Score: 0", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "18px",
      color: "#10b981",
      fontStyle: "bold",
    });
    this.scoreText.setDepth(100);

    this.levelText = this.add.text(width - 16, 16, "Level: 1", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "18px",
      color: "#f59e0b",
      fontStyle: "bold",
      align: "right",
    });
    this.levelText.setOrigin(1, 0);
    this.levelText.setDepth(100);

    const highscore = parseInt(localStorage.getItem("barrelJumpHighscore") || "0");
    this.highscoreText = this.add.text(width / 2, 16, `Highscore: ${highscore}`, {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontSize: "16px",
      color: "#9ca3af",
      align: "center",
    });
    this.highscoreText.setOrigin(0.5, 0);
    this.highscoreText.setDepth(100);

    // Spawn obstacles jevnlig
    this.spawnTimer = this.time.addEvent({
      delay: this.baseSpawnDelay,
      loop: true,
      callback: () => this.spawnObstacle(),
    });
  }

  update(_time: number, delta: number) {
    if (!this.gameActive) return;

    // Score øker over tid
    this.score += delta * 0.01;
    const level = Math.floor(this.score / 250) + 1;

    // Level aumenta
    if (level !== this.level) {
      this.level = level;
      this.levelText.setText(`Level: ${this.level}`);
      // Spawn dragon på level 2
      if (this.level === 2 && !this.dragonSpawnTimer) {
        this.spawnDragon();
        this.dragonSpawnTimer = this.time.addEvent({
          delay: 6000,
          loop: true,
          callback: () => this.spawnDragon(),
        });
      }
    }

    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);

    // Flytt obstacles
    this.obstacles.children.iterate((child) => {
      if (!child) return true;
      const obstacle = child as Phaser.Physics.Arcade.Sprite;
      const speed = 300 + (this.level - 1) * 30; // Vanskelighetsgrad øker
      obstacle.x -= speed * (delta / 1000);

      if (obstacle.x < -100) {
        obstacle.destroy();
      }
      return true;
    });

    // Flytt dragons
    this.dragons.children.iterate((child) => {
      if (!child) return true;
      const dragon = child as any;
      const speed = 250 + (this.level - 1) * 20;
      dragon.x -= speed * (delta / 1000);

      if (dragon.x < -150) {
        dragon.destroy();
      }
      return true;
    });

    // Update particles
    this.particles.children.iterate((child) => {
      if (!child) return true;
      const particle = child as any;
      if (particle.life) {
        particle.life -= delta / 1000;
        if (particle.life <= 0) {
          particle.destroy();
        } else {
          particle.alpha = Math.max(0, particle.life);
        }
      }
      return true;
    });

    // Update fire particles
    this.fireParticles.children.iterate((child) => {
      if (!child) return true;
      const fire = child as any;
      fire.life -= delta / 1000;
      if (fire.life <= 0) {
        fire.destroy();
      } else {
        fire.alpha = Math.max(0, fire.life * 0.7);
      }
      return true;
    });
  }

  private spawnObstacle() {
    const { width, height } = this.scale;
    // Hvis dragon aktiv, spawn bare barrels (dragen er obstacle)
    if (this.level >= 2 && this.dragons.children.size > 0) return;

    const obstacleType = Phaser.Math.RND.pick([0, 0, 0, 1]); // 75% barrels, 25% boxes

    if (obstacleType === 0) {
      this.spawnBarrel();
    } else {
      this.spawnBox();
    }
  }

  private spawnBarrel() {
    const { width, height } = this.scale;

    const barrelKey = "barrel";
    if (!this.textures.exists(barrelKey)) {
      const g = this.add.graphics();
      g.fillStyle(0xf59e0b, 1);
      g.fillRoundedRect(0, 0, 44, 44, 8);
      g.lineStyle(3, 0xd97706, 1);
      g.strokeRoundedRect(0, 0, 44, 44, 8);
      // Lines for barrel effect
      g.lineStyle(1, 0xb45309, 1);
      g.lineBetween(5, 22, 39, 22);
      g.generateTexture(barrelKey, 44, 44);
      g.destroy();
    }

    const x = width + 80;
    const y = height - 40 - 22;

    const barrel = this.physics.add.sprite(x, y, barrelKey);
    barrel.setImmovable(true);
    barrel.body.allowGravity = false;
    barrel.setData("type", "barrel");

    this.obstacles.add(barrel);
  }

  private spawnBox() {
    const { width, height } = this.scale;

    const boxKey = "box";
    if (!this.textures.exists(boxKey)) {
      const g = this.add.graphics();
      g.fillStyle(0x6366f1, 1);
      g.fillRoundedRect(0, 0, 48, 48, 6);
      g.lineStyle(2, 0x4f46e5, 1);
      g.strokeRoundedRect(0, 0, 48, 48, 6);
      g.generateTexture(boxKey, 48, 48);
      g.destroy();
    }

    const x = width + 80;
    const y = height - 40 - 24;

    const box = this.physics.add.sprite(x, y, boxKey);
    box.setImmovable(true);
    box.body.allowGravity = false;
    box.setData("type", "box");

    this.obstacles.add(box);
  }

  private spawnDragon() {
    const { width, height } = this.scale;

    const dragonKey = "dragon";
    if (!this.textures.exists(dragonKey)) {
      const g = this.add.graphics();
      // Større dragon!
      // Dragon body - rød/oransje
      g.fillStyle(0xdc2626, 1);
      g.fillRoundedRect(0, 40, 140, 100, 20);
      // Dragon head
      g.fillStyle(0xea580c, 1);
      g.fillCircle(145, 80, 40);
      // Dragon snout (mouth opening)
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(180, 75, 12);
      // Dragon horns
      g.lineStyle(6, 0xdc2626, 1);
      g.lineBetween(150, 35, 170, 10);
      g.lineBetween(140, 30, 120, 5);
      // Dragon spikes down the back
      g.fillStyle(0x991b1b, 1);
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(20 + i * 25, 40);
        g.lineTo(15 + i * 25, 15);
        g.lineTo(25 + i * 25, 40);
        g.closePath();
        g.fillPath();
      }
      // Eyes
      g.fillStyle(0xfbf97d, 1);
      g.fillCircle(155, 70, 8);
      g.fillStyle(0x000, 1);
      g.fillCircle(155, 70, 4);
      // Wings (bigger)
      g.lineStyle(4, 0xdc2626, 1);
      g.lineBetween(50, 45, 10, 0);
      g.lineBetween(50, 45, 90, 0);
      g.generateTexture(dragonKey, 200, 160);
      g.destroy();
    }

    const x = width + 150;
    const y = height - 40 - 80;

    const dragon = this.physics.add.sprite(x, y, dragonKey);
    dragon.setScale(0.9); // Litt skalering hvis nødvendig
    dragon.setImmovable(true);
    dragon.body.allowGravity = false;
    dragon.setData("type", "dragon");
    dragon.setData("health", 3); // 3 hits to defeat
    dragon.setData("fireTimer", 0);

    this.dragons.add(dragon);

    // Start fire breathing
    this.scheduleFireBreath(dragon);
  }

  private scheduleFireBreath(dragon: any) {
    let fireCounter = 0;
    const fireInterval = setInterval(() => {
      if (!dragon.active) {
        clearInterval(fireInterval);
        return;
      }
      this.spawnFire(dragon);
      fireCounter++;
      // 3 flame bursts, then pause
      if (fireCounter >= 3) {
        fireCounter = 0;
      }
    }, 300);
  }

  private spawnFire(dragon: any) {
    // Spawn fire particles from dragon's mouth
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8; // Downward spread
      const speed = 280 + Math.random() * 220;

      const fireKey = "fireParticle";
      if (!this.textures.exists(fireKey)) {
        const g = this.add.graphics();
        g.fillStyle(0xfbbf24, 1);
        g.fillCircle(6, 6, 6);
        g.generateTexture(fireKey, 12, 12);
        g.destroy();
      }

      const fire = this.physics.add.sprite(dragon.x - 40, dragon.y + 30, fireKey);
      fire.setVelocity(Math.cos(angle) * speed - 150, Math.sin(angle) * speed);
      fire.setData("life", 0.8);
      fire.setTint(0xfbbf24);
      this.fireParticles.add(fire);
    }
  }

  private damageDragon(dragon: any) {
    // Sjekk at spilleren hopper ned på den
    if (this.player.body.velocity.y <= 0) return; // Må hoppe ned

    const health = dragon.getData("health") || 3;
    const newHealth = health - 1;

    if (newHealth <= 0) {
      // Dragon defeated!
      this.createDustParticles(dragon.x, dragon.y);
      for (let i = 0; i < 3; i++) {
        this.createDustParticles(dragon.x + (Math.random() - 0.5) * 40, dragon.y - 20);
      }
      this.score += 50; // Bonus for defeating dragon
      dragon.destroy();
    } else {
      // Dragon takes damage
      dragon.setData("health", newHealth);
      this.createDustParticles(dragon.x, dragon.y);
      // Slight knockback
      dragon.x -= 30;
    }
  }

  private createDustParticles(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const vx = Math.cos(angle) * 150;
      const vy = Math.sin(angle) * 150 - 100;

      const dustKey = "dustParticle";
      if (!this.textures.exists(dustKey)) {
        const g = this.add.graphics();
        g.fillStyle(0x6b7280, 0.8);
        g.fillCircle(3, 3, 3);
        g.generateTexture(dustKey, 6, 6);
        g.destroy();
      }

      const particle = this.physics.add.sprite(x, y, dustKey);
      particle.setVelocity(vx, vy);
      particle.setData("life", 0.6);
      this.particles.add(particle);
    }
  }

  private gameOver() {
    this.gameActive = false;
    this.spawnTimer?.remove(false);
    this.physics.pause();

    const { width, height } = this.scale;
    const currentScore = Math.floor(this.score);
    const highscore = parseInt(localStorage.getItem("barrelJumpHighscore") || "0");
    const isNewHighscore = currentScore > highscore;

    if (isNewHighscore) {
      localStorage.setItem("barrelJumpHighscore", String(currentScore));
    }

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    overlay.setDepth(200);

    this.add
      .text(width / 2, height / 2 - 60, "GAME OVER", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontSize: "48px",
        color: "#fca5a5",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(201);

    this.add
      .text(width / 2, height / 2 - 5, `Score: ${currentScore}`, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontSize: "24px",
        color: "#e5e7eb",
      })
      .setOrigin(0.5)
      .setDepth(201);

    if (isNewHighscore) {
      this.add
        .text(width / 2, height / 2 + 30, "🏆 New Highscore!", {
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
          fontSize: "20px",
          color: "#fbbf24",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(201);
    }

    this.add
      .text(width / 2, height / 2 + 70, "Press R to restart", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontSize: "16px",
        color: "#9ca3af",
      })
      .setOrigin(0.5)
      .setDepth(201);

    this.input.keyboard?.once("keydown-R", () => {
      this.scene.restart();
    });
  }
}

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (gameRef.current) return; // unngå dobbel init i dev/hot reload

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 900,
      height: 500,
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scene: RunnerScene,
      backgroundColor: "#0b1020",
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "24px 12px",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: 900,
          height: 500,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}

