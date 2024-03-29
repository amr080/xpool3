import { useCentrifugeQuery } from '@centrifuge/centrifuge-react'

export function useNFTs(collectionId?: string) {
  const [result] = useCentrifugeQuery(['nfts', collectionId], (cent) => cent.nfts.getCollectionNfts([collectionId!]), {
    suspense: true,
    enabled: !!collectionId,
  })

  return result
}

export function useCentNFT(collectionId?: string | null, nftId?: string, suspense = true, isTinlakePool = false) {
  const [result] = useCentrifugeQuery(
    ['nft', collectionId, nftId],
    (cent) => cent.nfts.getNft([collectionId!, nftId!]),
    {
      suspense,
      enabled: !!collectionId && !!nftId && !isTinlakePool,
    }
  )

  return result
}

export function useAccountNfts(address?: string, suspense = true) {
  const [result] = useCentrifugeQuery(['accountNfts', address], (cent) => cent.nfts.getAccountNfts([address!]), {
    suspense,
    enabled: !!address,
  })

  return result
}
