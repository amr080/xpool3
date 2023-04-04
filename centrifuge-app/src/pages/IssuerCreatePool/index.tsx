import { CurrencyBalance, isSameAddress, Perquintill, Rate } from '@centrifuge/centrifuge-js'
import { CurrencyKey, PoolMetadataInput, TrancheInput } from '@centrifuge/centrifuge-js/dist/modules/pools'
import {
  useBalances,
  useCentrifuge,
  useCentrifugeConsts,
  useCentrifugeTransaction,
  useWallet,
} from '@centrifuge/centrifuge-react'
import {
  Box,
  Button,
  CurrencyInput,
  FileUpload,
  Grid,
  Select,
  Text,
  TextInput,
  TextWithPlaceholder,
  Thumbnail,
} from '@centrifuge/fabric'
import { createKeyMulti, sortAddresses } from '@polkadot/util-crypto'
import BN from 'bn.js'
import { Field, FieldProps, Form, FormikErrors, FormikProvider, setIn, useFormik } from 'formik'
import * as React from 'react'
import { useHistory } from 'react-router'
import { combineLatest, filter, lastValueFrom, switchMap } from 'rxjs'
import { PreimageHashDialog } from '../../components/Dialogs/PreimageHashDialog'
import { FieldWithErrorMessage } from '../../components/FieldWithErrorMessage'
import { PageHeader } from '../../components/PageHeader'
import { PageSection } from '../../components/PageSection'
import { PageWithSideBar } from '../../components/PageWithSideBar'
import { Tooltips } from '../../components/Tooltips'
import { config } from '../../config'
import { Dec } from '../../utils/Decimal'
import { formatBalance } from '../../utils/formatting'
import { getFileDataURI } from '../../utils/getFileDataURI'
import { useAddress } from '../../utils/useAddress'
import { useCreatePoolFee } from '../../utils/useCreatePoolFee'
import { usePoolCurrencies } from '../../utils/useCurrencies'
import { useFocusInvalidInput } from '../../utils/useFocusInvalidInput'
import { usePools } from '../../utils/usePools'
import { truncate } from '../../utils/web3'
import { PodConfig } from '../IssuerPool/Configuration/PodConfig'
import { AdminMultisigSection } from './AdminMultisig'
import { IssuerDetail } from './CustomDetails'
import { IssuerInput } from './IssuerInput'
import { TrancheSection } from './TrancheInput'
import { useStoredIssuer } from './useStoredIssuer'
import { validate } from './validate'

const ASSET_CLASSES = config.assetClasses.map((label) => ({
  label,
  value: label,
}))
const DEFAULT_ASSET_CLASS = config.defaultAssetClass

export const IssuerCreatePoolPage: React.FC = () => {
  return (
    <PageWithSideBar>
      <CreatePoolForm />
    </PageWithSideBar>
  )
}

export interface Tranche {
  tokenName: string
  symbolName: string
  interestRate: number | ''
  minRiskBuffer: number | ''
  minInvestment: number | ''
}
export interface WriteOffGroupInput {
  days: number | ''
  writeOff: number | ''
  penaltyInterest: number | ''
}

export const createEmptyTranche = (junior?: boolean): Tranche => ({
  tokenName: 'Junior',
  symbolName: 'TPP1JUN',
  interestRate: junior ? '' : 0,
  minRiskBuffer: junior ? '' : 0,
  minInvestment: 0,
})

export type CreatePoolValues = Omit<
  PoolMetadataInput,
  'poolIcon' | 'issuerLogo' | 'executiveSummary' | 'adminMultisig'
> & {
  poolIcon: File | null
  issuerLogo: File | null
  executiveSummary: File | null
  details: IssuerDetail[]
  adminMultisigEnabled: boolean
  adminMultisig: Exclude<PoolMetadataInput['adminMultisig'], undefined>
}

const initialValues: CreatePoolValues = {
  poolIcon: null,
  poolName: 'Test Proxy Pool 3',
  assetClass: DEFAULT_ASSET_CLASS,
  currency: 'AUSD',
  maxReserve: 10000,
  epochHours: 23, // in hours
  epochMinutes: 50, // in minutes
  podEndpoint: config.defaultPodUrl ?? '',
  listed: !import.meta.env.REACT_APP_DEFAULT_UNLIST_NEW_POOLS,

  issuerName: '',
  issuerLogo: null,
  issuerDescription: '',

  executiveSummary: null,
  website: '',
  forum: '',
  email: 'onno+spam@k-f.co',
  details: [],

  tranches: [createEmptyTranche(true)],
  adminMultisig: {
    signers: [''],
    threshold: 1,
  },
  adminMultisigEnabled: false,
}

const PoolIcon: React.FC<{ icon?: File | null; children: string }> = ({ children, icon }) => {
  const [uri, setUri] = React.useState('')
  React.useEffect(() => {
    ;(async () => {
      if (!icon) return
      const uri = await getFileDataURI(icon)
      setUri(uri)
    })()
  }, [icon])
  return uri ? <img src={uri} width={40} height={40} alt="" /> : <Thumbnail label={children} type="pool" size="large" />
}

function CreatePoolForm() {
  const address = useAddress('substrate')
  const {
    substrate: { addMultisig },
  } = useWallet()
  const centrifuge = useCentrifuge()
  const currencies = usePoolCurrencies()
  const { chainDecimals } = useCentrifugeConsts()
  const pools = usePools()
  const history = useHistory()
  const balances = useBalances(address)
  const { data: storedIssuer, isLoading: isStoredIssuerLoading } = useStoredIssuer()
  const [waitingForStoredIssuer, setWaitingForStoredIssuer] = React.useState(true)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [preimageHash, setPreimageHash] = React.useState('')
  const [createdPoolId, setCreatedPoolId] = React.useState('')

  React.useEffect(() => {
    // If the hash can't be found on Pinata the request can take a long time to time out
    // During which the name/description can't be edited
    // Set a deadline for how long we're willing to wait on a stored issuer
    setTimeout(() => setWaitingForStoredIssuer(false), 10000)
  }, [])

  React.useEffect(() => {
    if (storedIssuer) setWaitingForStoredIssuer(false)
  }, [storedIssuer])

  React.useEffect(() => {
    if (createdPoolId && pools?.find((p) => p.id === createdPoolId)) {
      // Redirecting only when we find the newly created pool in the data from usePools
      // Otherwise the Issue Overview page will throw an error when it can't find the pool
      // It can take a second for the new data to come in after creating the pool
      history.push(`/issuer/${createdPoolId}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools, createdPoolId])

  const txMessage = {
    immediate: 'Create pool',
    propose: 'Submit pool proposal',
    notePreimage: 'Note preimage',
  }
  const { execute: createPoolTx, isLoading: transactionIsPending } = useCentrifugeTransaction(
    `${txMessage[config.poolCreationType || 'immediate']} 2/2`,
    (cent) =>
      (
        args: [
          collateralCollectionId: string,
          transferToMultisig: BN,
          admin: string,
          poolId: string,
          collectionId: string,
          tranches: TrancheInput[],
          currency: CurrencyKey,
          maxReserve: BN,
          metadata: PoolMetadataInput,
          aoProxy: string
        ],
        options
      ) => {
        const [collateralCollectionId, transferToMultisig, admin, , , , , , { adminMultisig }, aoProxy] = args
        const multisigAddr = adminMultisig && createKeyMulti(adminMultisig.signers, adminMultisig.threshold)
        const poolArgs = args.slice(2) as any
        return combineLatest([cent.getApi(), cent.pools.createPool(poolArgs, { batch: true })]).pipe(
          switchMap(([api, poolSubmittable]) => {
            const manager = multisigAddr ?? address
            const otherMultisigSigners =
              multisigAddr && sortAddresses(adminMultisig.signers.filter((addr) => !isSameAddress(addr, address!)))
            const proxiedPoolCreate = api.tx.proxy.proxy(admin, undefined, poolSubmittable)
            console.log('poolSubmittable', poolSubmittable, proxiedPoolCreate)
            console.log('adminMultisig!.signers', adminMultisig?.signers, otherMultisigSigners)
            const submittable = api.tx.utility.batchAll(
              [
                api.tx.balances.transfer(
                  admin,
                  new CurrencyBalance(api.consts.proxy.proxyDepositFactor, chainDecimals).add(transferToMultisig)
                ),
                api.tx.balances.transfer(
                  aoProxy,
                  new CurrencyBalance(api.consts.proxy.proxyDepositFactor, chainDecimals).add(
                    new CurrencyBalance(api.consts.uniques.collectionDeposit, chainDecimals)
                  )
                ),
                manager !== address &&
                  api.tx.proxy.proxy(
                    admin,
                    undefined,
                    api.tx.utility.batchAll([
                      api.tx.proxy.addProxy(manager, 'Any', 0),
                      api.tx.proxy.removeProxy(address, 'Any', 0),
                    ])
                  ),
                api.tx.proxy.proxy(
                  aoProxy,
                  undefined,
                  api.tx.utility.batchAll([
                    api.tx.uniques.create(collateralCollectionId, aoProxy),
                    api.tx.proxy.addProxy(admin, 'Any', 0),
                    api.tx.proxy.removeProxy(address, 'Any', 0),
                  ])
                ),
                multisigAddr
                  ? // ? api.tx.multisig.approveAsMulti(
                    //     adminMultisig.threshold,
                    //     otherMultisigSigners,
                    //     null,
                    //     proxiedPoolCreate.method.hash,
                    //     paymentInfo!.weight
                    //   )
                    api.tx.multisig.asMulti(adminMultisig.threshold, otherMultisigSigners, null, proxiedPoolCreate, 0)
                  : proxiedPoolCreate,
              ].filter(Boolean)
            )
            console.log('proxiedPoolCreate', proxiedPoolCreate)
            return cent.wrapSignAndSend(api, submittable, options)
          })
        )
      },
    {
      onSuccess: (args) => {
        const [, , , poolId] = args
        if (config.poolCreationType === 'immediate') {
          setCreatedPoolId(poolId)
        }
      },
    }
  )

  const { execute: createProxies, isLoading: createProxiesIsPending } = useCentrifugeTransaction(
    `${txMessage[config.poolCreationType || 'immediate']} 1/2`,
    (cent) => {
      return (_: [nextTx: (adminProxy: string, aoProxy: string) => void], options) =>
        cent.getApi().pipe(
          switchMap((api) => {
            const submittable = api.tx.utility.batchAll([
              api.tx.proxy.createPure('Any', 0, 0),
              api.tx.proxy.createPure('Any', 0, 1),
            ])
            return cent.wrapSignAndSend(api, submittable, options)
          })
        )
    },
    {
      onSuccess: async ([nextTx], result) => {
        const api = await centrifuge.getApiPromise()
        const events = result.events.filter(({ event }) => api.events.proxy.PureCreated.is(event))
        console.log('result', result, result.events)
        if (!events) return
        const { pure } = (events[0].toHuman() as any).event.data
        const { pure: pure2 } = (events[1].toHuman() as any).event.data

        nextTx(pure, pure2)
      },
    }
  )

  const form = useFormik({
    initialValues,
    validate: (values) => {
      let errors: FormikErrors<any> = {}

      const tokenNames = new Set<string>()
      const commonTokenSymbolStart = values.tranches[0].symbolName.slice(0, 3)
      const tokenSymbols = new Set<string>()
      let prevInterest = Infinity
      let prevRiskBuffer = 0
      values.tranches.forEach((t, i) => {
        if (tokenNames.has(t.tokenName)) {
          errors = setIn(errors, `tranches.${i}.tokenName`, 'Tranche names must be unique')
        }
        tokenNames.add(t.tokenName)

        // matches any character thats not alphanumeric or -
        if (/[^a-z^A-Z^0-9^-]+/.test(t.symbolName)) {
          errors = setIn(errors, `tranches.${i}.symbolName`, 'Invalid character detected')
        }

        if (tokenSymbols.has(t.symbolName)) {
          errors = setIn(errors, `tranches.${i}.symbolName`, 'Token symbols must be unique')
        }
        tokenSymbols.add(t.symbolName)

        if (t.symbolName.slice(0, 3) !== commonTokenSymbolStart) {
          errors = setIn(errors, `tranches.${i}.symbolName`, 'Token symbols must all start with the same 3 characters')
        }

        if (t.interestRate !== '') {
          if (t.interestRate > prevInterest) {
            errors = setIn(errors, `tranches.${i}.interestRate`, "Can't be higher than a more junior tranche")
          }
          prevInterest = t.interestRate
        }

        if (t.minRiskBuffer !== '') {
          if (t.minRiskBuffer < prevRiskBuffer) {
            errors = setIn(errors, `tranches.${i}.minRiskBuffer`, "Can't be lower than a more junior tranche")
          }
          prevRiskBuffer = t.minRiskBuffer
        }
      })

      return errors
    },
    validateOnMount: true,
    onSubmit: async (values, { setSubmitting }) => {
      if (!currencies || !address || !paymentInfo) return

      const metadataValues: PoolMetadataInput = { ...values } as any

      metadataValues.adminMultisig = values.adminMultisigEnabled
        ? {
            ...values.adminMultisig,
            signers: sortAddresses([address, ...values.adminMultisig.signers]),
          }
        : undefined

      const currency = currencies.find((c) => c.symbol === values.currency)!

      const poolId = await centrifuge.pools.getAvailablePoolId()
      const collectionId = await centrifuge.nfts.getAvailableCollectionId()
      const collateralCollectionId = await centrifuge.nfts.getAvailableCollectionId()
      if (!values.poolIcon || !values.executiveSummary) {
        return
      }
      const [pinnedPoolIcon, pinnedIssuerLogo, pinnedExecSummary] = await Promise.all([
        lastValueFrom(centrifuge.metadata.pinFile(await getFileDataURI(values.poolIcon))),
        values.issuerLogo ? lastValueFrom(centrifuge.metadata.pinFile(await getFileDataURI(values.issuerLogo))) : null,
        lastValueFrom(centrifuge.metadata.pinFile(await getFileDataURI(values.executiveSummary))),
      ])

      metadataValues.issuerLogo = pinnedIssuerLogo?.uri
        ? { uri: pinnedIssuerLogo.uri, mime: values?.issuerLogo?.type || '' }
        : null
      metadataValues.executiveSummary = { uri: pinnedExecSummary.uri, mime: values.executiveSummary.type }
      metadataValues.poolIcon = { uri: pinnedPoolIcon.uri, mime: values.poolIcon.type }

      // tranches must be reversed (most junior is the first in the UI but the last in the API)
      const nonJuniorTranches = metadataValues.tranches.slice(1)
      const tranches = [
        {}, // most junior tranche
        ...nonJuniorTranches.map((tranche) => ({
          interestRatePerSec: Rate.fromAprPercent(tranche.interestRate),
          minRiskBuffer: Perquintill.fromPercent(tranche.minRiskBuffer),
        })),
      ]

      // const epochSeconds = ((values.epochHours as number) * 60 + (values.epochMinutes as number)) * 60

      if (metadataValues.adminMultisig) {
        addMultisig(metadataValues.adminMultisig)
      }

      createProxies([
        (aoProxy, adminProxy) => {
          createPoolTx(
            [
              collateralCollectionId,
              CurrencyBalance.fromFloat(createDeposit, chainDecimals),
              aoProxy,
              adminProxy,
              poolId,
              collectionId,
              tranches,
              currency.key,
              CurrencyBalance.fromFloat(values.maxReserve, currency.decimals),
              metadataValues,
            ],
            { createType: config.poolCreationType }
          )
        },
      ])

      setSubmitting(false)
    },
  })
  console.log('form.values', form.values)
  React.useEffect(() => {
    if (!isStoredIssuerLoading && storedIssuer && waitingForStoredIssuer) {
      if (storedIssuer.name) {
        form.setFieldValue('issuerName', storedIssuer.name, false)
      }
      if (storedIssuer.description) {
        form.setFieldValue('issuerDescription', storedIssuer.description, false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoredIssuerLoading])

  React.useEffect(() => {
    if (config.poolCreationType === 'notePreimage') {
      const $events = centrifuge
        .getEvents()
        .pipe(
          filter(({ api, events }) => {
            const event = events.find(({ event }) => api.events.preimage.PreimageNoted.is(event))
            const parsedEvent = event?.toJSON() as any
            // the events api returns a few events for the event PreimageNoted where the data looks different everytime
            // when data is a tuple and the length is 3, it may be safe to extract the first value as the preimage hash
            if (parsedEvent?.event?.data?.length === 3) {
              console.info('Preimage hash: ', parsedEvent.event.data[0])
              setPreimageHash(parsedEvent.event.data[0])
              setIsDialogOpen(true)
            }
            return !!event
          })
        )
        .subscribe()
      return () => $events.unsubscribe()
    }
  }, [centrifuge])

  const formRef = React.useRef<HTMLFormElement>(null)
  useFocusInvalidInput(form, formRef)

  const { proposeFee, poolDeposit, proxyDeposit, paymentInfo, collectionDeposit } = useCreatePoolFee(form?.values)
  const createDeposit = (proposeFee?.toDecimal() ?? Dec(0))
    .add(poolDeposit.toDecimal())
    .add(collectionDeposit.toDecimal())
  const deposit = createDeposit.add(proxyDeposit.toDecimal())

  return (
    <>
      <PreimageHashDialog preimageHash={preimageHash} open={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
      <FormikProvider value={form}>
        <Form ref={formRef} noValidate>
          <PageHeader
            icon={<PoolIcon icon={form.values.poolIcon}>{(form.values.poolName || 'New Pool')[0]}</PoolIcon>}
            title={form.values.poolName || 'New Pool'}
            subtitle={
              <TextWithPlaceholder isLoading={waitingForStoredIssuer} width={15}>
                by {form.values.issuerName || (address && truncate(address))}
              </TextWithPlaceholder>
            }
            actions={
              <>
                <Text variant="body3">
                  Deposit required: {formatBalance(deposit, balances?.native.currency.symbol, 1)}
                </Text>

                <Button variant="secondary" onClick={() => history.goBack()}>
                  Cancel
                </Button>

                <Button
                  loading={form.isSubmitting || createProxiesIsPending || transactionIsPending}
                  type="submit"
                  loadingMessage={`Creating pool ${form.isSubmitting || createProxiesIsPending ? '1/2' : '2/2'}`}
                >
                  Create
                </Button>
              </>
            }
          />
          <PageSection title="Details">
            <Grid columns={[4]} equalColumns gap={2} rowGap={3}>
              <Box gridColumn="span 2">
                <FieldWithErrorMessage
                  validate={validate.poolName}
                  name="poolName"
                  as={TextInput}
                  label="Pool name*"
                  placeholder="New pool"
                  maxLength={100}
                />
              </Box>
              <Box gridColumn="span 2" width="100%">
                <Field name="poolIcon" validate={validate.poolIcon}>
                  {({ field, meta, form }: FieldProps) => (
                    <FileUpload
                      file={field.value}
                      onFileChange={async (file) => {
                        form.setFieldTouched('poolIcon', true, false)
                        form.setFieldValue('poolIcon', file)
                      }}
                      label="Pool icon: SVG in square size*"
                      placeholder="Choose pool icon"
                      errorMessage={meta.touched && meta.error ? meta.error : undefined}
                      accept="image/svg+xml"
                    />
                  )}
                </Field>
              </Box>
              <Box gridColumn="span 2">
                <Field name="assetClass" validate={validate.assetClass}>
                  {({ field, meta, form }: FieldProps) => (
                    <Select
                      name="assetClass"
                      label={<Tooltips type="assetClass" label="Asset class*" variant="secondary" />}
                      onChange={(event) => form.setFieldValue('assetClass', event.target.value)}
                      onBlur={field.onBlur}
                      errorMessage={meta.touched && meta.error ? meta.error : undefined}
                      value={field.value}
                      options={ASSET_CLASSES}
                      placeholder="Select..."
                    />
                  )}
                </Field>
              </Box>
              <Box gridColumn="span 2">
                <Field name="currency" validate={validate.currency}>
                  {({ field, form, meta }: FieldProps) => (
                    <Select
                      name="currency"
                      label={<Tooltips type="currency" label="Currency*" variant="secondary" />}
                      onChange={(event) => form.setFieldValue('currency', event.target.value)}
                      onBlur={field.onBlur}
                      errorMessage={meta.touched && meta.error ? meta.error : undefined}
                      value={field.value}
                      options={currencies?.map((c) => ({ value: c.symbol, label: c.symbol })) ?? []}
                      placeholder="Select..."
                    />
                  )}
                </Field>
              </Box>
              <Box gridColumn="span 2">
                <Field name="maxReserve" validate={validate.maxReserve}>
                  {({ field, form }: FieldProps) => (
                    <CurrencyInput
                      {...field}
                      name="maxReserve"
                      label="Initial maximum reserve*"
                      placeholder="0"
                      currency={form.values.currency}
                      variant="small"
                      onChange={(value) => form.setFieldValue('maxReserve', value)}
                    />
                  )}
                </Field>
              </Box>
              <Box gridColumn="span 2">
                <FieldWithErrorMessage
                  validate={validate.podEndpoint}
                  name="podEndpoint"
                  as={TextInput}
                  label={`POD endpoint`}
                  placeholder="https://"
                />
              </Box>
            </Grid>
          </PageSection>
          <PageSection title="Issuer">
            <IssuerInput waitingForStoredIssuer={waitingForStoredIssuer} />
          </PageSection>

          <TrancheSection />

          <AdminMultisigSection deposit={deposit} />
          <PodConfig />
        </Form>
      </FormikProvider>
    </>
  )
}
