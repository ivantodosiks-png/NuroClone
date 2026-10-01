import Phaser from 'phaser';
import { GameScene } from './GameScene';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create(): void {
    if (!this.scene.isActive('GameScene')) this.scene.launch('GameScene');
    this.scene.bringToTop();
    const root = document.createElement('div');
    root.className = 'menu';
    root.innerHTML = `
      <section class="menu-card">
        <h1>NUROCLONE</h1>
        <div data-panel="main">
          <button data-action="play">PLAY</button>
          <button data-action="controls">CONTROLS</button>
        </div>
        <div data-panel="controls" hidden>
          <dl class="controls-list">
            <div><dt>W</dt><dd>поднять ноги</dd></div>
            <div><dt>A / D</dt><dd>вращение</dd></div>
            <div><dt>L</dt><dd>группировка</dd></div>
            <div><dt>K</dt><dd>twist</dd></div>
            <div><dt>SPACE</dt><dd>отпустить перекладину</dd></div>
            <div><dt>R</dt><dd>restart</dd></div>
            <div><dt>ESC</dt><dd>pause</dd></div>
          </dl>
          <button data-action="back">BACK</button>
        </div>
      </section>`;
    document.querySelector('#ui')!.append(root);
    const abort = new AbortController();
    root.addEventListener('click', event => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'play') {
        (this.scene.get('GameScene') as GameScene).beginTraining();
        this.scene.stop();
      } else if (action === 'controls' || action === 'back') {
        root.querySelector<HTMLElement>('[data-panel="main"]')!.hidden = action === 'controls';
        root.querySelector<HTMLElement>('[data-panel="controls"]')!.hidden = action !== 'controls';
        root.querySelector<HTMLButtonElement>(action === 'controls' ? '[data-action="back"]' : '[data-action="controls"]')!.focus();
      }
    }, { signal: abort.signal });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { abort.abort(); root.remove(); });
  }
}
