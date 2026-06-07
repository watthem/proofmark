#!/usr/bin/env node

import { existsSync } from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import pc from 'picocolors'
import { initializeProject } from '../src/commands/init.js'
import { executeDataPull } from '../src/commands/pull.js'
import { getErrorMessage } from '../src/utils/errors.js'

// Load .env so PROOFMARK_WORKSEED (written by `proofmark init`) is available to
// the masking pipeline without the user manually exporting it. Guarded so that
// Node runtimes without process.loadEnvFile (< 20.6) degrade to env-only rather
// than crashing. Existing process.env values are not overwritten.
const envPath = path.resolve(process.cwd(), '.env')
if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath)
  } catch {
    // Malformed .env should not crash the CLI; the seed check fails closed later.
  }
}

const program = new Command()

program
  .name('proofmark')
  .description('Production-fidelity data for local development. Zero PII.')
  .version('0.1.1')
  .showHelpAfterError()

program
  .command('init')
  .description('Scan project structure and generate proofmark.json configuration')
  .option('--schema <path>', 'Path to a Prisma schema file')
  .option('--force', 'Overwrite an existing proofmark.json')
  .action(async (options: { schema?: string; force?: boolean }) => {
    try {
      console.log(pc.cyan('\nScanning project for database frameworks...'))
      await initializeProject({
        cwd: process.cwd(),
        overwrite: options.force === true,
        ...(options.schema ? { schemaPath: options.schema } : {}),
      })
    } catch (error) {
      console.error(pc.red(`\nInitialization failed: ${getErrorMessage(error)}`))
      process.exitCode = 1
    }
  })

program
  .command('pull')
  .description('Safely pull, anonymize, and seed production data to your local machine')
  .option('--env <name>', 'Source environment profile', 'production')
  .option('--dry-run', 'Inspect PII mutations side-by-side without writing to database')
  .option('--sample-size <count>', 'Rows to sample per configured table', '5')
  .option('--demo', 'Use bundled demo evidence instead of reading proofmark.json')
  .action(async (options: { env: string; dryRun?: boolean; sampleSize: string; demo?: boolean }) => {
    try {
      console.log(pc.bold(pc.magenta('\nProofmark: initiating workflow pipeline')))

      if (options.dryRun) {
        console.log(
          pc.yellow('Running in dry-run mode. No database modifications will occur.'),
        )
      }

      await executeDataPull({
        env: options.env,
        dryRun: options.dryRun === true,
        demo: options.demo === true,
        sampleSize: Number.parseInt(options.sampleSize, 10),
      })
    } catch (error) {
      console.error(pc.red(`\nPipeline execution halted: ${getErrorMessage(error)}`))
      process.exitCode = 1
    }
  })

await program.parseAsync(process.argv)

if (process.argv.slice(2).length === 0) {
  program.outputHelp()
}
