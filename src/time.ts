class Time {
  // it may be a long time between timesteps if the browser
  // tab is suspended or something; don't freak out!.
  private static MAX_DELTA = 1;
  // prevent e.g. divide by zeroes
  private static MIN_DELTA = 0.01;
  private static _last = Time.now();
  private static _delta = 0.;

  static get delta() {
    return Time._delta;
  }

  static get last() {
    return Time._last;
  }

  static now(): number {
    return new Date().getTime() / 1000.0;
  }

  static tick() {
    const now = Time.now();
    Time._delta = clamp(now - Time._last, Time.MIN_DELTA, Time.MAX_DELTA);
    Time._last = now;
  }
}

