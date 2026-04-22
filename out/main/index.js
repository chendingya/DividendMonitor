import { ipcMain, app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import axios, { AxiosError } from "axios";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "N/A";
}
function buildUnavailableEstimate(method, reason, input) {
  return {
    estimatedDividendPerShare: 0,
    estimatedFutureYield: 0,
    method,
    isAvailable: false,
    reason,
    inputs: {
      latestPrice: input.latestPrice ?? null,
      latestTotalShares: input.latestTotalShares ?? null,
      latestAnnualNetProfit: input.latestAnnualNetProfit ?? null,
      lastAnnualPayoutRatio: input.lastAnnualPayoutRatio ?? null,
      lastYearTotalDividendAmount: input.lastYearTotalDividendAmount ?? null
    },
    steps: [reason]
  };
}
function estimateFutureYield$1(input) {
  const baseInputs = {
    latestPrice: input.latestPrice ?? null,
    latestTotalShares: input.latestTotalShares ?? null,
    latestAnnualNetProfit: input.latestAnnualNetProfit ?? null,
    lastAnnualPayoutRatio: input.lastAnnualPayoutRatio ?? null,
    lastYearTotalDividendAmount: input.lastYearTotalDividendAmount ?? null
  };
  if (!(input.latestPrice > 0) || !(input.latestTotalShares > 0)) {
    const reason = "Missing latest price or total shares, future yield cannot be estimated";
    return {
      baseline: buildUnavailableEstimate("baseline", reason, input),
      conservative: buildUnavailableEstimate("conservative", reason, input)
    };
  }
  const canBuildBaseline = input.latestAnnualNetProfit > 0 && input.lastAnnualPayoutRatio > 0;
  const canBuildConservative = input.lastYearTotalDividendAmount > 0;
  const baseline = canBuildBaseline ? (() => {
    const baselineTotalDividend = input.latestAnnualNetProfit * input.lastAnnualPayoutRatio;
    const baselineDividendPerShare = baselineTotalDividend / input.latestTotalShares;
    const baselineYield = baselineDividendPerShare / input.latestPrice;
    return {
      estimatedDividendPerShare: baselineDividendPerShare,
      estimatedFutureYield: baselineYield,
      method: "baseline",
      isAvailable: true,
      reason: void 0,
      inputs: baseInputs,
      steps: [
        `latestAnnualNetProfit(${formatNumber(input.latestAnnualNetProfit)}) * lastAnnualPayoutRatio(${formatNumber(input.lastAnnualPayoutRatio)}) = estimatedTotalDividend(${formatNumber(baselineTotalDividend)})`,
        `estimatedTotalDividend(${formatNumber(baselineTotalDividend)}) / latestTotalShares(${formatNumber(input.latestTotalShares)}) = estimatedDividendPerShare(${formatNumber(baselineDividendPerShare)})`,
        `estimatedDividendPerShare(${formatNumber(baselineDividendPerShare)}) / latestPrice(${formatNumber(input.latestPrice)}) = estimatedFutureYield(${formatNumber(baselineYield)})`
      ]
    };
  })() : buildUnavailableEstimate(
    "baseline",
    "Missing latest annual net profit or last annual payout ratio, baseline estimate unavailable",
    input
  );
  const conservative = canBuildConservative ? (() => {
    const conservativeDividendPerShare = input.lastYearTotalDividendAmount / input.latestTotalShares;
    const conservativeYield = conservativeDividendPerShare / input.latestPrice;
    return {
      estimatedDividendPerShare: conservativeDividendPerShare,
      estimatedFutureYield: conservativeYield,
      method: "conservative",
      isAvailable: true,
      reason: void 0,
      inputs: baseInputs,
      steps: [
        `lastYearTotalDividendAmount(${formatNumber(input.lastYearTotalDividendAmount)}) / latestTotalShares(${formatNumber(input.latestTotalShares)}) = estimatedDividendPerShare(${formatNumber(conservativeDividendPerShare)})`,
        `estimatedDividendPerShare(${formatNumber(conservativeDividendPerShare)}) / latestPrice(${formatNumber(input.latestPrice)}) = estimatedFutureYield(${formatNumber(conservativeYield)})`
      ]
    };
  })() : buildUnavailableEstimate(
    "conservative",
    "Missing last year total dividend amount, conservative estimate unavailable",
    input
  );
  return {
    baseline,
    conservative
  };
}
const httpClient = axios.create({
  timeout: 1e4,
  headers: {
    Accept: "application/json,text/plain,*/*",
    "User-Agent": "DividendMonitor/0.1.0"
  }
});
function toHttpError(error, url) {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const statusPart = status == null ? "NETWORK" : `HTTP ${status}`;
    return new Error(`${statusPart} for ${url}`);
  }
  return error instanceof Error ? error : new Error(`Unknown request error for ${url}`);
}
async function getJson(url, config) {
  try {
    const response = await httpClient.get(url, config);
    return response.data;
  } catch (error) {
    throw toHttpError(error, url);
  }
}
function toNumber(value) {
  if (value == null || value === "" || value === "-") {
    return void 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : void 0;
}
function toIsoDate(value) {
  if (typeof value !== "string" || value.length < 10) {
    return void 0;
  }
  return value.slice(0, 10);
}
function extractYear(value) {
  const date = toIsoDate(value);
  if (!date) {
    return void 0;
  }
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : void 0;
}
const SEARCH_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";
const TENCENT_KLINE_LIMIT = 2e3;
function isAShareSymbol(symbol) {
  return /^(6|0|3)\d{5}$/.test(symbol.trim());
}
function toTencentSymbol(symbol) {
  return symbol.startsWith("6") ? `sh${symbol}` : `sz${symbol}`;
}
function parseTencentPriceHistory(rows) {
  return (rows ?? []).map((row) => {
    const [date, _open, close] = row;
    const closePrice = toNumber(close);
    if (!date || closePrice == null) {
      return null;
    }
    return {
      date: toIsoDate(date) ?? date,
      close: closePrice
    };
  }).filter((point) => point != null);
}
function parseTencentMarketSnapshot(symbol, payload) {
  const key = toTencentSymbol(symbol);
  const data = payload.data?.[key];
  const quoteFields = data?.qt?.[key];
  const priceHistory = parseTencentPriceHistory(data?.qfqday ?? data?.day);
  if (!quoteFields || quoteFields.length < 58) {
    throw new Error(`Tencent market data is incomplete for ${symbol}`);
  }
  const latestPrice = toNumber(quoteFields[3]);
  if (latestPrice == null) {
    throw new Error(`Tencent latest price is missing for ${symbol}`);
  }
  const marketCapInYi = toNumber(quoteFields[44]);
  const peRatio = toNumber(quoteFields[39]);
  const totalSharesRaw = toNumber(quoteFields[72]) ?? toNumber(quoteFields[73]) ?? toNumber(quoteFields[76]);
  return {
    name: quoteFields[1] || symbol,
    symbol: quoteFields[2] || symbol,
    latestPrice,
    marketCap: marketCapInYi == null ? void 0 : marketCapInYi * 1e8,
    peRatio: peRatio == null || peRatio <= 0 ? void 0 : peRatio,
    totalShares: totalSharesRaw == null || totalSharesRaw <= 0 ? void 0 : totalSharesRaw,
    priceHistory
  };
}
function findReferenceClosePrice(priceHistory, anchorDate) {
  if (!anchorDate) {
    return void 0;
  }
  const normalized = anchorDate.slice(0, 10);
  for (let index = priceHistory.length - 1; index >= 0; index -= 1) {
    const point = priceHistory[index];
    if (point.date < normalized) {
      return point.close;
    }
  }
  return priceHistory.find((point) => point.date === normalized)?.close;
}
function pickLatestAnnualDividendRecord(records) {
  return [...records].filter((record) => toIsoDate(record.REPORT_DATE)?.endsWith("-12-31")).sort((a, b) => (toIsoDate(b.REPORT_DATE) ?? "").localeCompare(toIsoDate(a.REPORT_DATE) ?? ""))[0];
}
class EastmoneyAShareDataSource {
  async search(keyword) {
    const normalized = keyword.trim();
    if (!normalized) {
      return [];
    }
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(normalized)}&type=14&token=${SEARCH_TOKEN}&count=10`;
    const payload = await getJson(url);
    const quotations = payload.Quotations ?? [];
    return quotations.filter((item) => item.Code && item.Name).filter((item) => (item.SecurityTypeName ?? "").includes("A")).map((item) => ({
      symbol: item.Code,
      name: item.Name,
      market: "A_SHARE"
    }));
  }
  async getTencentMarketSnapshot(symbol) {
    const qqSymbol = toTencentSymbol(symbol);
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqSymbol},day,,,${TENCENT_KLINE_LIMIT},qfq`;
    const payload = await getJson(url, {
      headers: {
        Referer: "https://gu.qq.com/",
        "User-Agent": "Mozilla/5.0 DividendMonitor/0.1.0"
      }
    });
    return parseTencentMarketSnapshot(symbol, payload);
  }
  async getDividendRecords(symbol) {
    const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")`)}&pageNumber=1&pageSize=200&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB`;
    const payload = await getJson(url);
    return payload.result?.data ?? [];
  }
  async getDetail(symbol) {
    if (!isAShareSymbol(symbol)) {
      throw new Error(`Only A-share 6-digit symbols are supported: ${symbol}`);
    }
    const [marketResult, dividendResult] = await Promise.allSettled([
      this.getTencentMarketSnapshot(symbol),
      this.getDividendRecords(symbol)
    ]);
    if (marketResult.status !== "fulfilled") {
      throw marketResult.reason instanceof Error ? marketResult.reason : new Error(`Failed to load market data for ${symbol}`);
    }
    const market = marketResult.value;
    const priceHistory = market.priceHistory;
    const dividendRecords = dividendResult.status === "fulfilled" ? dividendResult.value : [];
    const dividendEvents = dividendRecords.filter((record) => (record.ASSIGN_PROGRESS ?? "").includes("实施")).map((record) => {
      const dividendPerShare = (toNumber(record.PRETAX_BONUS_RMB) ?? 0) / 10;
      const totalShares = toNumber(record.TOTAL_SHARES);
      const totalDividendAmount = dividendPerShare > 0 && totalShares != null ? dividendPerShare * totalShares : void 0;
      const netProfit = totalShares != null && (toNumber(record.BASIC_EPS) ?? 0) > 0 ? totalShares * (toNumber(record.BASIC_EPS) ?? 0) : void 0;
      const payoutRatio = totalDividendAmount != null && netProfit != null && netProfit > 0 ? totalDividendAmount / netProfit : void 0;
      const recordDate = toIsoDate(record.EQUITY_RECORD_DATE);
      const exDate = toIsoDate(record.EX_DIVIDEND_DATE);
      const referenceClosePrice = findReferenceClosePrice(priceHistory, recordDate ?? exDate) ?? (dividendPerShare > 0 && (toNumber(record.DIVIDENT_RATIO) ?? 0) > 0 ? dividendPerShare / (toNumber(record.DIVIDENT_RATIO) ?? 0) : 0);
      return {
        year: extractYear(record.EX_DIVIDEND_DATE) ?? extractYear(record.NOTICE_DATE) ?? 0,
        fiscalYear: extractYear(record.REPORT_DATE),
        announceDate: toIsoDate(record.PLAN_NOTICE_DATE),
        recordDate,
        exDate,
        payDate: exDate,
        dividendPerShare,
        totalDividendAmount,
        payoutRatio,
        referenceClosePrice,
        bonusSharePer10: toNumber(record.BONUS_RATIO),
        transferSharePer10: toNumber(record.BONUS_IT_RATIO),
        source: "eastmoney"
      };
    }).filter((event) => event.year > 0 && event.dividendPerShare > 0 && event.referenceClosePrice > 0).sort((a, b) => (a.exDate ?? "").localeCompare(b.exDate ?? ""));
    const latestAnnualRecord = pickLatestAnnualDividendRecord(dividendRecords);
    const latestAnnualTotalShares = toNumber(latestAnnualRecord?.TOTAL_SHARES);
    const latestAnnualBasicEps = toNumber(latestAnnualRecord?.BASIC_EPS);
    const latestAnnualNetProfit = latestAnnualTotalShares != null && latestAnnualBasicEps != null ? latestAnnualTotalShares * latestAnnualBasicEps : 0;
    const lastYearTotalDividendAmount = (toNumber(latestAnnualRecord?.PRETAX_BONUS_RMB) ?? 0) / 10 * (latestAnnualTotalShares ?? 0);
    const lastAnnualPayoutRatio = latestAnnualNetProfit > 0 ? lastYearTotalDividendAmount / latestAnnualNetProfit : 0;
    return {
      stock: {
        symbol: market.symbol,
        name: dividendRecords[0]?.SECURITY_NAME_ABBR ?? market.name,
        market: "A_SHARE",
        latestPrice: market.latestPrice,
        marketCap: market.marketCap,
        peRatio: market.peRatio,
        totalShares: market.totalShares ?? latestAnnualTotalShares
      },
      dividendEvents,
      priceHistory,
      latestAnnualNetProfit,
      latestTotalShares: market.totalShares ?? latestAnnualTotalShares ?? 0,
      lastAnnualPayoutRatio,
      lastYearTotalDividendAmount,
      dataSource: "eastmoney"
    };
  }
  async compare(symbols) {
    return Promise.all(symbols.map((symbol) => this.getDetail(symbol)));
  }
  async listWatchlist() {
    return [];
  }
}
function getAppConfig() {
  return { dataSourceMode: "eastmoney" };
}
function createAShareDataSource(mode = getAppConfig().dataSourceMode) {
  if (mode !== "eastmoney") {
    throw new Error(`Unsupported A-share data source mode: ${mode}`);
  }
  return new EastmoneyAShareDataSource();
}
class StockRepository {
  constructor(dataSource = createAShareDataSource()) {
    this.dataSource = dataSource;
  }
  async search(keyword) {
    return this.dataSource.search(keyword);
  }
  async getDetail(symbol) {
    return this.dataSource.getDetail(symbol);
  }
  async compare(symbols) {
    return this.dataSource.compare(symbols);
  }
  async listWatchlist() {
    return this.dataSource.listWatchlist();
  }
}
async function estimateFutureYield(symbol) {
  const repository = new StockRepository();
  const source = await repository.getDetail(symbol);
  const estimates = estimateFutureYield$1({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  });
  return {
    symbol,
    estimates: [estimates.baseline, estimates.conservative]
  };
}
const NATURAL_YEAR_YIELD_BASIS = "Event-level yield accumulation by ex-dividend year, using dividend per share divided by the close before the record date or a source-provided equivalent reference price";
function buildHistoricalYields(events) {
  const grouped = /* @__PURE__ */ new Map();
  for (const event of events) {
    const current = grouped.get(event.year) ?? { year: event.year, yield: 0, events: 0 };
    const eventYield = event.referenceClosePrice > 0 ? event.dividendPerShare / event.referenceClosePrice : 0;
    current.yield += eventYield;
    current.events += 1;
    grouped.set(event.year, current);
  }
  return [...grouped.values()].sort((a, b) => a.year - b.year);
}
async function getHistoricalYield(symbol) {
  const repository = new StockRepository();
  const source = await repository.getDetail(symbol);
  return {
    symbol,
    basis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields: buildHistoricalYields(source.dividendEvents),
    dividendEvents: source.dividendEvents
  };
}
function normalizeDate(date) {
  return date.slice(0, 10);
}
function findFirstPriceOnOrAfter(priceHistory, targetDate) {
  return priceHistory.find((point) => point.date >= targetDate);
}
function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diff / (24 * 60 * 60 * 1e3)));
}
function runDividendReinvestmentBacktest$1(input) {
  const priceHistory = [...input.priceHistory].map((point) => ({ ...point, date: normalizeDate(point.date) })).sort((a, b) => a.date.localeCompare(b.date));
  if (priceHistory.length === 0) {
    throw new Error(`No historical price data available for ${input.symbol}`);
  }
  const requestedBuyDate = normalizeDate(input.buyDate);
  const earliestPoint = priceHistory[0];
  if (requestedBuyDate < earliestPoint.date) {
    throw new Error(
      `Historical price data for ${input.symbol} currently starts at ${earliestPoint.date}; cannot backtest from ${requestedBuyDate}`
    );
  }
  const buyPoint = findFirstPriceOnOrAfter(priceHistory, requestedBuyDate);
  if (!buyPoint) {
    throw new Error(`No trading price available on or after ${input.buyDate}`);
  }
  const finalPoint = priceHistory[priceHistory.length - 1];
  const initialShares = input.initialShares ?? 100;
  const initialCost = initialShares * buyPoint.close;
  let shares = initialShares;
  let totalDividendsReceived = 0;
  let reinvestCount = 0;
  const transactions = [
    {
      type: "BUY",
      date: buyPoint.date,
      price: buyPoint.close,
      sharesDelta: initialShares,
      sharesAfter: shares,
      note: "Buy at the first available close price on or after the requested buy date"
    }
  ];
  const dividendEvents = [...input.dividendEvents].filter((event) => {
    const eventAnchor = event.payDate ?? event.exDate;
    return Boolean(eventAnchor) && normalizeDate(eventAnchor) >= buyPoint.date && normalizeDate(eventAnchor) <= finalPoint.date;
  }).sort((a, b) => (a.exDate ?? a.payDate ?? "").localeCompare(b.exDate ?? b.payDate ?? ""));
  for (const event of dividendEvents) {
    const entitledShares = shares;
    const shareRatio = ((event.bonusSharePer10 ?? 0) + (event.transferSharePer10 ?? 0)) / 10;
    if (shareRatio > 0) {
      const addedShares = entitledShares * shareRatio;
      const adjustDate = normalizeDate(event.exDate ?? event.payDate ?? buyPoint.date);
      shares += addedShares;
      transactions.push({
        type: "BONUS_ADJUSTMENT",
        date: adjustDate,
        sharesDelta: addedShares,
        sharesAfter: shares,
        note: `Bonus or transfer shares applied at ${(shareRatio * 100).toFixed(2)}% of entitled shares`
      });
    }
    if (!(event.dividendPerShare > 0) || !event.payDate) {
      continue;
    }
    const dividendDate = normalizeDate(event.payDate);
    const cashAmount = entitledShares * event.dividendPerShare;
    totalDividendsReceived += cashAmount;
    transactions.push({
      type: "DIVIDEND",
      date: dividendDate,
      cashAmount,
      sharesDelta: 0,
      sharesAfter: shares,
      note: `Cash dividend received for fiscal year ${event.fiscalYear ?? event.year}`
    });
    const reinvestPoint = findFirstPriceOnOrAfter(priceHistory, dividendDate);
    if (!reinvestPoint || !(reinvestPoint.close > 0)) {
      continue;
    }
    const newShares = cashAmount / reinvestPoint.close;
    shares += newShares;
    reinvestCount += 1;
    transactions.push({
      type: "REINVEST",
      date: reinvestPoint.date,
      price: reinvestPoint.close,
      cashAmount,
      sharesDelta: newShares,
      sharesAfter: shares,
      note: "Reinvest the full cash dividend at the next available close price"
    });
  }
  const finalMarketValue = shares * finalPoint.close;
  const totalReturn = finalMarketValue / initialCost - 1;
  const holdingDays = daysBetween(buyPoint.date, finalPoint.date);
  const annualizedReturn = Math.pow(finalMarketValue / initialCost, 365 / holdingDays) - 1;
  return {
    buyDate: buyPoint.date,
    finalDate: finalPoint.date,
    buyPrice: buyPoint.close,
    initialCost,
    finalShares: shares,
    totalDividendsReceived,
    reinvestCount,
    finalMarketValue,
    totalReturn,
    annualizedReturn,
    assumptions: [
      "Use the first available trading close on or after the requested buy date",
      "Cash dividends are received on pay date and fully reinvested at the next available close",
      "Bonus shares and transfer shares increase holdings separately from cash dividends"
    ],
    transactions
  };
}
async function runDividendReinvestmentBacktest(symbol, buyDate) {
  const repository = new StockRepository();
  const source = await repository.getDetail(symbol);
  const result = runDividendReinvestmentBacktest$1({
    symbol,
    buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents
  });
  return {
    symbol,
    ...result
  };
}
function registerCalculationChannels() {
  ipcMain.handle("calculation:historical-yield", async (_event, symbol) => {
    return getHistoricalYield(symbol);
  });
  ipcMain.handle("calculation:estimate-future-yield", async (_event, symbol) => {
    return estimateFutureYield(symbol);
  });
  ipcMain.handle("calculation:run-dividend-reinvestment-backtest", async (_event, symbol, buyDate) => {
    return runDividendReinvestmentBacktest(symbol, buyDate);
  });
}
async function compareStocks(symbols) {
  const repository = new StockRepository();
  const sources = await repository.compare(symbols);
  return sources.map((source) => {
    const yearlyYields = buildHistoricalYields(source.dividendEvents);
    const estimates = estimateFutureYield$1({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    });
    const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1);
    return {
      symbol: source.stock.symbol,
      name: source.stock.name,
      latestPrice: source.stock.latestPrice,
      marketCap: source.stock.marketCap,
      peRatio: source.stock.peRatio,
      averageYield,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield
    };
  });
}
async function getStockDetail(symbol) {
  const repository = new StockRepository();
  const source = await repository.getDetail(symbol);
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const estimates = estimateFutureYield$1({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  });
  return {
    symbol: source.stock.symbol,
    name: source.stock.name,
    market: source.stock.market,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    totalShares: source.stock.totalShares,
    dataSource: source.dataSource,
    yieldBasis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: estimates.baseline,
    futureYieldEstimates: [estimates.baseline, estimates.conservative]
  };
}
async function searchStocks(keyword) {
  const repository = new StockRepository();
  return repository.search(keyword);
}
function registerStockChannels() {
  ipcMain.handle("stock:search", async (_event, keyword) => {
    return searchStocks(keyword);
  });
  ipcMain.handle("stock:get-detail", async (_event, symbol) => {
    return getStockDetail(symbol);
  });
  ipcMain.handle("stock:compare", async (_event, symbols) => {
    return compareStocks(symbols);
  });
}
async function listWatchlist() {
  const repository = new StockRepository();
  const sources = await repository.listWatchlist();
  return sources.map((source) => {
    const estimates = estimateFutureYield$1({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    });
    return {
      symbol: source.stock.symbol,
      name: source.stock.name,
      market: source.stock.market,
      latestPrice: source.stock.latestPrice,
      peRatio: source.stock.peRatio,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield
    };
  });
}
function registerWatchlistChannels() {
  ipcMain.handle("watchlist:list", async () => {
    return listWatchlist();
  });
}
function registerIpcHandlers() {
  registerCalculationChannels();
  registerStockChannels();
  registerWatchlistChannels();
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
function createWindow() {
  const mainWindow = new BrowserWindow({
    title: "收息佬",
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: join(__dirname$1, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname$1, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
