import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./scripts/ts-resolver.mjs').href, import.meta.url)
