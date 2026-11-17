// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// What the radar is for. A protocol's launch is the token it may issue one day. This model asks what a
// token would be worth if the protocol's record stayed as it is, and prints the steps a reader would
// take to farm it today. It predicts nothing: no flag, no date, no promise, only an implied value per
// protocol and the arithmetic behind it.
//
// What it reads. Every figure comes from the sealed snapshot alone:
//   - `tvl_usd`, `change_7d`, `listed_at` and `chains` for the pre-token protocol being scored;
//   - the market's own `mcap_usd`/`tvl_usd` ratios, computed across the token-bearing protocols in the
//     snapshot, as the comparable a pre-token protocol's token would price against.
// No protocol name is special-cased. The same function scores every row.
//
// The watchlist. The house's rule kept a floor: a protocol with a TVL at or above `floor_usd`, no token
// on record, and not a wrapped, staked or bridged product of one that trades. The snapshot carries that
// list as `watchlist`, and this entry reads it, byte for byte: it is the floor, and it is never a
// ceiling. The board covers every slug on it and adds pre-token protocols below the floor (the early
// radar) and pre-token protocols the house left out.
//
// The value model (radar-3). One function of the snapshot figures scores every protocol; no name is
// special-cased. Four multipliers ride on the protocol's own TVL:
//
//   comparable   = shrunk median of mcap_usd/tvl_usd over the snapshot's token-bearing protocols in the
//                  protocol's own category; a category with few samples is pulled toward the whole
//                  snapshot's median, and the result is held inside a sane band. This is the multiple
//                  the market already pays for a protocol of this kind, measured, not assumed.
//   growthMult   = 1 + clamp(change_7d, -60, 120) / 100 x GROWTH_WEIGHT
//   maturityMult = MATURITY_FLOOR + min(age_days, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//                  (age_days is the time since DefiLlama first listed it; unknown uses the fallback)
//   breadthMult  = 1 + BREADTH_WEIGHT x log2(min(chains, BREADTH_CAP)) / log2(BREADTH_CAP)
//                  (a second, independent signal: how many distinct chains the protocol runs on)
//   implied      = max(1, round(tvl_usd x comparable x growthMult x maturityMult x breadthMult))
//
// Why each term. TVL is what the protocol holds today, the base the market prices. The comparable is
// the market's own mcap/TVL for its category, so a curator is not priced like a DEX behind a larger TVL.
// The growth term rewards deposits arriving and discounts one bleeding them. The maturity term rewards a
// protocol that has run with no token for years over one listed last month: the longer a team ships with
// nothing to trade, the more of the record a token would be pricing. The breadth term is a second,
// independent signal: a protocol deployed across many chains has proven a multi-chain footprint that a
// single-chain one has not, so it earns a modest premium that neither growth nor age supplies. Every
// input is a field of the snapshot, so the board's ranking follows the data, never a list of names.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** The weight the seven-day growth carries in the implied value. */
  growth_weight: number;
  /** The growth reading is clamped to this band before it is weighted. */
  growth_floor: number;
  growth_cap: number;
  /** The maturity term: its floor, its span and the age at which it saturates. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** Age used when the snapshot carries no `listed_at`. */
  unknown_age_days: number;
  /** The second signal: the weight the chain-breadth term carries, and the chain count at which it saturates. */
  breadth_weight: number;
  breadth_cap: number;
  /** How many observations of the whole snapshot a category's own ratio is shrunk against. */
  comparable_prior: number;
  /** The band the comparable multiple is held inside. */
  comparable_floor: number;
  comparable_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 540,
  breadth_weight: 0.28,
  breadth_cap: 16,
  comparable_prior: 3,
  comparable_floor: 0.02,
  comparable_cap: 1.5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comparable_multiple: number;
    category_sample: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    chain_count: number;
    age_days: number | null;
  };
  farm_steps: string[];
  /** The plan's totals, so the page can show one cost and one time for the whole protocol. */
  farm_total: {
    capital_usd: number;
    gas_usd: number;
    days: number;
    steps: number;
  };
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  comparable_multiple: number;
  category_sample: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  chain_count: number;
  farm_total: {
    capital_usd: number;
    gas_usd: number;
    days: number;
    steps: number;
  };
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's measured comparable: the multiple the market pays, and how many samples give it. */
export interface Comparable {
  category: string;
  multiple: number;
  sample: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comparable_overall: number;
  comparables: Comparable[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a numeric list; 0 when it is empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Whether a protocol records a token that trades: DefiLlama carries a CoinGecko id or a ticker for it. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol records no token at all: no CoinGecko id, no ticker, no market cap. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/**
 * The market's comparable multiple per category, measured from the snapshot's own token-bearing
 * protocols: the median `mcap_usd / tvl_usd` in each category, shrunk toward the whole snapshot's median
 * when the category has few samples, then held inside `[comparable_floor, comparable_cap]`. The whole
 * snapshot's median is the fallback for a category with no sample.
 */
export function comparables(protocols: SnapshotProtocol[], model: ModelConstants): { overall: number; byCategory: Map<string, Comparable> } {
  const overallValues: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of protocols) {
    if (!hasToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    overallValues.push(ratio);
    const key = p.category ?? '(none)';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const raw = median(overallValues);
  const overall = Math.min(model.comparable_cap, Math.max(model.comparable_floor, raw > 0 ? raw : 0.2));
  const byCategory = new Map<string, Comparable>();
  for (const [category, values] of perCategory) {
    const own = median(values);
    const n = values.length;
    const shrunk = n > 0 ? (n * own + model.comparable_prior * overall) / (n + model.comparable_prior) : overall;
    const multiple = Math.min(model.comparable_cap, Math.max(model.comparable_floor, shrunk));
    byCategory.set(category, { category, multiple, sample: n });
  }
  return { overall, byCategory };
}

/** The comparable multiple a protocol's category earns, with the sample count behind it. */
export function comparableFor(p: SnapshotProtocol, comps: { overall: number; byCategory: Map<string, Comparable> }): Comparable {
  const hit = comps.byCategory.get(p.category ?? '(none)');
  return hit ?? { category: p.category ?? '(none)', multiple: comps.overall, sample: 0 };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: { overall: number; byCategory: Map<string, Comparable> },
): { implied: number; comparable: number; categorySample: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; chainCount: number; age: number | null } {
  const comp = comparableFor(protocol, comps);
  // Round the comparable the row publishes before scoring with it, so the board's number and the page's
  // recomputation (which only has the rounded figure) are the same arithmetic.
  const comparable = round4(comp.multiple);
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  // The second, independent signal: chain breadth. One chain earns nothing; each doubling of the chain
  // count up to `breadth_cap` earns a share of `breadth_weight`, so a many-chain protocol carries a
  // modest premium neither the growth nor the maturity term supplies.
  const chainCount = Math.max(1, protocol.chains.length);
  const breadthMult = chainCount <= 1 ? 1 : 1 + model.breadth_weight * (Math.log2(Math.min(chainCount, model.breadth_cap)) / Math.log2(model.breadth_cap));
  const base = protocol.tvl_usd * comparable;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, comparable, categorySample: comp.sample, growthPct, growthMult, maturityMult, breadthMult, chainCount, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a product of another protocol's token rather than a protocol of their own. */
const PRODUCT_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** An exchange's name: a protocol that begins with one is that exchange's own product. */
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** A wrapped, staked or staking product in a name, whatever its case, as a whole word. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: it records no token, and its name and category do not
 * mark it as a wrapped, staked or bridged product of a protocol whose token already trades, an
 * exchange's own product, or a versioned pool. The house's watchlist is narrower still (it also drops a
 * protocol DefiLlama gives a parent), and the board reads the house's list directly for coverage; this
 * broader filter is what the early radar's extra rows are held to.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !PRODUCT_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !EXCHANGE.test(p.name) && !WRAPPED_WORD.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = comparables(snapshot.protocols, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  const onWatchlist = new Set(snapshot.watchlist);
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  // The stragglers: pre-token protocols above the floor that the house's list left out (a parent is
  // recorded for them, or their name trips a marker). They are no worse a subject than a listed one, so
  // the board carries the largest by TVL, up to what the gate allows.
  const stragglers = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of stragglers) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, model, comps);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: onWatchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      comparable_multiple: round4(s.comparable),
      category_sample: s.categorySample,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      chain_count: s.chainCount,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
    farm_total: farmTotal(s.p, s.age),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares so the allocation counts.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow a little against it and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and rebalance it weekly.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('farm')) return `Stake $${capital} of the protocol's LP token into ${name} on ${chain} and keep it staked.`;
  if (c.includes('governance')) return `Lock $${capital} of the protocol's own asset through ${name} on ${chain} and vote with it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: concrete steps, each an action with a cost (USD or a percentage) and a time
 * (days where it is a holding period). The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names, and `farmTotal` sums it.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : capital >= 75 ? 6 : 4;
  const feePct = 0.3;
  return [
    {
      text: `Pick a fresh wallet that holds only the funds you plan to farm, note its address, and keep its seed phrase offline.`,
      cost: '$0 of fees; no deposit yet',
      time: '1 day to set up',
    },
    {
      text: `Fund the wallet with $${capital} of USDC and $${gas} of gas on ${chain}, then deposit: ${action}`,
      cost: `$${capital + gas} in all ($${capital} at work, about $${gas} of gas)`,
      time: '1 day to set up and deposit',
    },
    {
      text: `Keep the position open for ${hold} days so the activity lands in more than one weekly snapshot of ${p.name}.`,
      cost: `$${capital} stays in the position; about $${feePct}% a year of pool fees where the pool charges one`,
      time: `${hold} days of holding`,
    },
    {
      text: `Make one qualifying action a week, a deposit, a borrow, a swap or a vote, for the first four weeks.`,
      cost: `about $8 of gas over four weeks`,
      time: '4 weeks, 10 minutes a week',
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes on ${chain}.`,
      cost: 'no fee to check; never pay to claim',
      time: '1 day to claim and verify',
    },
    {
      text: `Withdraw, unwrap and record the wallet, the dates and every transaction in a farm log, then repeat or stop.`,
      cost: `about $${gas} of gas to exit`,
      time: '1 day to unwind and log',
    },
  ];
}

/** The plan's totals: the capital at work, the gas, the days it ties up and how many steps it takes. */
export function farmTotal(p: SnapshotProtocol, age: number | null): { capital_usd: number; gas_usd: number; days: number; steps: number } {
  const capital = capitalFor(p);
  const gas = capital >= 150 ? 8 : capital >= 75 ? 6 : 4;
  const hold = holdDaysFor(age);
  // Deposit (1) + hold + one weekly action for four weeks + claim (1) + unwind (1).
  const days = 3 + hold + 28;
  return { capital_usd: capital, gas_usd: gas * 3, days, steps: farmSteps(p, age).length };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => hasToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    comparable_multiple: row.model.comparable_multiple,
    category_sample: row.model.category_sample,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    chain_count: row.model.chain_count,
    farm_total: row.farm_total,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = comparables(snapshot.protocols, model);
  const early = board.filter((r) => !r.on_watchlist).length;
  const comparablesList = [...comps.byCategory.values()]
    .filter((c) => c.sample > 0)
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comparable_overall: round4(comps.overall),
    comparables: comparablesList.map((c) => ({ category: c.category, multiple: round4(c.multiple), sample: c.sample })),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value over the gate's cap`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
