import { defineConfig } from 'vitepress'

const siteUrl = 'https://proofmark.dev'
const docsBase = '/docs/'
const docsDescription =
  'Docs for Proofmark.dev PII, a local-first masking CLI for Prisma, Postgres, and TypeScript teams.'
const socialImage = `${siteUrl}/assets/proofmark-dashboard-demo.png`

function docsUrl(relativePath: string) {
  const pagePath = relativePath.replace(/index\.md$/, '').replace(/\.md$/, '.html')
  return new URL(`${docsBase}${pagePath}`, siteUrl).href
}

// Docs are sourced from /docs and built into /site/docs so they ship on the
// same static deploy as the landing page (Cloudflare serves ./site as-is).
// Served at https://proofmark.dev/docs/.
export default defineConfig({
  title: 'Proofmark',
  titleTemplate: ':title | Proofmark docs',
  description: docsDescription,
  lang: 'en-US',

  base: '/docs/',
  outDir: '../site/docs',
  sitemap: {
    hostname: 'https://proofmark.dev/docs/',
    lastmodDateOnly: true,
  },

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
    ['meta', { name: 'robots', content: 'index,follow' }],
    ['meta', { name: 'theme-color', content: '#050505' }],
  ],

  transformPageData(pageData) {
    const canonicalUrl = docsUrl(pageData.relativePath)
    const description =
      typeof pageData.frontmatter.description === 'string'
        ? pageData.frontmatter.description
        : docsDescription
    const isHome = pageData.relativePath === 'index.md'
    const title = isHome
      ? 'Proofmark docs | PII-safe dev data for TypeScript apps'
      : `${pageData.title} | Proofmark docs`

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
      ['meta', { property: 'og:site_name', content: 'Proofmark.dev' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:image', content: socialImage }],
      ['meta', { property: 'og:image:width', content: '1440' }],
      ['meta', { property: 'og:image:height', content: '1200' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: socialImage }],
      [
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': isHome ? 'CollectionPage' : 'TechArticle',
          '@id': `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          isPartOf: {
            '@id': `${siteUrl}/#website`,
            name: 'Proofmark.dev',
          },
        }),
      ],
    )
  },

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
