import { brand, icon } from './icons';
import type { Pose } from '../player/Gymnast';

export type HUDState = {
  fps: number; speed: number; angular: number; grabs: number; pose: Pose;
  canGrab: boolean; seeking: boolean; grounded: boolean; elapsed: number;
  maxSpeed: number; direction: number; progress: number;
};

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly abort = new AbortController();
  private lastUpdate = 0;
  private readonly values: Record<string, HTMLElement> = {};

  constructor(actions: { pause: () => void; resume: () => void; restart: () => void; menu: () => void }) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" aria-label="NuroClone — в меню">${brand}</a>
        <div class="session-label"><span class="status-dot"></span> ЛАБОРАТОРИЯ ДВИЖЕНИЯ <span class="separator">/</span> <b>01</b></div>
        <div class="top-actions"><span class="live-label">ТРЕНИРОВКА</span><button class="icon-button" data-action="expand" aria-label="Полный экран" title="Полный экран">${icon('expand')}</button><button class="icon-button" data-action="pause" aria-label="Пауза" title="Пауза · Esc">${icon('pause')}</button></div>
      </header>
      <aside class="lesson-panel">
        <div class="eyebrow"><span class="tiny-line"></span> СВОБОДНАЯ ПРАКТИКА</div>
        <h1>Поймай импульс<span>.</span></h1>
        <p>Твоё тело. Твоя инерция.<br>Всё начинается с одного движения.</p>
        <div class="lesson-steps">
          <div class="lesson-step" data-step="0"><span class="step-number">01</span><span>Раскачайся <small>A / D</small></span><i></i></div>
          <div class="lesson-step" data-step="1"><span class="step-number">02</span><span>Сгруппируйся <small>W</small></span><i></i></div>
          <div class="lesson-step" data-step="2"><span class="step-number">03</span><span>Отпусти и лети <small>SPACE</small></span><i></i></div>
        </div>
        <div class="practice-complete" data-value="complete" hidden>Отличное начало. Продолжай экспериментировать ${icon('arrow')}</div>
      </aside>
      <aside class="telemetry" aria-label="Отладочная панель">
        <div class="telemetry-title"><span class="status-dot"></span> ТЕЛЕМЕТРИЯ <span>LIVE</span></div>
        <dl><div><dt>FPS</dt><dd data-value="fps">60</dd></div><div><dt>Скорость</dt><dd><span data-value="speed">0.0</span> <small>м/с</small></dd></div><div><dt>Угл. скорость</dt><dd><span data-value="angular">0.0</span> <small>рад/с</small></dd></div><div><dt>Активные хваты</dt><dd><span data-value="grabs">2</span><small> / 2</small></dd></div></dl>
        <div class="grip-dots"><i></i><i></i><span data-value="gripLabel">ДВЕ РУКИ НА ПЕРЕКЛАДИНЕ</span></div>
      </aside>
      <div class="bottom-ui">
        <div class="session-row"><span class="session-location"><span class="status-dot"></span> ЗАЛ 01 <span>/</span> ПЕРЕКЛАДИНА</span><div class="state-pill"><span data-value="pose">СВОБОДНАЯ ПОЗА</span><span class="pill-divider"></span><span data-value="status">НА ПЕРЕКЛАДИНЕ</span></div><span class="session-clock" data-value="clock">00:00</span></div>
        <nav class="controls" aria-label="Управление">
          <div class="control" data-control="swing"><div><kbd>A</kbd><kbd>D</kbd></div><span>Раскачиваться</span></div>
          <div class="control" data-control="tuck"><kbd>W</kbd><span>Группировка</span></div>
          <div class="control" data-control="arch"><kbd>S</kbd><span>Распрямиться</span></div>
          <div class="control control-space" data-control="grab"><kbd>SPACE</kbd><span>Отпустить / схватиться</span></div>
          <button class="control control-button" data-action="restart"><kbd>R</kbd><span>Заново</span></button>
          <button class="control control-button" data-action="pause"><kbd>ESC</kbd><span>Пауза</span></button>
        </nav>
        <div class="footer-note"><span>ДОВЕРЬСЯ ФИЗИКЕ. НАЙДИ СВОЙ РИТМ.</span><span>NUROCLONE <b>·</b> TRAINING BUILD 01</span></div>
      </div>
      <div class="pause-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <section class="pause-card"><div class="eyebrow">МОЖНО ВЫДОХНУТЬ</div><h2 id="pause-title">Момент покоя<span>.</span></h2><p>Твой импульс подождёт.</p><button class="primary-button" data-action="resume">Продолжить ${icon('play')}</button><button class="secondary-button" data-action="restart">${icon('restart')} Начать заново <kbd>R</kbd></button><button class="text-button" data-action="menu">Вернуться в меню</button><span class="pause-hint">ESC — вернуться к движению</span></section>
      </div>`;
    document.querySelector('#ui')!.append(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-value]').forEach(el => { this.values[el.dataset.value!] = el; });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      const action = button?.dataset.action;
      if (action === 'expand') {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
      } else if (action && action in actions) actions[action as keyof typeof actions]();
      button?.blur();
      if ((event.target as HTMLElement).closest('.brand')) { event.preventDefault(); actions.menu(); }
    }, { signal: this.abort.signal });
  }

  update(state: HUDState, now: number): void {
    if (now - this.lastUpdate < 90) return;
    this.lastUpdate = now;
    this.values.fps.textContent = String(Math.round(state.fps));
    this.values.speed.textContent = state.speed.toFixed(1);
    this.values.angular.textContent = state.angular.toFixed(1);
    this.values.grabs.textContent = String(state.grabs);
    this.values.gripLabel.textContent = state.grabs === 2 ? 'ДВЕ РУКИ НА ПЕРЕКЛАДИНЕ' : state.grabs === 1 ? 'ХВАТ ОДНОЙ РУКОЙ' : state.canGrab ? 'ПЕРЕКЛАДИНА В ЗОНЕ ХВАТА' : 'СВОБОДНЫЙ ПОЛЁТ';
    this.root.querySelectorAll('.grip-dots i').forEach((el, i) => el.classList.toggle('on', i < state.grabs));
    this.values.pose.textContent = state.pose === 'tuck' ? 'ГРУППИРОВКА' : state.pose === 'arch' ? 'РАСПРЯМЛЕНИЕ' : 'СВОБОДНАЯ ПОЗА';
    this.values.status.textContent = state.grabs ? 'НА ПЕРЕКЛАДИНЕ' : state.grounded ? 'НА МАТЕ · R ДЛЯ РЕСТАРТА' : state.seeking ? 'ЛОВИМ ПЕРЕКЛАДИНУ…' : state.canGrab ? 'SPACE — СХВАТИТЬСЯ' : 'В ПОЛЁТЕ';
    const seconds = Math.floor(state.elapsed / 1000);
    this.values.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.root.querySelector('[data-control="swing"]')!.classList.toggle('pressed', state.direction !== 0);
    this.root.querySelector('[data-control="tuck"]')!.classList.toggle('pressed', state.pose === 'tuck');
    this.root.querySelector('[data-control="arch"]')!.classList.toggle('pressed', state.pose === 'arch');
    this.root.querySelector('[data-control="grab"]')!.classList.toggle('available', state.canGrab && !state.grabs);
    this.root.querySelectorAll<HTMLElement>('[data-step]').forEach((el, i) => {
      el.classList.toggle('done', i < state.progress);
      el.classList.toggle('current', i === state.progress);
    });
    this.values.complete.hidden = state.progress < 3;
  }

  setPaused(paused: boolean): void {
    this.root.querySelector<HTMLElement>('.pause-overlay')!.hidden = !paused;
    for (const selector of ['.topbar', '.lesson-panel', '.telemetry', '.bottom-ui']) {
      this.root.querySelector<HTMLElement>(selector)!.inert = paused;
    }
    if (paused) this.root.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus();
  }

  destroy(): void { this.abort.abort(); this.root.remove(); }
}
