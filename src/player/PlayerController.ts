import Phaser from 'phaser';
import type { Pose } from './Gymnast';

export class PlayerController {
  private readonly keys: Record<'left' | 'right' | 'raise' | 'tuck' | 'twist' | 'release' | 'restart' | 'pause', Phaser.Input.Keyboard.Key>;
  private readonly abort = new AbortController();
  private readonly pending = new Set<'release' | 'restart' | 'pause'>();

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys({
      left: 'A', right: 'D', raise: 'W', tuck: 'L', twist: 'K', release: 'SPACE', restart: 'R', pause: 'ESC',
    }) as typeof this.keys;
    for (const action of ['release', 'restart', 'pause'] as const) {
      this.keys[action].on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
        if (!event.repeat) this.pending.add(action);
      });
    }
    // Avoid sticky input after task switching or focusing a UI button.
    window.addEventListener('blur', () => this.reset(), { signal: this.abort.signal });
  }

  get direction(): number { return Number(this.keys.right.isDown) - Number(this.keys.left.isDown); }
  get pose(): Pose { return this.keys.tuck.isDown ? 'tuck' : this.keys.raise.isDown ? 'raise' : 'neutral'; }
  get twist(): boolean { return this.keys.twist.isDown; }
  // Latch down events: a quick press/release between frames must not be lost.
  releasePressed(): boolean { return this.pending.delete('release'); }
  restartPressed(): boolean { return this.pending.delete('restart'); }
  pausePressed(): boolean { return this.pending.delete('pause'); }
  reset(): void { this.pending.clear(); for (const key of Object.values(this.keys)) key.reset(); }
  destroy(): void { this.abort.abort(); for (const key of Object.values(this.keys)) key.destroy(); }
}
