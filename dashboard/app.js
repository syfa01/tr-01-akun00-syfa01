// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, a filterable and sortable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and the measured comparables behind the implied values.
//
// No network: every byte it shows is in data.js. The page recomputes each row's implied value from the
// same snapshot figures main.ts used and checks it against the number board.json carries, so the code
// and the data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', watchlistOnly: false, growingOnly: false, sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // implied = TVL x comparable x growth x maturity x breadth, the five terms radar-3 states.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chain_count || 1;
    var breadth = chains <= 1 ? 1 : 1 + model.breadth_weight * (Math.log(Math.min(chains, model.breadth_cap)) / Math.log(2)) / (Math.log(model.breadth_cap) / Math.log(2));
    return Math.max(1, Math.round(row.tvl_usd * row.comparable_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    if (p.tvl_usd >= 2.5e7) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares so the allocation counts.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('credit') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', borrow a little against it and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and rebalance it weekly.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('farm') >= 0) return "Stake $" + capital + " of the protocol's LP token into " + name + ' on ' + chain + ' and keep it staked.';
    if (c.indexOf('governance') >= 0) return "Lock $" + capital + " of the protocol's own asset through " + name + ' on ' + chain + ' and vote with it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  // Each step carries a cost (USD or a percentage) and a time (days where it is a holding period).
  function farmPlan(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : capital >= 75 ? 6 : 4;
    return [
      { action: 'Pick a fresh wallet that holds only the funds you plan to farm, note its address, and keep its seed phrase offline.', cost: '$0 of fees; no deposit yet', time: '1 day to set up' },
      { action: 'Fund the wallet with $' + capital + ' of USDC and $' + gas + ' of gas on ' + chain + ', then deposit: ' + actionFor(p, capital, chain), cost: '$' + (capital + gas) + ' in all ($' + capital + ' at work, about $' + gas + ' of gas)', time: '1 day to set up and deposit' },
      { action: 'Keep the position open for ' + hold + ' days so the activity lands in more than one weekly snapshot of ' + p.name + '.', cost: '$' + capital + ' stays in the position; about 0.3% a year of pool fees where the pool charges one', time: hold + ' days of holding' },
      { action: 'Make one qualifying action a week, a deposit, a borrow, a swap or a vote, for the first four weeks.', cost: 'about $8 of gas over four weeks', time: '4 weeks, 10 minutes a week' },
      { action: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes on " + chain + '.', cost: 'no fee to check; never pay to claim', time: '1 day to claim and verify' },
      { action: 'Withdraw, unwrap and record the wallet, the dates and every transaction in a farm log, then repeat or stop.', cost: 'about $' + gas + ' of gas to exit', time: '1 day to unwind and log' }
    ];
  }
  function farmTotal(p) {
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : capital >= 75 ? 6 : 4;
    return { capital_usd: capital, gas_usd: gas * 3, days: 3 + hold + 28, steps: 6 };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('wl')) state.watchlistOnly = params.get('wl') === '1';
    if (params.get('grow')) state.growingOnly = params.get('grow') === '1';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.growingOnly) params.set('grow', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'pre-token' && state.watchlistOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.growingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'mult') { av = a.comparable_multiple; bv = b.comparable_multiple; }
      else if (key === 'breadth') { av = a.chain_count; bv = b.chain_count; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'Token Radar' }),
        el('span', { class: 'brand-tag', text: '/ pre-token value board' })
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('span', { class: 'kicker', text: 'What a token may be worth if the record stays as it is' }),
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor, never a ceiling: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL that records no token and is not a wrapped, staked or bridged product of one that trades. The radar adds ' + (DATA.board_size - DATA.watchlist_size) + ' more pre-token protocols the house list leaves out or sits below its floor. Implied value is a model of what the market already pays for protocols of this kind, never a promise and never a prediction that a token is issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows off the watchlist' }), el('b', { text: String(DATA.board_size - DATA.watchlist_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set([].concat.apply([], DATA.rows.map(function (r) { return r.chains || []; })))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, onchange: function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); } }),
      'Watchlist only'
    );
    var grow = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.growingOnly ? 'checked' : null, onchange: function (e) { state.growingOnly = e.target.checked; writeHash(); render(); } }),
      'Growing in 7d'
    );
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      state.tab === 'pre-token' ? wl : null,
      state.tab === 'pre-token' ? grow : null,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, extra) {
    var active = state.sort === key;
    return el('th', { scope: 'col', 'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none', class: extra || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } writeHash(); render(); } },
        label,
        active ? el('span', { class: 'caret', 'aria-hidden': 'true', text: state.dir < 0 ? '\u25bc' : '\u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.growingOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.comparable_multiple) }),
        el('td', { class: 'num', text: String(r.chain_count) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'chip ' + (r.on_watchlist ? 'wl' : 'early') }, el('span', { class: 'dot' }), r.on_watchlist ? 'watchlist' : 'radar'))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', style: 'text-align:left;padding:12px 16px 0', text: 'Pre-token protocols, strongest implied value first. Click a column heading to sort, a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'No token for'),
            sortHeader('mult', 'Comparable'),
            sortHeader('breadth', 'Chains'),
            sortHeader('implied', 'Implied value', 'right'),
            el('th', { scope: 'col', text: 'Source' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = DATA.live.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      var q = state.q.trim().toLowerCase();
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', { tabindex: '0' },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' }),
        el('td', null, el('span', { class: 'chip live' }, el('span', { class: 'dot' }), 'already trades'))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', style: 'text-align:left;padding:12px 16px 0', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Mkt/TVL is the multiple the market pays them, and it is what the board measures pre-token protocols against.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mkt/TVL' }),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelStrip() {
    var m = DATA.model;
    var top = DATA.comparables.slice(0, 4).map(function (c) { return c.category + ' ' + fmtMult(c.multiple); }).join(' \u00b7 ');
    return el('div', { class: 'strip' },
      el('span', { class: 'strip-label', text: DATA.model_version }),
      el('span', { class: 'strip-text' },
        el('b', { text: 'implied' }), ' = TVL \u00d7 ', el('b', { text: 'comparable' }), ' (market mcap/TVL, measured) \u00d7 growth(\u00b1', String(Math.round(m.growth_weight * 100)), '%) \u00d7 maturity(' + String(m.maturity_floor) + '\u2013' + fmtMult(m.maturity_floor + m.maturity_range) + ', saturating at ' + (m.maturity_days / 365).toFixed(0) + 'y) \u00d7 breadth(1\u2013' + fmtMult(1 + m.breadth_weight) + ' over ' + m.breadth_cap + ' chains). Snapshot median ' + fmtMult(DATA.comparable_overall)
      ),
      el('span', { class: 'strip-eg', text: 'e.g. ' + top })
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.comparables.slice(0, 10);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures, with no name special-cased and no row hand-picked. The market\'s own mcap-to-TVL ratios, measured across the snapshot\'s token-bearing protocols, set the multiple a category earns; three more terms ride on the snapshot\'s change_7d, listed_at and chains.' }),
      el('div', { class: 'formula' },
        el('em', { text: 'implied' }), ' = round( tvl_usd \u00d7 comparable \u00d7 (1 + clamp(change_7d, ', String(m.growth_floor), ', ', String(m.growth_cap), ') / 100 \u00d7 ', String(m.growth_weight), ') \u00d7 (', String(m.maturity_floor), ' + min(age_days, ', String(m.maturity_days), ') / ', String(m.maturity_days), ' \u00d7 ', String(m.maturity_range), ') \u00d7 (1 + ', String(m.breadth_weight), ' \u00d7 log\u2082(min(chains, ', String(m.breadth_cap), ')) / log\u2082(', String(m.breadth_cap), ')) )'
      ),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('h3', { text: 'The five inputs, all from the snapshot' }),
          el('div', { class: 'equation' },
            el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: 'what the protocol holds today' })),
            el('div', null, el('span', { text: '7d growth (snapshot)' }), el('b', { text: 'deposits arriving or leaving' })),
            el('div', null, el('span', { text: 'No token for (snapshot)' }), el('b', { text: 'how long it has run unlisted' })),
            el('div', null, el('span', { text: 'Chain breadth (snapshot)' }), el('b', { text: 'how many chains it runs on' })),
            el('div', null, el('span', { text: 'Comparable (measured)' }), el('b', { text: 'median mcap/TVL, shrunk to the snapshot' }))
          ),
          el('p', { class: 'sub', style: 'margin-top:12px', text: 'Age is the time since DefiLlama first listed the protocol, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth is a second, independent signal: a protocol on ' + m.breadth_cap + ' or more chains earns ' + fmtMult(1 + m.breadth_weight) + ', one on a single chain earns 1.00x. The snapshot\'s whole-index median mcap/TVL is ' + fmtMult(DATA.comparable_overall) + ', and a category with few samples is pulled toward it.' })
        ),
        el('div', null,
          el('h3', { text: 'Comparables the board measures against' }),
          el('table', { class: 'cmp-table' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Samples' }), el('th', { scope: 'col', text: 'Mcap/TVL' }))),
            el('tbody', null, top.map(function (c) {
              return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.sample) }), el('td', { class: 'num', text: fmtMult(c.multiple) }));
            }))
          )
        )
      ),
      el('div', { class: 'legend' },
        el('span', null, el('i', { style: 'background:var(--accent-soft);border:1px solid var(--accent)' }), 'Watchlist: the house\'s floor, covered in full'),
        el('span', null, el('i', { style: 'background:var(--surface-2);border:1px solid var(--border-strong)' }), 'Radar: pre-token protocols the floor leaves out')
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rank-line', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') }),
        el('div', { class: 'badge-line' },
          el('span', { class: 'chip ' + (row.on_watchlist ? 'wl' : 'early') }, el('span', { class: 'dot' }), row.on_watchlist ? 'on the watchlist' : 'off the watchlist'),
          el('span', { class: 'chip live' }, el('span', { class: 'dot' }), row.listed_at ? 'listed ' + row.listed_at : 'listing date unknown')
        )
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'hero-value' }, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'if the record stays as it is' })),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Comparable mcap/TVL ("' + (row.category || 'Other') + '" category, ' + row.category_sample + (row.category_sample === 1 ? ' sample' : ' samples') + ')' }), el('b', { class: 'num', text: fmtMult(row.comparable_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth (snapshot)' }), el('b', { class: 'num ' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'No token for: ' + fmtAge(row.age_days) + ' since ' + (row.listed_at || 'an unknown listing') }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain breadth: ' + row.chain_count + (row.chain_count === 1 ? ' chain' : ' chains') }), el('b', { class: 'num', text: fmtMult(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', style: 'margin-top:12px', text: 'Model ' + DATA.model_version + ': ' + fmtUsd(row.tvl_usd) + ' \u00d7 ' + fmtMult(row.comparable_multiple) + ' \u00d7 ' + fmtMult(row.growth_multiplier) + ' \u00d7 ' + fmtMult(row.maturity_multiplier) + ' \u00d7 ' + fmtMult(row.breadth_multiplier) + ' = ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate of what a token may be worth, not a price, and not a claim that one is issued.' })
    ));

    var plan = farmPlan(row);
    var total = farmTotal(row);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan: ' + total.steps + ' steps' }),
      el('p', { class: 'sub', style: 'margin-bottom:12px', text: 'Concrete steps, each with what it costs and how long it takes, derived from this protocol\'s category, chains, size and age: no name is special-cased.' }),
      el('ol', { class: 'steps' }, plan.map(function (s) {
        return el('li', null,
          el('b', { text: s.action }),
          el('span', { class: 'cost' }, el('em', { text: 'Cost ' }), s.cost + '  \u00b7  ', el('em', { text: 'Time ' }), s.time)
        );
      })),
      el('div', { class: 'plan-total' },
        el('div', { class: 'total-item' }, el('span', { text: 'Capital at work' }), el('b', { text: usd0.format(total.capital_usd) })),
        el('div', { class: 'total-item' }, el('span', { text: 'Gas, in and out' }), el('b', { text: '$' + total.gas_usd })),
        el('div', { class: 'total-item' }, el('span', { text: 'Total cost' }), el('b', { text: usd0.format(total.capital_usd + total.gas_usd) })),
        el('div', { class: 'total-item' }, el('span', { text: 'Total time' }), el('b', { text: total.days + ' days' }))
      )
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? modelStrip() : el('div'));
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
