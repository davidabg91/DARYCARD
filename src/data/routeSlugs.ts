// Latin URL slug for a line, so every line gets its own indexable page at
// /linia/<slug>/. Derived from the official Bulgarian transliteration rather
// than a hand-kept list, so a line added to ROUTE_METADATA gets an address on
// its own. generate-line-pages.mjs writes the pages from the same function, so
// the links on the home page and the generated files can never drift apart.
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

export const routeSlug = (route: string): string =>
  route
    .toLowerCase()
    .split('')
    .map(ch => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// The address of a line's own page. Kept with a trailing slash because the
// pages are written as <slug>/index.html on static hosting.
export const linePagePath = (route: string): string => `/linia/${routeSlug(route)}/`;
