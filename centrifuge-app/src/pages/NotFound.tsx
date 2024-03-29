import { Stack, Text } from '@centrifuge/fabric'
import * as React from 'react'
import { useLocation } from 'react-router'
import { LayoutBase } from '../components/LayoutBase'
import { PageHeader } from '../components/PageHeader'
import { RouterLinkButton } from '../components/RouterLinkButton'

export default function NotFoundPag() {
  return (
    <LayoutBase>
      <Pools />
    </LayoutBase>
  )
}

const Pools: React.FC = () => {
  const location = useLocation()

  return (
    <Stack gap={8} flex={1}>
      <PageHeader title="Page not found" />
      <Stack alignItems="center" gap="4">
        <Text variant="label1">The page {location.pathname} does not exist</Text>
        <RouterLinkButton variant="secondary" to="/">
          Go to the home page
        </RouterLinkButton>
      </Stack>
    </Stack>
  )
}
