import { wrapAngle } from '../physics/matter';

const TURN = Math.PI * 2;

/** Counts completed rotations during one flight; tiny oscillations never add up. */
export class TrickTracker {
  score = 0;
  bestScore = 0;
  flips = 0;
  twists = 0;
  lastTrick = '—';
  airborne = false;
  outcome: 'none' | 'landing' | 'crash' | 'regrab' = 'none';
  private previousAngle = 0;
  private startTwist = 0;
  private flipAngle = 0;
  private pending = 0;

  constructor() {
    try {
      const value = Number(localStorage.getItem('nuroclone.best'));
      if (Number.isFinite(value) && value > 0) this.bestScore = Math.floor(value);
    } catch { /* Best score still works in memory if storage is unavailable. */ }
  }

  release(angle: number, twistAngle: number): void {
    this.airborne = true;
    this.outcome = 'none';
    this.flips = 0;
    this.twists = 0;
    this.flipAngle = 0;
    this.pending = 0;
    this.previousAngle = angle;
    this.startTwist = twistAngle;
  }

  step(angle: number, twistAngle: number): void {
    if (!this.airborne) return;
    this.flipAngle += wrapAngle(angle - this.previousAngle);
    this.previousAngle = angle;
    const flips = Math.floor(Math.abs(this.flipAngle) / TURN);
    const twists = Math.floor(Math.abs(twistAngle - this.startTwist) / TURN);
    if (flips <= this.flips && twists <= this.twists) return;
    this.flips = Math.max(this.flips, flips);
    this.twists = Math.max(this.twists, twists);
    this.pending = this.flips * 100 + this.twists * 150 + (this.flips && this.twists ? 150 : 0);
    this.lastTrick = this.flips && this.twists ? 'Flip + Twist'
      : this.twists >= 2 ? 'Double Twist' : this.twists === 1 ? 'Twist'
        : this.flips >= 3 ? 'Triple Flip' : this.flips === 2 ? 'Double Flip'
          : this.flipAngle < 0 ? 'Front Flip' : 'Back Flip';
  }

  finish(result: 'landing' | 'crash' | 'regrab'): void {
    if (!this.airborne) return;
    this.airborne = false;
    this.outcome = result;
    if (result === 'crash') this.lastTrick = 'Crash';
    else {
      this.score += this.pending + (result === 'regrab' ? 75 : 50);
      if (result === 'regrab') this.lastTrick = 'Regrab';
      else this.lastTrick = this.pending ? `${this.lastTrick} · Successful landing` : 'Successful landing';
      this.bestScore = Math.max(this.bestScore, this.score);
      try { localStorage.setItem('nuroclone.best', String(this.bestScore)); } catch { /* Optional local persistence. */ }
    }
    this.pending = 0;
  }

  reset(): void {
    this.score = 0;
    this.flips = 0;
    this.twists = 0;
    this.lastTrick = '—';
    this.airborne = false;
    this.outcome = 'none';
    this.pending = 0;
  }
}
