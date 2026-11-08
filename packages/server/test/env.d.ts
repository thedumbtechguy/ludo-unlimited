import type { Env as RoomEnv } from '../src/RoomObject'

// Types for `env` and `exports` from cloudflare:workers in the tests.
declare global {
  namespace Cloudflare {
    interface Env extends RoomEnv {}
    interface GlobalProps {
      mainModule: typeof import('../src/index')
      durableNamespaces: 'RoomObject'
    }
  }
}
