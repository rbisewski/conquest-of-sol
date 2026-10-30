/** Which ids were wanted most recently, so that the longest unwanted can be let go. */
export class Recency {
  /** The tick each id was last wanted at, the longest unwanted first. */
  private readonly stamps = new Map<string, number>();

  /** Marks an id wanted at this tick; true if it wasn't being kept. */
  touch(id: string, tick: number): boolean {
    const fresh = !this.stamps.delete(id);
    this.stamps.set(id, tick);
    return fresh;
  }

  has(id: string): boolean {
    return this.stamps.has(id);
  }

  /** Lets go of the longest unwanted ids down to a limit, never one wanted at this tick; returns them. */
  evict(limit: number, tick: number): string[] {
    const gone: string[] = [];
    for (const [id, stamp] of this.stamps) {
      if (this.stamps.size <= limit || stamp === tick) break;
      this.stamps.delete(id);
      gone.push(id);
    }
    return gone;
  }

  /** Lets go of every id; returns them. */
  clear(): string[] {
    const gone = [...this.stamps.keys()];
    this.stamps.clear();
    return gone;
  }
}
