import type { Hex, TypedDataDomain, TypedDataParameter } from 'viem'

export enum LoginMethod {
  WALLET = 'WALLET',
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
  FACEBOOK = 'FACEBOOK',
  TWITTER = 'TWITTER',
  LINKEDIN = 'LINKEDIN',
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  SPOTIFY = 'SPOTIFY',
  DISCORD = 'DISCORD',
  GITHUB = 'GITHUB',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum AccountType {
  EOA = 'EOA',
  SMART_ACCOUNT = 'SMART_ACCOUNT',
}

export interface SignTypedDataArgs {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: string
  message: Record<string, unknown>
}

export interface Signer {
  signMessage(message: string): Promise<Hex>
  signTypedData(args: SignTypedDataArgs): Promise<Hex>
}

export interface Session {
  address: Hex
  chainId: number
  caip2: string
  accountType: AccountType
  signer: Signer
}

export interface LoginOptions {
  method: LoginMethod
  chainId?: number
}

export type AdapterListener = (session: Session | null) => void

export type Unsubscribe = () => void

/** Thrown when the user dismisses a login flow (closes the modal, hits cancel, etc). */
export class LoginCancelledError extends Error {
  constructor(message = 'Login cancelled by user') {
    super(message)
    this.name = 'LoginCancelledError'
  }
}
