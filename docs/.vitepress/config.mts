import { defineConfig } from 'vitepress'

// Docs are sourced from /docs and built into /site/docs so they ship on the
// same static deploy as the landing page (Cloudflare serves ./site as-is).
// Served at https://proofmark.dev/docs/.
export default defineConfig({
  title: 'Proofmark',
  description:
    'Production-shaped dev data for Prisma + Postgres, with deterministic masking and a dry-run proof certificate.',
  lang: 'en-US',

  base: '/docs/',
  outDir: '../site/docs',

  // Never publish internal planning or repo meta files as docs pages.
  srcExclude: ['**/internal/**', '**/README.md', 'DEPLOY.md'],

  // Match the dark, teal-accented landing page.
  appearance: 'dark',

  head: [
    [
      'link',
      {
        rel: 'icon',
        href:
          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%230a0a0a'/><text x='50' y='60' font-size='34' fill='%235eead4' text-anchor='middle' font-family='monospace'>pm</text></svg>",
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'Deck', link: 'https://github.com/watthem/proofmark/blob/main/DECK.md' },
      { text: 'proofmark.dev', link: 'https://proofmark.dev' },
    ],

    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Roadmap to npm', link: '/roadmap' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'How masking works', link: '/solution' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/watthem/proofmark' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/watthem/proofmark/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'MIT licensed. Built by Matthew Hendricks.',
      copyright: 'proofmark.dev',
    },
  },
})
