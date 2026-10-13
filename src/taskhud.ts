// The daily task as the raider sees it (dailytask.ts): a row under the
// season in the upper-right tracker (seen only as it flashes up), a pip lit for each shadowman burned
// today, Done once the day's reward is paid. Hidden played alone, where
// nothing is kept. Hud builds it; loop.ts feeds it the count for the
// valley's day, and valleysync.ts says the news.

import { copy } from './copy.ts'
import { DAILY_TASK } from './dailytask.ts'
import { el } from './dom.ts'

// What the row shows: today's count and whether the reward is paid, or
// nothing at all.
export interface TaskView {
  count: number
  done: boolean
}

export class TaskHud {
  row: HTMLElement
  private readonly pips: HTMLElement[]
  private readonly count: HTMLElement
  private shown = ''

  constructor(tracker: HTMLElement) {
    this.row = el('div', 'bv-task')
    this.row.hidden = true
    const head = el('p', 'bv-season-head')
    head.append(
      el('span', 'bv-season-kicker', copy('task.kicker')),
      ' ',
      el('b', 'bv-season-title', copy('task.title', { goal: DAILY_TASK.goal }))
    )
    const progress = el('p', 'bv-season-progress')
    const pipRow = el('span', 'bv-season-pips')
    pipRow.setAttribute('aria-hidden', 'true')
    this.pips = Array.from({ length: DAILY_TASK.goal }, () =>
      pipRow.appendChild(el('span', 'bv-season-pip'))
    )
    this.count = el('span', 'bv-task-count')
    progress.append(pipRow, this.count)
    this.row.append(head, progress)
    tracker.appendChild(this.row)
  }

  // Called every frame; the row is touched only when what it says changes.
  set(view: TaskView | null): void {
    const key = view ? `${view.count}:${view.done}` : ''
    if (key === this.shown) return
    this.shown = key
    this.row.hidden = view === null
    if (!view) return
    const goal = DAILY_TASK.goal
    this.count.textContent = view.done
      ? copy('task.complete')
      : copy('task.progress', { count: view.count, goal })
    this.pips.forEach((pip, i) =>
      pip.classList.toggle('bv-season-pip--lit', i < view.count)
    )
    this.row.classList.toggle('bv-task--done', view.done)
    this.row.setAttribute(
      'aria-label',
      copy('task.tracker_label', { count: view.count, goal })
    )
  }
}
