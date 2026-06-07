import { rm } from 'node:fs/promises'

await rm('dist/cli', { recursive: true, force: true })
