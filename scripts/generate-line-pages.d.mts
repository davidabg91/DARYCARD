// Types for the line-page generator, which vite.config.ts calls at build time.
// The data it receives is passed straight through from the app's own modules.

export interface GenerateLinePagesOptions {
  /** Build output directory the pages are written into, e.g. 'dist'. */
  outDir: string;
  /** The lines to publish, in the order the home page lists them. */
  routes: string[];
  ROUTE_METADATA: Record<string, {
    stops: string[];
    priceSingle: string;
    priceCard: string;
    description?: string;
  }>;
  SCHEDULES: Record<string, unknown>;
  cardPrice: (route: string, cardType?: string) => number | null;
  routeSlug: (route: string) => string;
  /** Holiday dates as YYYY-MM-DD, embedded so the page can spot a holiday itself. */
  holidays?: string[];
  disabledDiscountPct?: (route: string) => number;
}

export function generateLinePages(
  options: GenerateLinePagesOptions,
): Promise<{ pages: number }>;
