class Time {
  // it may be a long time between timesteps if the browser
  // tab is suspended or something; don't freak out!.
  private static MAX_DELTA = 1;
  // prevent e.g. divide by zeroes
  private static MIN_DELTA = 0.01;
  private static _last = new Date().getTime() / 1000.0;
  private static _delta = 0.;
  private static _fpsIndex = 0;
  private static _fpsHistory = new Array(10).fill(0);

  static get delta() {
    return Time._delta;
  }

  static get last() {
    return Time._last;
  }

  static get now(): number {
    return new Date().getTime() / 1000.0;
  }

  static get fps(): number {
    return Math.round(Time._fpsHistory.reduce((a, b) => a + b, 0) / Time._fpsHistory.length);
  }

  static tick() {
    const now = Time.now;
    Time._delta = clamp(now - Time._last, Time.MIN_DELTA, Time.MAX_DELTA);
    Time._last = now;

    const fps = Math.round(Time._delta <= 0 ? 0 : 1.0 / Time._delta);
    Time._fpsHistory[Time._fpsIndex++] = fps;
  }
}

