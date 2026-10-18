// Gera cards de linguagens (SVG + JSON) a partir dos repositórios públicos da conta.
// Uso: GITHUB_TOKEN=... node scripts/gen-languages.mjs
import { mkdir, writeFile } from 'node:fs/promises'

const OWNER = process.env.GH_OWNER ?? 'GKsegura'
const TOKEN = process.env.LANGUAGES_TOKEN ?? process.env.GITHUB_TOKEN
const OUT = new URL('../', import.meta.url)

// Só os projetos de verdade entram; exercícios de curso e testes técnicos ficam de fora.
// Repo novo não aparece sozinho: adicione o nome aqui.
const INCLUDE_REPOS = new Set([
  'jarvis', 'Portfolio', 'hydra', 'janus', 'qinvest-web', 'EcoTube',
  'horta-inteligente', 'verkoop-catalogo-jogos',
  'CRONOS-API', 'CRONOS-APP', 'CRONOS-BOT', 'CRONOS-INFRA',
])
// Ruído que distorce o gráfico (markup/estilo de template, scripts de build).
const EXCLUDE_LANGS = new Set(['Dockerfile', 'Batchfile', 'Shell', 'PowerShell', 'Makefile'])
const TOP = 6

const COLORS = {
  Java: '#b07219', TypeScript: '#3178c6', JavaScript: '#f1e05a', Vue: '#41b883',
  PHP: '#4F5D95', Blade: '#f7523f', 'C#': '#178600', 'C++': '#f34b7d', C: '#555555',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Python: '#3572A5', PLpgSQL: '#336790',
}
const FALLBACK = '#BA55D3'

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': `${OWNER}-language-cards`,
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

function summarize(bytesByLang) {
  const entries = Object.entries(bytesByLang)
    .filter(([lang]) => !EXCLUDE_LANGS.has(lang))
    .sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, b]) => sum + b, 0)
  if (!total) return []
  const top = entries.slice(0, TOP)
  const rest = entries.slice(TOP).reduce((sum, [, b]) => sum + b, 0)
  if (rest) top.push(['Outras', rest])
  return top.map(([name, bytes]) => ({
    name,
    bytes,
    percent: Math.round((bytes / total) * 1000) / 10,
    color: COLORS[name] ?? FALLBACK,
  }))
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function svg(title, langs) {
  const W = 420
  const PAD = 20
  const barW = W - PAD * 2
  let x = PAD
  const bars = langs
    .map((l, i) => {
      const w = i === langs.length - 1 ? PAD + barW - x : (l.percent / 100) * barW
      const rect = `<rect x="${x.toFixed(1)}" y="46" width="${w.toFixed(1)}" height="8" fill="${l.color}"/>`
      x += w
      return rect
    })
    .join('')
  const rows = langs
    .map((l, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const cx = PAD + col * 200
      const cy = 82 + row * 22
      return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/><text x="${cx + 16}" y="${cy}" class="t">${esc(l.name)} <tspan class="m">${l.percent}%</tspan></text>`
    })
    .join('')
  const H = 82 + Math.ceil(langs.length / 2) * 22 + 6
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<style>
.h{font:600 15px 'Segoe UI',Ubuntu,sans-serif;fill:#24292f}
.t{font:13px 'Segoe UI',Ubuntu,sans-serif;fill:#24292f}
.m{fill:#6e7781}
.bg{fill:#fff;stroke:#BA55D3}
@media (prefers-color-scheme:dark){.h,.t{fill:#e6edf3}.m{fill:#8b949e}.bg{fill:#0d1117}}
</style>
<rect class="bg" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8"/>
<text x="${PAD}" y="30" class="h">${esc(title)}</text>
<clipPath id="c"><rect x="${PAD}" y="46" width="${barW}" height="8" rx="4"/></clipPath>
<g clip-path="url(#c)">${bars}</g>
${rows}
</svg>
`
}

// Com token de acesso pessoal, /user/repos inclui os privados; sem ele, só os públicos.
const listPath = TOKEN
  ? '/user/repos?per_page=100&affiliation=owner'
  : `/users/${OWNER}/repos?per_page=100&type=owner`
const repos = (await gh(listPath)).filter(
  (r) => r.owner.login === OWNER && !r.fork && !r.archived && INCLUDE_REPOS.has(r.name),
)

// Privados somam no card geral, mas não ganham card próprio (o nome vazaria no repo público).
const perRepo = {}
const total = {}
for (const repo of repos) {
  const bytes = await gh(`/repos/${OWNER}/${repo.name}/languages`)
  if (!repo.private) perRepo[repo.name] = bytes
  for (const [lang, b] of Object.entries(bytes)) total[lang] = (total[lang] ?? 0) + b
}

await mkdir(new URL('cards/', OUT), { recursive: true })

const overall = summarize(total)
await writeFile(new URL('languages.svg', OUT), svg('Linguagens mais usadas', overall))
await writeFile(new URL('languages.json', OUT), JSON.stringify({ owner: OWNER, languages: overall }, null, 2) + '\n')

for (const [name, bytes] of Object.entries(perRepo)) {
  const langs = summarize(bytes)
  if (langs.length) await writeFile(new URL(`cards/${name}.svg`, OUT), svg(`${name} · linguagens`, langs))
}

console.log(`${repos.length} repositórios; top: ${overall.map((l) => `${l.name} ${l.percent}%`).join(', ')}`)
