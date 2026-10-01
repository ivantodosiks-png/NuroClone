import Phaser from 'phaser';
import type { Pose } from './Gymnast';

export class PlayerController {
  private readonly keys: Record<'left' | 'right' | 'tuck' | 'arch' | 'grab' | 'restart' | 'pause', Phaser.Input.Keyboard.Key>;
  private readonly abort = new AbortController();
  private readonly pending = new Set<'grab' | 'restart' | 'pause'>();

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys({
      left: 'A', right: 'D', tuck: 'W', arch: 'S', grab: 'SPACE', restart: 'R', pause: 'ESC',
    }) as typeof this.keys;
    for (const action of ['grab', 'restart', 'pause'] as const) {
      this.keys[action].on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
        if (!event.repeat) this.pending.add(action);
      });
    }
    // Avoid sticky input after task switching or focusing a UI button.
    window.addEventListener('blur', () => this.reset(), { signal: this.abort.signal });
  }

  get direction(): number { return Number(this.keys.right.isDown) - Number(this.keys.left.isDown); }
  get pose(): Pose { return this.keys.tuck.isDown ? 'tuck' : this.keys.arch.isDown ? 'arch' : 'neutral'; }
  // Latch down events: a quick press/release between frames must not be lost.
  grabPressed(): boolean { return this.pending.delete('grab'); }
  restartPressed(): boolean { return this.pending.delete('restart'); }
  pausePressed(): boolean { return this.pending.delete('pause'); }
  reset(): void { this.pending.clear(); for (const key of Object.values(this.keys)) key.reset(); }
  destroy(): void { this.abort.abort(); for (const key of Object.values(this.keys)) key.destroy(); }
}
