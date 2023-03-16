class Time {
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
    Time._delta = now - Time._last;
    Time._last = now;
  }
}
