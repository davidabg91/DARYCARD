// Writes one static page per line into dist/linia/<slug>/index.html, plus the
// sitemap that lists them.
//
// Why static files and not routes: the app runs on HashRouter, so every address
// it serves is darycommerce.com/#/... and Google drops everything after the #.
// A line could never be its own search result that way. These pages carry the
// timetable as plain HTML, so a search engine — and an AI crawler, which does
// not run JS — reads the hours without executing anything.
//
// The page is built to match the line view inside the app: same card, same
// countdowns, same day groups with today first and the next departure pulsing.
// The parts that need the clock run from a small inline script, so the hours are
// in the HTML either way and the page works before (and without) that script.
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

// Lines whose card prices carry no student/pensioner discount, only the one for
// riders with a disability. Same list the app's price note uses.
const DISABLED_ONLY_LINES = [
  'Гривица', 'Згалево', 'Пордим', 'Одърне', 'Каменец',
  'Вълчитрън', 'Катерица', 'Борислав',
  'Пордим - Каменец', 'Пордим - Згалево',
];

const CARD_TYPES = [
  'Ученическа карта',
  'Пенсионерска карта',
  'Учителска карта',
  'Инвалидна карта',
];

// "2.00 €" -> "2.00" for schema.org, which wants the bare number.
const priceNumber = (value) => {
  if (!value || value === '-' || value === '---') return null;
  const n = parseFloat(String(value).replace('€', '').trim());
  return Number.isNaN(n) ? null : n.toFixed(2);
};

const BUILD_DATE = new Date().toISOString().slice(0, 10);

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
    return { from: stopName(from.trim()), to: dest, returnFrom: dest, sharedWith: null };
  }
  const shared = ORIGIN_MAPPING[line];
  return {
    from: 'Плевен',
    to: stopName(line),
    returnFrom: stopName(shared ?? line),
    sharedWith: shared ?? null,
  };
};

const timeChips = (times, column) =>
  (times ?? [])
    .map((t) => {
      const isNew = t.includes('*');
      const shown = esc(t.replace('*', ''));
      return `<span class="schedule-tag" data-col="${column}" data-min="${shown}">${
        isNew ? '<span class="new-badge">НОВО</span>' : ''
      }${shown}</span>`;
    })
    .join('');

// The four day groups the app shows, in the app's own order. Which one is
// today's is decided in the browser, so the page can be cached without going
// stale on the next holiday.
const dayGroups = (sched) => [
  { id: 'holiday', label: 'ПРАЗНИК', color: '#e040fb', times: sched.holiday },
  { id: 'sunday', label: 'НЕДЕЛЯ', color: '#ff5252', times: sched.sunday },
  { id: 'saturday', label: 'СЪБОТА', color: '#ff9800', times: sched.saturday },
  {
    id: 'workdays',
    label: 'ДЕЛНИК',
    color: '#00ADB5',
    times: { fromPleven: sched.fromPleven, fromDestination: sched.fromDestination },
  },
].filter((g) => !!g.times);

const STYLES = `
:root{--primary-color:#00ADB5;--bg-color:#222831;--text-secondary:rgba(255,255,255,.7)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg-color);color:#fff;font-family:'Outfit','Inter',system-ui,-apple-system,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;padding-bottom:4rem}
a{color:var(--primary-color)}
.wrap{max-width:1200px;margin:0 auto;padding:1.5rem 1rem}
header.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-bottom:1.2rem;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.brand{font-weight:900;letter-spacing:2px;font-size:.8rem;color:rgba(255,255,255,.55);text-decoration:none}
.brand b{color:var(--primary-color)}
.back{display:inline-flex;align-items:center;gap:.6rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:.8rem 1.5rem;border-radius:14px;color:rgba(255,255,255,.6);font-weight:700;margin:2rem 0;text-decoration:none;transition:.3s;font-size:.9rem}
.back:hover{background:rgba(255,255,255,.1);color:#fff}
.crumbs{font-size:.75rem;color:rgba(255,255,255,.4);margin-bottom:1rem}
.crumbs a{text-decoration:none}
.route-card{width:100%;background:rgba(255,255,255,.02);border-radius:24px;padding:clamp(1.2rem,5vw,2.5rem);display:flex;flex-direction:column;gap:2rem}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:1.5rem;flex-wrap:wrap}
.kicker{font-size:.75rem;color:var(--primary-color);font-weight:800;text-transform:uppercase;letter-spacing:2px;margin-bottom:.3rem}
h1{font-size:1.6rem;font-weight:900;margin:0;letter-spacing:-.5px}
.sub{font-size:.75rem;color:#00FFF5;font-weight:600;max-width:260px;line-height:1.3;margin:.4rem 0 0}
.next{text-align:right;display:flex;flex-direction:column;gap:.5rem;margin-left:auto}
.next-label{font-size:.65rem;color:rgba(255,255,255,.4);font-weight:800;text-transform:uppercase}
.next-val{font-size:1rem;font-weight:900;display:flex;align-items:center;gap:.4rem;justify-content:flex-end;font-variant-numeric:tabular-nums}
.next-val.soon{color:#00E676}
.strip{background:rgba(0,173,181,.03);padding:1.6rem 1rem;border-radius:16px;border:1px solid rgba(0,173,181,.1)}
ol.stops{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;justify-content:center}
ol.stops li{display:flex;align-items:center;gap:.5rem;font-weight:800;font-size:clamp(.7rem,1.6vw,.9rem)}
ol.stops li:first-child,ol.stops li:last-child{color:var(--primary-color)}
ol.stops li:not(:last-child):after{content:'\\2192';color:var(--primary-color);opacity:.5;font-weight:400}
.dot{width:8px;height:8px;border-radius:50%;background:var(--primary-color);flex-shrink:0}
.prices{display:flex;gap:1rem;background:rgba(255,255,255,.03);padding:1rem;border-radius:16px}
.prices>div{flex:1;text-align:center}
.prices .sep{flex:0 0 1px;background:rgba(255,255,255,.1);padding:0}
.price-label{font-size:.7rem;color:rgba(255,255,255,.4);font-weight:700}
.price-val{font-weight:800}
.hint{padding:.8rem 1rem;background:rgba(0,173,181,.05);border-radius:12px;border:1px solid rgba(0,173,181,.2);font-size:.8rem;color:rgba(255,255,255,.8);margin:0}
.hint b{color:var(--primary-color);font-weight:700}
.sched{padding:1.2rem;background:rgba(255,255,255,.02);border-radius:16px;display:flex;flex-direction:column;gap:1.5rem}
.sched-head{margin:0;padding-bottom:.8rem;border-bottom:1px solid rgba(255,255,255,.05);text-align:center;font-size:.85rem;font-weight:900;color:var(--primary-color);text-transform:uppercase;letter-spacing:1px}
.group{margin-top:.5rem;padding:1rem;border-radius:12px;border:1px solid transparent}
.group.today{background:rgba(255,255,255,.03)}
.group-label{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin:0 0 1rem;display:flex;align-items:center;gap:.6rem}
.today-badge{font-size:.6rem;color:#000;padding:1px 6px;border-radius:4px;margin-left:5px;display:none}
.group.today .today-badge{display:inline-block}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem}
.dir{font-size:.65rem;color:rgba(255,255,255,.4);font-weight:800;margin-bottom:.5rem}
.tags{display:flex;flex-wrap:wrap;gap:.4rem}
.schedule-tag{padding:.3rem .6rem;background:rgba(255,255,255,.05);border-radius:8px;font-size:.8rem;font-weight:600;border:1px solid rgba(255,255,255,.1);position:relative;font-variant-numeric:tabular-nums}
.schedule-tag.next-bus-tag-active{background:rgba(46,204,113,.2);color:#2ecc71;border-color:#2ecc71;box-shadow:0 0 15px rgba(46,204,113,.3);animation:pulse-green 2s infinite ease-in-out}
@keyframes pulse-green{0%{box-shadow:0 0 5px rgba(46,204,113,.3);transform:scale(1)}50%{box-shadow:0 0 20px rgba(46,204,113,.6);transform:scale(1.05)}100%{box-shadow:0 0 5px rgba(46,204,113,.3);transform:scale(1)}}
.new-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#ff5252;color:#fff;font-size:.45rem;font-weight:900;padding:1px 4px;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.2)}
h2{font-size:1.1rem;font-weight:800;margin:2.5rem 0 1rem}
table{width:100%;border-collapse:collapse;font-size:.92rem;background:rgba(255,255,255,.02);border-radius:16px;overflow:hidden}
th,td{text-align:left;padding:.7rem 1rem;border-bottom:1px solid rgba(255,255,255,.06);font-weight:700}
th{font-weight:600;color:var(--text-secondary)}
td.price{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
tr:last-child th,tr:last-child td{border-bottom:none}
.cta{display:inline-block;background:var(--primary-color);color:#03181a;font-weight:900;text-decoration:none;padding:.85rem 1.5rem;border-radius:14px}
.note{font-size:.8rem;color:rgba(255,255,255,.45);margin-top:.8rem}
ul.lines{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.5rem}
ul.lines a{display:block;padding:.5rem .7rem;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;text-decoration:none;color:#fff;font-size:.85rem;font-weight:700}
ul.lines a:hover{border-color:var(--primary-color);color:var(--primary-color)}
footer{color:rgba(255,255,255,.45);font-size:.8rem;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,.08)}
@media(max-width:620px){.head{flex-direction:column}.next{text-align:left;margin-left:0}.next-val{justify-content:flex-start}}
`.trim();

// Runs in the browser: picks today's group, moves it to the top, marks the next
// departure and counts down to it. Everything it needs is already in the HTML,
// so the page is complete without it.
const CLOCK_SCRIPT = `
(function(){
  var el=document.getElementById('dary-line-data'); if(!el) return;
  var D=JSON.parse(el.textContent);
  var sched={weekday:D.weekday,saturday:D.saturday,sunday:D.sunday,holiday:D.holiday};
  function pad(n){return (n<10?'0':'')+n}
  function dayKey(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function isHoliday(d){return D.holidays.indexOf(dayKey(d))!==-1}
  function mins(t){var p=String(t).replace('*','').split(':');return parseInt(p[0],10)*60+parseInt(p[1],10)}
  function forDay(d){
    var day=d.getDay(),hol=isHoliday(d);
    if(hol&&sched.holiday) return sched.holiday;
    if((hol||day===0)&&sched.sunday) return sched.sunday;
    if(day===6&&sched.saturday) return sched.saturday;
    return sched.weekday;
  }
  function currentGroupId(d){
    var day=d.getDay(),hol=isHoliday(d);
    if(hol&&sched.holiday) return 'holiday';
    if((hol||day===0)&&sched.sunday) return 'sunday';
    if(!hol&&day===6&&sched.saturday) return 'saturday';
    if(!hol&&day>=1&&day<=5) return 'workdays';
    return null;
  }
  function nextToday(times,now){
    var best=null;
    for(var i=0;i<(times||[]).length;i++){var m=mins(times[i]); if(m>now&&(best===null||m<best.m)) best={m:m,t:String(times[i]).replace('*','')}}
    return best;
  }
  function countdown(dir,d){
    var now=d.getHours()*60+d.getMinutes();
    var today=nextToday(forDay(d)[dir],now);
    if(today) return today.m-now;
    var t=new Date(d.getTime()+86400000);
    var list=forDay(t)[dir]||[]; if(!list.length) return null;
    var first=null;
    for(var i=0;i<list.length;i++){var m=mins(list[i]); if(first===null||m<first) first=m}
    return (1440-now)+first;
  }
  function fmt(m){ if(m===null) return '--'; if(m>60) return Math.floor(m/60)+'ч '+(m%60)+'м'; return m+' мин' }
  var moved=false;
  function tick(){
    var d=new Date(), now=d.getHours()*60+d.getMinutes();
    var id=currentGroupId(d);
    document.querySelectorAll('.group').forEach(function(g){
      var on=g.getAttribute('data-group')===id;
      g.classList.toggle('today',on);
      if(on) g.style.borderColor=g.getAttribute('data-color')+'44';
      else g.style.borderColor='transparent';
      g.querySelectorAll('.schedule-tag').forEach(function(s){s.classList.remove('next-bus-tag-active')});
      if(on){
        ['fromPleven','fromDestination'].forEach(function(dir){
          var times=forDay(d)[dir]||[], nx=nextToday(times,now); if(!nx) return;
          var tag=g.querySelector('.schedule-tag[data-col="'+dir+'"][data-min="'+nx.t+'"]');
          if(tag) tag.classList.add('next-bus-tag-active');
        });
      }
    });
    if(!moved&&id){
      var cur=document.querySelector('.group[data-group="'+id+'"]');
      if(cur&&cur.parentNode) cur.parentNode.insertBefore(cur,cur.parentNode.firstElementChild);
      moved=true;
    }
    ['fromPleven','fromDestination'].forEach(function(dir){
      var out=document.querySelector('.next-val[data-dir="'+dir+'"]'); if(!out) return;
      var m=countdown(dir,d);
      out.textContent=fmt(m);
      out.classList.toggle('soon',m!==null&&m<=15);
    });
  }
  tick(); setInterval(tick,30000);
})();
`.trim();

const renderPage = ({ line, meta, sched, slug, prices, allLines, slugOf, holidays, disabledPct }) => {
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

  const groups = dayGroups(sched).map((g) => `      <div class="group" data-group="${g.id}" data-color="${g.color}">
        <h3 class="group-label" style="color:${g.color}">${g.label} <span class="today-badge" style="background:${g.color}">ДНЕС</span></h3>
        <div class="cols">
          <div>
            <div class="dir">ОТ ${esc(from.toUpperCase())}</div>
            <div class="tags">${timeChips(g.times.fromPleven, 'fromPleven')}</div>
          </div>
          <div>
            <div class="dir">ОТ ${esc(returnFrom.toUpperCase())}</div>
            <div class="tags">${timeChips(g.times.fromDestination, 'fromDestination')}</div>
          </div>
        </div>
      </div>`).join('\n');

  // The same sentence the app prints under the prices.
  const discountNote = meta?.priceCardStudent
    ? `Цените за хора с увреждания над 70.99% са с <b>-25%</b>, а за ученици цената е <b>${esc(meta.priceCardStudent)}</b>.`
    : DISABLED_ONLY_LINES.includes(line)
      ? 'Цените за хора с увреждания над 70.99% са с <b>-25%</b>.'
      : `Цените за ученици и пенсионери са <b>-50%</b> от тези цени, а за хора с увреждания над 70.99% са с <b>-${disabledPct}%</b>.`;

  const stops = (meta?.stops ?? [])
    .map((s) => `<li><span class="dot"></span>${esc(stopName(s))}</li>`)
    .join('');

  const priceRows = prices
    .map(([label, value]) => `<tr><th scope="row">${esc(label)}</th><td class="price">${esc(value)}</td></tr>`)
    .join('\n        ');

  const others = allLines
    .filter((l) => l !== line)
    .map((l) => `<li><a href="/linia/${slugOf(l)}/">${esc(l)}</a></li>`)
    .join('');

  const data = {
    weekday: { fromPleven: sched.fromPleven, fromDestination: sched.fromDestination },
    saturday: sched.saturday ?? null,
    sunday: sched.sunday ?? null,
    holiday: sched.holiday ?? null,
    holidays,
  };

  const offers = [
    ['Билет (еднопосочен)', priceNumber(meta?.priceSingle)],
    ...prices.map(([label, value]) => [label, priceNumber(value)]),
  ]
    .filter(([, price]) => price !== null)
    .map(([label, price]) => ({
      '@type': 'Offer',
      name: label,
      price,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url,
    }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: title,
        description,
        inLanguage: 'bg-BG',
        dateModified: BUILD_DATE,
        isPartOf: { '@type': 'WebSite', name: OPERATOR, url: `${SITE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Начало', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: pair, item: url },
        ],
      },
      {
        '@type': 'BusTrip',
        name: `Автобус ${pair}`,
        description,
        url,
        provider: {
          '@type': 'Organization',
          name: OPERATOR,
          url: `${SITE}/`,
          areaServed: { '@type': 'AdministrativeArea', name: 'Област Плевен' },
        },
        departureBusStop: { '@type': 'BusStop', name: from },
        arrivalBusStop: { '@type': 'BusStop', name: to },
        ...((meta?.stops ?? []).length
          ? {
            itinerary: {
              '@type': 'ItemList',
              itemListElement: meta.stops.map((stop, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: { '@type': 'BusStop', name: stopName(stop) },
              })),
            },
          }
          : {}),
        ...(offers.length ? { offers } : {}),
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

  <nav class="crumbs" aria-label="Навигация"><a href="/">Начало</a> / ${esc(line)}</nav>
  <a class="back" href="/">&#8592; Всички Дестинации</a>

  <article class="route-card">
    <div class="head">
      <div>
        <div class="kicker">ЛИНИЯ</div>
        <h1>${esc(line)}</h1>
        ${meta?.description ? `<p class="sub">${esc(meta.description)}</p>` : ''}
      </div>
      <div class="next">
        <div>
          <div class="next-label">ОТ ${esc(from.toUpperCase())} СЛЕД:</div>
          <div class="next-val" data-dir="fromPleven">--</div>
        </div>
        <div>
          <div class="next-label">ОТ ${esc(returnFrom.toUpperCase())} СЛЕД:</div>
          <div class="next-val" data-dir="fromDestination">--</div>
        </div>
      </div>
    </div>
${stops ? `    <div class="strip"><ol class="stops">${stops}</ol></div>\n` : ''}    <div class="prices">
      <div>
        <div class="price-label">БИЛЕТ</div>
        <div class="price-val">${esc(meta?.priceSingle || '---')}</div>
      </div>
      <div class="sep"></div>
      <div>
        <div class="price-label">КАРТА (Месец)</div>
        <div class="price-val">${esc(meta?.priceCard || '---')}</div>
      </div>
    </div>

    <p class="hint">${discountNote}</p>

    <div class="sched">
      <h2 class="sched-head">Пълно разписание на курса</h2>
${groups}
    </div>
  </article>
${sharedWith ? `
  <p class="note">${esc(line)} се обслужва от курсовете на линия ${esc(stopName(sharedWith))}, затова часовете в обратната посока са отбелязани от ${esc(returnFrom)}.</p>
` : ''}${priceRows ? `
  <h2>Цени по вид карта</h2>
  <table>
    <tbody>
        ${priceRows}
    </tbody>
  </table>
  <p class="note">Месечната карта важи за неограничен брой пътувания по линията до края на периода.</p>
` : ''}
  <h2>Как да си извадя карта</h2>
  <p class="note" style="margin-bottom:1rem">Картата се издава на място и се зарежда за избрания период. Условията и нужните документи са на началната страница.</p>
  <a class="cta" href="/">Към Дари Комерс</a>

  <h2>Други линии</h2>
  <ul class="lines">${others}</ul>

  <footer>
    <p>${esc(OPERATOR)} — превоз на пътници в област Плевен. <a href="/">darycommerce.com</a></p>
  </footer>
</div>
<script type="application/json" id="dary-line-data">${JSON.stringify(data)}</script>
<script>${CLOCK_SCRIPT}</script>
</body>
</html>
`;
};

export async function generateLinePages({
  outDir, routes, ROUTE_METADATA, SCHEDULES, cardPrice, routeSlug,
  holidays = [], disabledDiscountPct = () => 25,
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
      holidays, disabledPct: disabledDiscountPct(line),
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
