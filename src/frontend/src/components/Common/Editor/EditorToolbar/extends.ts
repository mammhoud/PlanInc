import { PlanIncStore } from "@/store/planincStore"
import { RootStore } from "@/store/root"

export const Extend: IHintExtend[] = [{
  key: '#',
  hint(value: string) {
    const planinc = RootStore.Get(PlanIncStore)
    return planinc.tagList?.value?.pathTags.filter(i =>
      i.toLowerCase().includes(value.toLowerCase().replace("#", ''))
    ).map(i => {
      return {
        html: `<span class="planinc-tag-hint">#${i}</span>`,
        value:`#${i}&nbsp;`
      }
    }) ?? []
  }
}]

export const AIExtend: IHintExtend[] = [{
  key: '@',
  hint() {
    return [{
      html: `<span class="planinc-tag-hint">PlanInc AI</span>`,
      value: `@PlanInc AI&nbsp;`
    }]
  }
}]
