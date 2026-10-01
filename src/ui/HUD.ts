export type HUDState = { score: number; flips: number; twists: number; lastTrick: string; bestScore: number };

export class HUD {
  private readonly root = document.createElement('div');
  private readonly values: Record<string, HTMLElement> = {};
  private readonly abort = new AbortController();

  constructor(actions: { resume: () => void; restart: () => void }) {
    this.root.className = 'hud';
    this.root.innerHTML = `
      <dl class="scoreboard" aria-label="HUD">
        <div><dt>Score</dt><dd data-value="score">0</dd></div>
        <div><dt>Flips</dt><dd data-value="flips">0</dd></div>
        <div><dt>Twists</dt><dd data-value="twists">0</dd></div>
        <div class="last-trick"><dt>Last Trick</dt><dd data-value="lastTrick">—</dd></div>
        <div><dt>Best Score</dt><dd data-value="bestScore">0</dd></div>
      </dl>
      <div class="pause-overlay" hidden role="dialog" aria-modal="true" aria-label="Pause">
        <section class="menu-card"><h2>PAUSE</h2><button data-action="resume">RESUME</button><button data-action="restart">RESTART</button></section>
      </div>`;
    document.querySelector('#ui')!.append(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-value]').forEach(el => { this.values[el.dataset.value!] = el; });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (button?.dataset.action === 'resume') actions.resume();
      if (button?.dataset.action === 'restart') actions.restart();
      button?.blur();
    }, { signal: this.abort.signal });
  }

  update(state: HUDState): void {
    for (const key of Object.keys(state) as (keyof HUDState)[]) {
      const value = String(state[key]);
      if (this.values[key].textContent !== value) this.values[key].textContent = value;
    }
  }

  setPaused(paused: boolean): void {
    this.root.querySelector<HTMLElement>('.pause-overlay')!.hidden = !paused;
    if (paused) this.root.querySelector<HTMLButtonElement>('[data-action="resume"]')!.focus();
  }

  destroy(): void { this.abort.abort(); this.root.remove(); }
}
