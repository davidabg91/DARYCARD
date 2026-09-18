// Writes one static page per line into dist/linia/<slug>/index.html, plus the
// sitemap that lists them.
//
// Why static files and not routes: the app runs on HashRouter, so every address
// it serves is darycommerce.com/#/... and Google drops everything after the #.
// A line could never be its own search result that way. These pages carry the
// timetable as plain HTML, so a search engine — and an AI crawler, which does
// not run JS — reads the hours without executing anything.
//
// The data comes in from vite.config.ts, which imports the same modules the app
// uses. Nothing here re-states a timetable or a price: change schedules.ts and
// the pages change with the next build.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SITE = 'https://darycommerce.com';
const OPERATOR = 'Дари Комерс';

// The far end of a shared timetable. Божурица rides the Рибен line, so its
// village->Плевен column is Рибен's; the app labels it that way and these pages
// must not claim otherwise.
const ORIGIN_MAPPING = {
  'Божурица': 'Рибен',
  'Победа': 'Рибен',
  'Биволаре': 'Рибен',
  'Градина': 'Бъркач',
  'Дисевица': 'Бъркач',
  'Търнене': 'Бъркач',
  'Петърница': 'Бъркач',
  'Крушовица': 'Садовец',
  'Ореховица': 'Байкал',
  'Брегаре': 'Байкал',
  'Крушовене': 'Байкал',
  'Вълчитрън': 'Борислав',
  'Катерица': 'Борислав',
};

// ROUTE_METADATA stores stops in the short form the app's cramped route strip
// needs. Spelled out here: "Д.М" is worth nothing to someone searching for
// Долна Митрополия.
const STOP_NAMES = {
  'Д.М': 'Долна Митрополия',
  'Г.М': 'Горна Митрополия',
  'Д. Дъбник': 'Долни Дъбник',
  'Г. Дъбник': 'Горни Дъбник',
};

const stopName = (stop) => STOP_NAMES[stop] ?? stop;

const CARD_TYPES = [
  'Ученическа карта',
  'Пенсионерска карта',
  'Учителска карта',
  'Инвалидна карта',
];

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Where a line runs between: "Пордим - Каменец" carries both ends in its name,
// every other line starts from Плевен.
//
// `to` is the destination the page is about and must stay the line itself —
// titling Божурица's page "Плевен – Рибен" would drop the village nobody would
// then find. `returnFrom` is only the heading over the return column, where the
// far end of a shared timetable really is Рибен.
const endpoints = (line) => {
  if (line.includes(' - ')) {
    const [from, to] = line.split(' - ');
    const dest = stopName(to.trim());
    return { from: stopName(from.trim()), to: dest, returnFrom: dest };
  }
  const shared = ORIGIN_MAPPING[line];
  return {
    from: 'Плевен',
    to: stopName(line),
    returnFrom: stopName(shared ?? line),
    sharedWith: shared ?? null,
  };
};

// The times a line runs on each kind of day, following the same fallbacks as the
// app: a day without its own column keeps the weekday one, and a holiday falls
// back to Sunday before that.
const dayTimes = (sched) => [
  { label: 'Делник (понеделник – петък)', times: sched },
  { label: 'Събота', times: sched.saturday ?? sched },
  { label: 'Неделя', times: sched.sunday ?? sched },
  { label: 'Официален празник', times: sched.holiday ?? sched.sunday ?? sched },
];

const timeChips = (times) =>
  (times ?? [])
    .map((t) => {
      const isNew = t.includes('*');
      const shown = esc(t.replace('*', ''));
      return isNew
        ? `<li class="t new"><span class="badge">НОВО</span>${shown}</li>`
        : `<li class="t">${shown}</li>`;
    })
    .join('');

const STYLES = `
:root{--primary:#00ADB5;--bg:#222831;--text:#fff;--muted:rgba(255,255,255,.55);--line:rgba(255,255,255,.08)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Outfit','Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:1.5rem 1rem 4rem}
a{color:var(--primary)}
header.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-bottom:1.5rem;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-weight:900;letter-spacing:2px;font-size:.8rem;color:var(--muted);text-decoration:none}
.brand b{color:var(--primary)}
nav.crumbs{font-size:.78rem;color:var(--muted);margin:1.2rem 0 .4rem}
nav.crumbs a{text-decoration:none}
h1{font-size:clamp(1.6rem,5vw,2.4rem);font-weight:900;letter-spacing:-1px;margin:.2rem 0 .6rem;line-height:1.15}
.lead{color:var(--muted);margin:0 0 1.5rem}
h2{font-size:1.2rem;font-weight:800;margin:2.5rem 0 1rem;letter-spacing:-.4px}
section{background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:18px;padding:1.2rem;margin-bottom:1rem}
.day{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:var(--primary);margin-bottom:.9rem}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.4rem}
.dir{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:.6rem}
ul.times{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;padding:0;margin:0}
li.t{background:rgba(0,173,181,.1);border:1px solid rgba(0,173,181,.25);border-radius:10px;padding:.35rem .6rem;font-weight:800;font-size:.9rem;font-variant-numeric:tabular-nums;position:relative}
li.t.new{margin-top:.55rem}
.badge{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#ff5252;color:#fff;font-size:.5rem;font-weight:900;padding:1px 4px;border-radius:4px;letter-spacing:.5px}
.none{color:var(--muted);font-size:.85rem;margin:0}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th,td{text-align:left;padding:.6rem .2rem;border-bottom:1px solid var(--line)}
td.price{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:none}
ol.stops{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
ol.stops li{font-weight:700;font-size:.9rem}
ol.stops li:not(:last-child):after{content:'\\2192';color:var(--primary);margin-left:.5rem;opacity:.6}
.cta{display:inline-block;background:var(--primary);color:#03181a;font-weight:900;text-decoration:none;padding:.85rem 1.5rem;border-radius:14px;margin-top:.4rem}
.note{font-size:.82rem;color:var(--muted);margin-top:.8rem}
ul.lines{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.5rem}
ul.lines a{display:block;padding:.5rem .7rem;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--text);font-size:.85rem;font-weight:700}
ul.lines a:hover{border-color:var(--primary);color:var(--primary)}
footer{color:var(--muted);font-size:.8rem;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}
`.trim();

const renderPage = ({ line, meta, sched, slug, prices, allLines, slugOf }) => {
  const { from, to, returnFrom, sharedWith } = endpoints(line);
  const pair = `${from} – ${to}`;
  const title = `Автобус ${pair}: разписание и цени | ${OPERATOR}`;
  const priceBits = [
    meta?.priceSingle && meta.priceSingle !== '-' ? `билет ${meta.priceSingle}` : null,
    meta?.priceCard && meta.priceCard !== '-' ? `месечна карта ${meta.priceCard}` : null,
  ].filter(Boolean).join(', ');
  const description =
    `Разписание на автобус ${pair} — часовете за делник, събота, неделя и празник` +
    (priceBits ? `. Цени: ${priceBits}` : '') +
    `. Превозвач ${OPERATOR}.`;
  const url = `${SITE}/linia/${slug}/`;

  const schedule = dayTimes(sched)
    .map(({ label, times }) => {
      const out = timeChips(times.fromPleven);
      const back = timeChips(times.fromDestination);
      if (!out && !back) return '';
      return `  <section>
    <div class="day">${esc(label)}</div>
    <div class="cols">
      <div>
        <div class="dir">От ${esc(from)}</div>
        ${out ? `<ul class="times">${out}</ul>` : '<p class="none">Няма курсове.</p>'}
      </div>
      <div>
        <div class="dir">От ${esc(returnFrom)}</div>
        ${back ? `<ul class="times">${back}</ul>` : '<p class="none">Няма курсове.</p>'}
      </div>
    </div>
  </section>`;
    })
    .filter(Boolean)
    .join('\n');

  const priceRows = [
    meta?.priceSingle && meta.priceSingle !== '-'
      ? `<tr><th scope="row">Билет (еднопосочен)</th><td class="price">${esc(meta.priceSingle)}</td></tr>`
      : '',
    ...prices.map(([label, value]) =>
      `<tr><th scope="row">${esc(label)}</th><td class="price">${esc(value)}</td></tr>`),
  ].filter(Boolean).join('\n        ');

  const stops = (meta?.stops ?? []).map((s) => `<li>${esc(stopName(s))}</li>`).join('');

  const others = allLines
    .filter((l) => l !== line)
    .map((l) => `<li><a href="/linia/${slugOf(l)}/">${esc(l)}</a></li>`)
    .join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Начало', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: `${from} – ${to}`, item: url },
        ],
      },
      {
        '@type': 'BusTrip',
        name: `Автобус ${pair}`,
        description,
        url,
        provider: { '@type': 'Organization', name: OPERATOR, url: `${SITE}/` },
        departureBusStop: { '@type': 'BusStop', name: from },
        arrivalBusStop: { '@type': 'BusStop', name: to },
      },
    ],
  };

  return `<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(OPERATOR)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="bg_BG">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#222831">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/pwa-icon.png">
<style>${STYLES}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/">DARY <b>COMMERCE</b></a>
    <a class="brand" href="/">Всички линии</a>
  </header>

  <nav class="crumbs" aria-label="Навигация">
    <a href="/">Начало</a> / ${esc(line)}
  </nav>

  <h1>Автобус ${esc(pair)}</h1>
  <p class="lead">Разписание, цени и спирки по линия ${esc(line)}. Превозвач ${esc(OPERATOR)}.</p>

  <h2>Разписание</h2>
${schedule || '  <section><p class="none">Разписанието се актуализира.</p></section>'}
${sharedWith ? `  <p class="note">${esc(line)} се обслужва от курсовете на линия ${esc(stopName(sharedWith))}, затова часовете в обратната посока са отбелязани от ${esc(returnFrom)}.</p>\n` : ''}  <p class="note">Часовете може да се променят при ремонт на пътя или празничен ред. Актуалното разписание е винаги на <a href="/">началната страница</a>.</p>
${priceRows ? `
  <h2>Цени</h2>
  <section>
    <table>
      <tbody>
        ${priceRows}
      </tbody>
    </table>
    <p class="note">Месечната карта важи за неограничен брой пътувания по линията до края на периода.</p>
  </section>
` : ''}${stops ? `
  <h2>Спирки по маршрута</h2>
  <section><ol class="stops">${stops}</ol></section>
` : ''}${meta?.description ? `
  <section><p class="note" style="margin:0">${esc(meta.description)}</p></section>
` : ''}
  <h2>Как да си извадя карта</h2>
  <section>
    <p style="margin-top:0">Картата се издава на място и се зарежда за избрания период. Условията и нужните документи са на началната страница.</p>
    <a class="cta" href="/">Към Дари Комерс</a>
  </section>

  <h2>Други линии</h2>
  <section><ul class="lines">${others}</ul></section>

  <footer>
    <p>${esc(OPERATOR)} — превоз на пътници в област Плевен. <a href="/">darycommerce.com</a></p>
  </footer>
</div>
</body>
</html>
`;
};

export async function generateLinePages({
  outDir, routes, ROUTE_METADATA, SCHEDULES, cardPrice, routeSlug,
}) {
  // Two lines transliterating to the same address would silently overwrite each
  // other's page, so fail the build instead.
  const seen = new Map();
  for (const line of routes) {
    const slug = routeSlug(line);
    if (seen.has(slug)) {
      throw new Error(
        `Две линии дават един и същ адрес /linia/${slug}/: "${seen.get(slug)}" и "${line}".`,
      );
    }
    seen.set(slug, line);
  }

  for (const line of routes) {
    const slug = routeSlug(line);
    const meta = ROUTE_METADATA[line];
    const sched = SCHEDULES[line];
    if (!sched) continue;

    const prices = [];
    const base = cardPrice(line, undefined);
    if (base !== null && base !== undefined) prices.push(['Месечна карта', `${base.toFixed(2)} €`]);
    for (const type of CARD_TYPES) {
      const value = cardPrice(line, type);
      if (value !== null && value !== undefined) prices.push([type, `${value.toFixed(2)} €`]);
    }

    const html = renderPage({
      line, meta, sched, slug, prices, allLines: routes, slugOf: routeSlug,
    });
    const dir = join(outDir, 'linia', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html, 'utf8');
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', changefreq: 'daily' },
    ...routes.map((line) => ({
      loc: `${SITE}/linia/${routeSlug(line)}/`,
      priority: '0.8',
      changefreq: 'weekly',
    })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, priority, changefreq }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(join(outDir, 'sitemap.xml'), sitemap, 'utf8');

  return { pages: seen.size };
}
