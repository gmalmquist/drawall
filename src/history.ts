type HistoryItem = ProjectJson;

class ProjectHistory {
  private static readonly MAX_LENGTH = 10;
  public readonly canUndo = Refs.of<boolean>(false);
  public readonly canRedo = Refs.of<boolean>(false);
  private history: Array<HistoryItem> = [];
  private index: number = 0;
  private suspended: number = 0;

  public undo() {
    this.go(clamp(this.index - 1, 0, this.history.length - 1));
  }

  public redo() {
    this.go(clamp(this.index + 1, 0, this.history.length - 1));
  }

  public push() {
    if (this.isSuspended) return;
    this.history = this.history.filter((_, i) => i <= this.index);
    this.history.push(App.project.serialize());
    this.pruneHistory();
    this.index = this.history.length - 1;
    this.updateCans();
    App.log(`history.push(): ${this.index} of ${this.history.length}`);
  }

  public suspend() {
    this.suspended++;
  }

  public resume() {
    this.suspended--;
  }

  public suspendWhile<R>(action: () => R): R {
    this.suspend();
    try {
      return action();
    } finally {
      this.resume();
    }
  }

  public get isSuspended() {
    return this.suspended > 0;
  }

  private pruneHistory() {
    const prune = Math.max(0, this.history.length - ProjectHistory.MAX_LENGTH);
    this.history = this.history.filter((_, i) => i >= prune);
    this.index -= prune;
  }

  private updateCans() {
    this.canUndo.set(this.index <= this.history.length && this.index > 0);
    this.canRedo.set(this.index < this.history.length - 1);
  }

  private go(index: number): boolean {
    App.log(`history(${index}) of ${this.history.length} ${this.isSuspended ? 'suspended' : ''}`);
    return this.suspendWhile(() => {
      if (index < 0 || index >= this.history.length) {
        return false;
      }
      const item = this.history[index];
      App.project.loadJson(item as unknown as JsonObject);
      this.index = index;
      this.updateCans();
      return true;
    });
  }
}

