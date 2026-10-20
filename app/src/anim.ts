import type { Ticker } from "pixi.js";

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Anima da 0 a 1 in `ms` millisecondi, chiamando `step` a ogni frame. */
export function tween(ticker: Ticker, ms: number, step: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = () => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / ms);
      step(t);
      if (t >= 1) {
        ticker.remove(tick);
        resolve();
      }
    };
    ticker.add(tick);
  });
}

export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
