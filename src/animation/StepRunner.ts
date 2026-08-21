import type { FieldController } from '../pixi/FieldController'
import type { ChoreographyStep } from '../domain/types'

/** Runs an ordered choreography: steps sharing a `group` play concurrently; groups sequence in ascending order. */
export class StepRunner {
  private field: FieldController

  constructor(field: FieldController) {
    this.field = field
  }

  async run(steps: ChoreographyStep[]): Promise<void> {
    const byGroup = new Map<number, ChoreographyStep[]>()
    for (const step of steps) {
      const list = byGroup.get(step.group)
      if (list) list.push(step)
      else byGroup.set(step.group, [step])
    }

    const groupKeys = [...byGroup.keys()].sort((a, b) => a - b)
    for (const key of groupKeys) {
      await Promise.all(byGroup.get(key)!.map((step) => this.runStep(step)))
    }
  }

  private runStep(step: ChoreographyStep): Promise<void> {
    switch (step.kind) {
      case 'ballFlight':
        return this.field.runBallFlight(step)
      case 'runnerMove':
        return this.field.runRunnerMove(step)
      case 'textPop':
        return this.field.showTextPop(step)
      case 'celebration':
        return this.field.runCelebration(step)
      case 'fielderMove':
        return this.field.runFielderMove(step)
    }
  }
}
