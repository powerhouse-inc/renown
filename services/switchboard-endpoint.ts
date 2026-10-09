// The one place the switchboard GraphQL endpoint is resolved. Only `next dev`
// falls back to a local switchboard; a production build with no env set must
// never point browsers at localhost.
export const SWITCHBOARD_ENDPOINT =
  process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT ||
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:4001/graphql'
    : 'https://switchboard.renown.vetra.io/graphql')
