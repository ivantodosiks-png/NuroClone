import Phaser from 'phaser';
import { COLORS, PHYSICS } from './config/constants';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import '@fontsource-variable/golos-text';
import './ui/styles.css';

const game = new Phaser.Game({
  // This vector-only scene is inexpensive in Canvas and needs no GPU/WebGL.
  type: Phaser.CANVAS,
  parent: 'game',
  backgroundColor: COLORS.background,
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: PHYSICS.gravity },
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 8,
    },
  },
  scene: [MenuScene, GameScene],
  input: { keyboard: true },
  render: { powerPreference: 'high-performance' },
});

// A read-only development inspection hook used by browser integration tests.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__NURO__', {
    configurable: true,
    value: { snapshot: () => (game.scene.getScene('GameScene') as GameScene).snapshot() },
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
