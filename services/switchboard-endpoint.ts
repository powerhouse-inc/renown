import { runtimeConfig } from '../lib/runtime-config'
// The one place the switchboard GraphQL endpoint is resolved: the deployment's
// setting, else the build's, else (only under `next dev`) a local switchboard
// (lib/runtime-config.ts).
export const SWITCHBOARD_ENDPOINT = runtimeConfig().switchboardEndpoint
