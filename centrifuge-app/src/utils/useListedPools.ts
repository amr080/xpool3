import { PoolMetadata } from '@centrifuge/centrifuge-js'
import BN from 'bn.js'
import * as React from 'react'
import { useDebugFlags } from '../components/DebugFlags'
import { useMetadataMulti } from '../utils/useMetadata'
import { usePools } from '../utils/usePools'
import { useTinlakePools } from './tinlake/useTinlakePools'

const sign = (n: BN) => (n.isZero() ? 0 : n.isNeg() ? -1 : 1)

export function useListedPools() {
  const pools = usePools()
  const tinlakePools = useTinlakePools()
  const { showTinlakePools } = useDebugFlags()

  const poolMetas = useMetadataMulti<PoolMetadata>(pools?.map((p) => p.metadata) ?? [])

  const [listedPools, listedTokens] = React.useMemo(
    () => {
      const listedTinlakePools = showTinlakePools ? tinlakePools.data?.pools ?? [] : []
      const listedTinlakeTokens = listedTinlakePools.flatMap((p) => p.tranches)
      const listedPools = pools?.filter((_, i) => poolMetas[i]?.data?.pool?.listed) ?? []
      const listedTokens = listedPools.flatMap((p) => p.tranches)

      return [
        [...listedPools, ...listedTinlakePools].sort((a, b) =>
          sign(b.tranches.at(-1)!.capacity.sub(a.tranches.at(-1)!.capacity))
        ),
        [...listedTokens, ...listedTinlakeTokens].sort((a, b) => sign(b.capacity.sub(a.capacity))),
      ]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...poolMetas.map((q) => q.data), tinlakePools]
  )

  const isLoading = tinlakePools.isLoading || poolMetas.some((q) => q.isLoading)

  return [listedPools, listedTokens, isLoading] as const
}