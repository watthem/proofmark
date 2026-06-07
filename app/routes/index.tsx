import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'

const fitSignals = [
  'Your UI needs believable names, emails, phones, roles, and dates.',
  'Your seed script misses the broken states customers create.',
  'Your team wants evidence before copied data reaches a laptop or preview database.',
] as const

const steps = [
  {
    icon: Database,
    title: 'Inspect schema',
    text: 'Read your Prisma schema and show masking rules before touching rows.',
  },
  {
    icon: ShieldCheck,
    title: 'Sample read-only',
    text: 'Pull a small Postgres sample from configured columns without writing to source or target.',
  },
  {
    icon: FileCheck2,
    title: 'Certify the copy',
    text: 'Print the original sample, masked value, strategy, and certificate status in one report.',
  },
] as const

const currentScope = [
  'Prisma schema discovery',
  'Read-only Postgres sampling',
  'Deterministic masking',
  'Dry-run proof certificate',
] as const

export const Route = createFileRoute('/')({
  component: SiteHome,
})

function SiteHome() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <Hero />
      <section className="border-y border-neutral-800 bg-neutral-950 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <article
              key={step.title}
              className="rounded-md border border-neutral-800 bg-neutral-900/70 p-5"
            >
              <step.icon className="size-5 text-teal-300" />
              <h2 className="mt-4 text-base font-semibold text-neutral-50">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                {step.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="fit" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
              <TerminalSquare className="size-3.5" />
              where it fits
            </div>
            <h2 className="mt-5 text-3xl font-semibold text-neutral-50 sm:text-4xl">
              For frontend teams that outgrew seed.ts.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400">
              If your app has real users, it has weird data. Proofmark is for
              Next.js, Prisma, and Postgres teams that need production-shaped
              records without dragging real people into local development.
            </p>
          </div>

          <div className="grid gap-3">
            {fitSignals.map((signal) => (
              <div
                key={signal}
                className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-900/70 p-4"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                <span className="text-sm leading-6 text-neutral-300">
                  {signal}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-100 px-4 py-16 text-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-teal-700">
              scope
            </div>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Narrow enough to trust.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-700">
              The alpha path is Prisma + Postgres, read-only dry run. Write
              mode, non-Prisma adapters, and broader database support are
              planned only after the proof path is reliable.
            </p>
          </div>
          <div className="rounded-md border border-neutral-300 bg-white p-5">
            <div className="text-sm font-semibold text-neutral-950">
              Today
            </div>
            <div className="mt-4 grid gap-3">
              {currentScope.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="certificate" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-teal-300">
                proof artifact
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-neutral-50 sm:text-4xl">
                The certificate is the point.
              </h2>
            </div>
            <a
              href="/dashboard"
              className="inline-flex w-fit items-center gap-2 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
            >
              Open dashboard
              <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="mt-8 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
            <img
              src="/proofmark-dashboard-demo.png"
              alt="Proofmark dashboard showing dry-run evidence and sync logs"
              className="w-full"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-800 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold text-neutral-50">
              Bring your messiest table.
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              Send a schema and one table that makes local testing painful. The
              dry run should prove the app still works without keeping the real
              identifiers.
            </p>
          </div>
          <a
            href="mailto:matthew.scott.hendricks@gmail.com?subject=Proofmark%20dry%20run"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white"
          >
            Try a dry run
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </main>
  )
}

function Hero() {
  return (
    <section className="relative min-h-[86vh] overflow-hidden border-b border-neutral-800">
      <img
        src="/proofmark-dashboard-demo.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-top opacity-35"
      />
      <div className="absolute inset-0 bg-neutral-950/75" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border border-teal-500/40 bg-teal-500/10 font-mono text-sm font-semibold text-teal-200">
            pm
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide text-neutral-50">
              proofmark
            </span>
            <span className="block text-xs text-neutral-400">
              proof-backed dev data
            </span>
          </span>
        </a>
        <nav className="flex items-center gap-2">
          <a
            href="#fit"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-neutral-300 transition hover:text-white sm:inline-flex"
          >
            Fit
          </a>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-600 bg-neutral-950/70 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-400"
          >
            Dashboard
            <ArrowRight className="size-4" />
          </a>
        </nav>
      </header>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
            <TerminalSquare className="size-3.5" />
            Next.js / Prisma / Postgres
          </div>
          <h1 className="mt-6 text-5xl font-semibold text-neutral-50 sm:text-6xl lg:text-7xl">
            Proofmark
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-200">
            Production-shaped dev data. PII-safe by proof, not promise. Pull a
            small Postgres sample, mask detected PII locally, and get a dry-run
            proof certificate before anything is copied.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:matthew.scott.hendricks@gmail.com?subject=Proofmark%20dry%20run"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-white"
            >
              Try a dry run
              <ArrowRight className="size-4" />
            </a>
            <a
              href="#certificate"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-600 bg-neutral-950/70 px-4 py-3 text-sm font-semibold text-neutral-100 transition hover:border-neutral-400"
            >
              View proof certificate
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
