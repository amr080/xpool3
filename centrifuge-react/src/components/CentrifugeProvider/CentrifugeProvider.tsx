import Centrifuge, { CurrencyBalance } from '@centrifuge/centrifuge-js'
import type { UserProvidedConfig } from '@centrifuge/centrifuge-js/dist/CentrifugeBase'
import { ApiRx } from '@polkadot/api'
import * as React from 'react'
import { useQuery } from 'react-query'

export const CentrifugeContext = React.createContext<{ centrifuge: Centrifuge; key: string }>({} as any)

export type CentrifugeProviderProps = {
  children: React.ReactNode
  config?: UserProvidedConfig
}

export function CentrifugeProvider({ children, config }: CentrifugeProviderProps) {
  const ctx = React.useMemo(() => ({ centrifuge: new Centrifuge(config), key: JSON.stringify(config) }), [config])

  return <CentrifugeContext.Provider value={ctx}>{children}</CentrifugeContext.Provider>
}

export function useCentrifuge() {
  const ctx = React.useContext(CentrifugeContext)
  if (!ctx) throw new Error('useCentrifuge must be used within Provider')
  return ctx.centrifuge
}

export function useCentrifugeKey() {
  const ctx = React.useContext(CentrifugeContext)
  if (!ctx) throw new Error('useCentrifugeKey must be used within Provider')
  return ctx.key
}

export function useCentrifugeApi(): ApiRx {
  const cent = useCentrifuge()
  const centKey = useCentrifugeKey()

  const { data: api } = useQuery(['centApi', centKey], () => cent.getApiPromise(), {
    suspense: true,
    staleTime: Infinity,
  })

  // @ts-ignore type mismatch
  return api!
}

export function useCentrifugeConsts() {
  const api = useCentrifugeApi()
  const consts = api.consts as any

  const chainDecimals = api.registry.chainDecimals[0]

  return {
    chainDecimals,
    chainToken: api.registry.chainTokens[0],
    ss58Prefix: consts.system.ss58Prefix.toNumber(),
    proxy: {
      proxyDepositBase: new CurrencyBalance(consts.proxy.proxyDepositBase, chainDecimals),
      proxyDepositFactor: new CurrencyBalance(consts.proxy.proxyDepositFactor, chainDecimals),
    },
    uniques: {
      collectionDeposit: new CurrencyBalance(consts.uniques.collectionDeposit, chainDecimals),
      itemDeposit: new CurrencyBalance(consts.uniques.itemDeposit, chainDecimals),
      metadataDepositBase: new CurrencyBalance(consts.uniques.metadataDepositBase, chainDecimals),
      attributeDepositBase: new CurrencyBalance(consts.uniques.attributeDepositBase, chainDecimals),
      depositPerByte: new CurrencyBalance(consts.uniques.depositPerByte, chainDecimals),
    },
    poolSystem: {
      poolDeposit: new CurrencyBalance(consts.poolSystem.poolDeposit, chainDecimals),
    },
    keystore: {
      keyDeposit: CurrencyBalance.fromFloat(100, chainDecimals),
    },
    identity: {
      basicDeposit: new CurrencyBalance(consts.identity.basicDeposit, chainDecimals),
      fieldDeposit: new CurrencyBalance(consts.identity.fieldDeposit, chainDecimals),
    },
  }
}
