/// <reference types="vite/client" />

import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Proofmark' },
      {
        name: 'description',
        content:
          'Production-shaped dev data for Prisma + Postgres, with deterministic masking and a dry-run proof certificate.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFoundComponent() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-950 px-4 text-neutral-100">
      <div className="max-w-md text-center">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-teal-300">
          not found
        </div>
        <h1 className="mt-3 text-3xl font-semibold">Route not found</h1>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        >
          Return home
        </a>
      </div>
    </main>
  )
}
