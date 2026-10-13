// Every renown-orgs mutation renown.id signs, with its arguments exactly as in
// the API contract (renown-package docs/superpowers/plans/2026-10-12-orgs-a1-core.md,
// appendix) and the fields the UI reads back. /api/org/<mutation> forwards only
// these, with only these arguments. B2 adds its mutations here.
import {
  INVITE_FIELDS,
  LINK_FIELDS,
  MEMBER_FIELDS,
  ORG_FIELDS,
  PROPOSAL_FIELDS,
  TEAM_FIELDS,
} from './orgs'

export interface OrgMutationSpec {
  /** Argument name → GraphQL type, in SDL order (`auth: OrgAuthInput` is added to every one). */
  args: Readonly<Record<string, string>>
  /** Selection set of the result; '' for a scalar result. */
  select: string
}

export const ORG_MUTATIONS = {
  createOrganization: {
    args: { handle: 'String!', name: 'String!', bio: 'String', website: 'String', links: '[OrgLinkInput!]', listed: 'Boolean', membersPublic: 'Boolean' },
    select: ORG_FIELDS,
  },
  updateOrganization: {
    args: { orgId: 'String!', name: 'String', bio: 'String', website: 'String', avatar: 'String', links: '[OrgLinkInput!]', membersPublic: 'Boolean' },
    select: ORG_FIELDS,
  },
  setOrgListed: { args: { orgId: 'String!', listed: 'Boolean!' }, select: ORG_FIELDS },
  inviteOrgMember: { args: { orgId: 'String!', invitee: 'String!', role: 'OrgRole!' }, select: INVITE_FIELDS },
  respondToOrgInvite: { args: { orgId: 'String!', inviteId: 'String!', accept: 'Boolean!' }, select: MEMBER_FIELDS },
  revokeOrgInvite: { args: { orgId: 'String!', inviteId: 'String!' }, select: INVITE_FIELDS },
  createOrgInviteLink: {
    args: { orgId: 'String!', role: 'OrgRole!', maxUses: 'Int!', expiresAt: 'String!' },
    select: `link { ${LINK_FIELDS} } token`,
  },
  revokeOrgInviteLink: { args: { orgId: 'String!', linkId: 'String!' }, select: LINK_FIELDS },
  acceptOrgInviteLink: { args: { token: 'String!' }, select: MEMBER_FIELDS },
  leaveOrganization: { args: { orgId: 'String!' }, select: '' },
  removeOrgMember: { args: { orgId: 'String!', address: 'String!' }, select: MEMBER_FIELDS },
  setOrgMemberRole: { args: { orgId: 'String!', address: 'String!', role: 'OrgRole!' }, select: MEMBER_FIELDS },
  setOrgMemberAppScope: { args: { orgId: 'String!', address: 'String!', appScope: 'OrgAppScopeInput!' }, select: MEMBER_FIELDS },
  setMyOrgMembershipHidden: { args: { orgId: 'String!', hidden: 'Boolean!' }, select: MEMBER_FIELDS },
  createOrgTeam: { args: { orgId: 'String!', slug: 'String!', name: 'String!', appDids: '[String!]' }, select: TEAM_FIELDS },
  updateOrgTeam: {
    args: { orgId: 'String!', teamId: 'String!', slug: 'String', name: 'String', appDids: '[String!]' },
    select: TEAM_FIELDS,
  },
  deleteOrgTeam: { args: { orgId: 'String!', teamId: 'String!' }, select: '' },
  setOrgTeamMembers: { args: { orgId: 'String!', teamId: 'String!', addresses: '[String!]!' }, select: TEAM_FIELDS },
  proposeOrgChange: {
    args: { orgId: 'String!', kind: 'OrgProposalKind!', payload: 'OrgProposalPayloadInput!' },
    select: PROPOSAL_FIELDS,
  },
} as const satisfies Record<string, OrgMutationSpec>

export type OrgMutationName = keyof typeof ORG_MUTATIONS

export function isOrgMutationName(value: string): value is OrgMutationName {
  return Object.hasOwn(ORG_MUTATIONS, value)
}

function spec(name: OrgMutationName): OrgMutationSpec {
  return ORG_MUTATIONS[name]
}

/** The mutation document: every declared argument as a variable, plus auth. Absent variables stay absent arguments. */
export function mutationDocument(name: OrgMutationName): string {
  const { args, select } = spec(name)
  const types: Record<string, string> = { ...args, auth: 'OrgAuthInput' }
  const names = Object.keys(types)
  const variables = names.map((arg) => `$${arg}: ${types[arg]}`).join(', ')
  const call = names.map((arg) => `${arg}: $${arg}`).join(', ')
  const operation = name.charAt(0).toUpperCase() + name.slice(1)
  return `mutation ${operation}(${variables}) { ${name}(${call})${select ? ` { ${select} }` : ''} }`
}

/** The first argument that is not declared, or that is required and missing; null when the arguments fit. */
export function argsProblem(name: OrgMutationName, args: Record<string, unknown>): string | null {
  const declared = spec(name).args
  const unknown = Object.keys(args).find((key) => !Object.hasOwn(declared, key))
  if (unknown) return unknown
  const missing = Object.entries(declared).find(([key, type]) => type.endsWith('!') && (args[key] === undefined || args[key] === null))
  return missing ? missing[0] : null
}
