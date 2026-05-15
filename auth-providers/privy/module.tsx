import type { AuthProviderModule } from '../../services/wallet/module'
import { LoginMethod } from '../../services/wallet/types'
import { PrivyAdapter } from './adapter'
import { PrivyAuthProvider } from './provider'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || undefined

export const privyModule: AuthProviderModule = {
  name: 'privy',
  enabled: Boolean(PRIVY_APP_ID),
  createAdapter: () =>
    new PrivyAdapter({
      supportedMethods: [LoginMethod.GOOGLE, LoginMethod.EMAIL],
    }),
  Provider: PrivyAuthProvider,
}
