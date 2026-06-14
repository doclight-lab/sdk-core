import type { DoclightEvent } from "./schema"

type DropPolicy = "drop_oldest" | "drop_newest"

export interface QueueStats {
  droppedQueueFull: number
}

export class EventQueue {
  private readonly items: DoclightEvent[] = []
  private readonly maxSize: number
  private readonly dropPolicy: DropPolicy
  readonly stats: QueueStats = { droppedQueueFull: 0 }

  constructor(maxSize: number, dropPolicy: DropPolicy) {
    this.maxSize = maxSize
    this.dropPolicy = dropPolicy
  }

  get length(): number {
    return this.items.length
  }

  enqueue(event: DoclightEvent): void {
    if (this.items.length < this.maxSize) {
      this.items.push(event)
      return
    }

    if (this.dropPolicy === "drop_oldest") {
      this.items.shift()
      this.items.push(event)
      this.stats.droppedQueueFull++
      return
    }

    this.stats.droppedQueueFull++
  }

  drain(max: number): DoclightEvent[] {
    return this.items.splice(0, Math.min(max, this.items.length))
  }
}
