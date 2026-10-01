import Phaser from 'phaser';
import { brand, icon } from '../ui/icons';
import { GameScene } from './GameScene';

export class MenuScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  constructor() { super('MenuScene'); }

  create(): void {
    if (!this.scene.isActive('GameScene')) this.scene.launch('GameScene');
    this.scene.bringToTop();
    const root = document.createElement('div');
    this.root = root;
    root.className = 'menu';
    root.innerHTML = `
      <header class="topbar"><div class="brand">${brand}</div><div class="session-label"><span class="status-dot"></span> ЛАБОРАТОРИЯ ДВИЖЕНИЯ <span class="separator">/</span> <b>01</b></div><span class="menu-build">PHYSICS PLAYGROUND</span></header>
      <section class="menu-content"><div class="eyebrow"><span class="tiny-line"></span> МЕНЬШЕ ПРАВИЛ. БОЛЬШЕ ДВИЖЕНИЯ.</div><h1>Поймай<br>свой <em>импульс.</em></h1><p>Познакомься с Nuro.<br>Немного гимнастики, немного гравитации.<br>И полная свобода экспериментировать.</p><button class="primary-button" id="start-training">Начать тренировку ${icon('arrow')}</button><div class="menu-start-hint"><kbd>ENTER</kbd><span>или нажми, чтобы начать</span></div><div class="menu-tags"><span><i></i> Физическое тело</span><span><i></i> Живое движение</span></div></section>
      <div class="nuro-tag"><span class="tag-line"></span><div>NURO <span>ТВОЙ ВНУТРЕННИЙ ГИМНАСТ</span></div></div>
      <div class="menu-bottom"><div><span class="eyebrow">ТВОЯ ПЕРВАЯ ТРЕНИРОВКА</span><h3><span>01</span> Знакомство с перекладиной ${icon('arrow')}</h3></div><span class="menu-device">ДЛЯ КЛАВИАТУРЫ <span class="keyboard-symbol">⌨</span><small>A / D &nbsp; W / S &nbsp; SPACE</small></span></div>
      <footer class="menu-footer"><span>ДОВЕРЬСЯ ФИЗИКЕ. НАЙДИ СВОЙ РИТМ.</span><span>NUROCLONE <b>·</b> TRAINING BUILD 01</span></footer>`;
    document.querySelector('#ui')!.append(root);
    const start = () => {
      (this.scene.get('GameScene') as GameScene).beginTraining();
      this.scene.stop();
    };
    root.querySelector('button')!.addEventListener('click', start, { once: true });
    this.input.keyboard!.once('keydown-ENTER', start);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.root?.remove();
      this.root = undefined;
      this.input.keyboard?.off('keydown-ENTER', start);
    });
  }
}
