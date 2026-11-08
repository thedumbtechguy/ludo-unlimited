/// <reference types="node" />
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** CI runs the tests before building the app, so make sure the assets folder exists. */
export default function setup(): void {
  mkdirSync(resolve(import.meta.dirname, '../../web/dist'), { recursive: true })
}
