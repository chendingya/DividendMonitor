import { app, ipcMain, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import axios, { AxiosError } from "axios";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const LOCAL_HTTP_API_ORIGIN = "http://127.0.0.1:3210";
function normalizeAssetCode(code) {
  return code.trim();
}
function buildAssetKey(assetType, market, code) {
  return `${assetType}:${market}:${normalizeAssetCode(code)}`;
}
function buildStockAssetKey(symbol) {
  return buildAssetKey("STOCK", "A_SHARE", symbol);
}
function parseAssetKey(assetKey) {
  const normalized = assetKey.trim();
  if (!normalized) {
    return null;
  }
  const [assetType, market, ...codeParts] = normalized.split(":");
  const code = codeParts.join(":").trim();
  if (!assetType || !market || !code) {
    return null;
  }
  if (!["STOCK", "ETF", "FUND"].includes(assetType)) {
    return null;
  }
  if (market !== "A_SHARE") {
    return null;
  }
  return {
    assetType,
    market,
    code: normalizeAssetCode(code)
  };
}
function createStockAssetQuery(symbol) {
  const normalized = normalizeAssetCode(symbol);
  return {
    assetKey: buildStockAssetKey(normalized),
    assetType: "STOCK",
    market: "A_SHARE",
    code: normalized,
    symbol: normalized
  };
}
function resolveAssetQuery(query) {
  if (query.assetKey) {
    const parsed = parseAssetKey(query.assetKey);
    if (parsed) {
      return parsed;
    }
    throw new Error(`Invalid assetKey: ${query.assetKey}`);
  }
  const assetType = query.assetType ?? (query.symbol ? "STOCK" : void 0);
  const market = query.market ?? (query.symbol ? "A_SHARE" : void 0);
  const code = query.code ?? query.symbol;
  if (!assetType || !market || !code) {
    throw new Error("Asset query is missing asset identity fields.");
  }
  return {
    assetType,
    market,
    code: normalizeAssetCode(code)
  };
}
const NATURAL_YEAR_YIELD_BASIS = "Event-level yield accumulation by ex-dividend year, using dividend per share divided by the close before the record date or a source-provided equivalent reference price";
function buildHistoricalYields(events) {
  const grouped = /* @__PURE__ */ new Map();
  const seenEventKeys = /* @__PURE__ */ new Set();
  for (const event of events) {
    const eventKey = [
      event.year,
      event.exDate ?? "",
      event.payDate ?? "",
      event.recordDate ?? "",
      event.dividendPerShare.toFixed(8),
      (event.bonusSharePer10 ?? 0).toFixed(8),
      (event.transferSharePer10 ?? 0).toFixed(8)
    ].join("|");
    if (seenEventKeys.has(eventKey)) {
      continue;
    }
    seenEventKeys.add(eventKey);
    const current = grouped.get(event.year) ?? { year: event.year, yield: 0, events: 0 };
    const eventYield = event.referenceClosePrice > 0 ? event.dividendPerShare / event.referenceClosePrice : 0;
    current.yield += eventYield;
    current.events += 1;
    grouped.set(event.year, current);
  }
  return [...grouped.values()].sort((a, b) => a.year - b.year);
}
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
function estimateFutureYield(input) {
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
function resolveValuationStatus(percentile) {
  if (percentile == null) {
    return void 0;
  }
  if (percentile <= 30) {
    return "估值较低";
  }
  if (percentile >= 70) {
    return "估值较高";
  }
  return "估值中等";
}
function quantile(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return void 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const index = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  const weight = index - lowerIndex;
  return lower + (upper - lower) * weight;
}
function subtractYears(date, years) {
  const anchor = /* @__PURE__ */ new Date(`${date.slice(0, 10)}T00:00:00Z`);
  anchor.setUTCFullYear(anchor.getUTCFullYear() - years);
  return anchor.toISOString().slice(0, 10);
}
function buildWindowSnapshot(history, years, window, currentValue) {
  const latestDate = history[0]?.date;
  const lowerBound = latestDate ? subtractYears(latestDate, years) : null;
  const values = history.filter((point) => lowerBound ? point.date >= lowerBound : true).map((point) => point.value).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (values.length === 0 || currentValue == null || currentValue <= 0) {
    return {
      window,
      sampleSize: values.length
    };
  }
  const belowOrEqualCount = values.filter((value) => value <= currentValue).length;
  return {
    window,
    percentile: Number((belowOrEqualCount / values.length * 100).toFixed(2)),
    p30: quantile(values, 0.3),
    p50: quantile(values, 0.5),
    p70: quantile(values, 0.7),
    sampleSize: values.length
  };
}
function buildValuationWindows(metric) {
  const history = (metric?.history ?? []).filter((point) => point.date && Number.isFinite(point.value) && point.value > 0).sort((left, right) => right.date.localeCompare(left.date));
  const currentValue = metric?.currentValue ?? history[0]?.value;
  const tenYearWindow = buildWindowSnapshot(history, 10, "10Y", currentValue);
  const twentyYearWindow = buildWindowSnapshot(history, 20, "20Y", currentValue);
  const status = metric?.status ?? resolveValuationStatus(metric?.currentPercentile ?? tenYearWindow.percentile);
  return {
    currentValue,
    currentPercentile: metric?.currentPercentile,
    status,
    windows: [tenYearWindow, twentyYearWindow]
  };
}
const FUND_YIELD_BASIS = "Event-level yield accumulation by distribution year, using per-share cash distribution divided by the close on or before the record date";
const STOCK_CAPABILITIES$1 = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: true,
  hasBacktest: true,
  hasComparisonMetrics: true
};
const ETF_FUND_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: false,
  hasBacktest: true,
  hasComparisonMetrics: true
};
function deriveCapabilities(kind) {
  return kind === "STOCK" ? STOCK_CAPABILITIES$1 : ETF_FUND_CAPABILITIES;
}
function toValuationMetricDto(metric) {
  if (!metric) {
    return void 0;
  }
  const windows = buildValuationWindows(metric);
  return {
    ...windows,
    history: metric.history.map((point) => ({
      date: point.date,
      value: point.value
    }))
  };
}
function createUnavailableEstimate(assetType) {
  return {
    estimatedDividendPerShare: 0,
    estimatedFutureYield: 0,
    method: "baseline",
    isAvailable: false,
    reason: `${assetType} 暂不提供未来股息率估算`,
    inputs: {},
    steps: ["当前仅对股票提供未来股息率估算。"]
  };
}
function assertStockSearchItem(item) {
  if (item.assetType !== "STOCK" || !item.symbol) {
    throw new Error(`Expected STOCK search item but received ${item.assetType}:${item.code}`);
  }
  return {
    assetKey: buildStockAssetKey(item.code),
    assetType: "STOCK",
    market: item.market,
    code: item.code,
    symbol: item.symbol,
    name: item.name
  };
}
function toAssetSearchItemDto(item) {
  if (item.assetType === "STOCK" && item.symbol) {
    return assertStockSearchItem(item);
  }
  return {
    assetKey: `${item.assetType}:${item.market}:${item.code}`,
    assetType: item.assetType,
    market: item.market,
    code: item.code,
    symbol: item.symbol,
    name: item.name
  };
}
function assertStockDetailSource(source) {
  if (source.kind !== "STOCK") {
    throw new Error(`Expected STOCK detail source but received ${source.kind}`);
  }
}
function toStockDetailDto(source) {
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  });
  const valuationDto = {
    pe: toValuationMetricDto(source.valuation?.pe),
    pb: toValuationMetricDto(source.valuation?.pb)
  };
  return {
    assetKey: buildStockAssetKey(source.stock.symbol),
    assetType: "STOCK",
    code: source.stock.symbol,
    symbol: source.stock.symbol,
    name: source.stock.name,
    market: source.stock.market,
    industry: source.stock.industry,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    pbRatio: source.stock.pbRatio,
    totalShares: source.stock.totalShares,
    dataSource: source.dataSource,
    yieldBasis: NATURAL_YEAR_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: estimates.baseline,
    futureYieldEstimates: [estimates.baseline, estimates.conservative],
    valuation: valuationDto,
    capabilities: STOCK_CAPABILITIES$1,
    modules: {
      income: {
        yieldBasis: NATURAL_YEAR_YIELD_BASIS,
        yearlyYields,
        dividendEvents: source.dividendEvents,
        futureYieldEstimate: estimates.baseline,
        futureYieldEstimates: [estimates.baseline, estimates.conservative]
      },
      valuation: valuationDto,
      equity: {
        industry: source.stock.industry,
        marketCap: source.stock.marketCap,
        peRatio: source.stock.peRatio,
        pbRatio: source.stock.pbRatio,
        totalShares: source.stock.totalShares
      }
    }
  };
}
function toAssetDetailDto(source) {
  if (source.kind === "STOCK") {
    return toStockDetailDto(source);
  }
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const unavailableEstimate = createUnavailableEstimate(source.identifier.assetType);
  const caps = deriveCapabilities(source.kind);
  const assetKey = buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code);
  return {
    assetKey,
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    category: source.category,
    manager: source.manager,
    trackingIndex: source.trackingIndex,
    benchmark: source.benchmark,
    latestNav: source.latestNav,
    fundScale: source.fundScale,
    latestPrice: source.latestPrice,
    dataSource: source.dataSource,
    yieldBasis: FUND_YIELD_BASIS,
    yearlyYields,
    dividendEvents: source.dividendEvents,
    futureYieldEstimate: unavailableEstimate,
    futureYieldEstimates: [unavailableEstimate],
    capabilities: caps,
    modules: {
      income: {
        yieldBasis: FUND_YIELD_BASIS,
        yearlyYields,
        dividendEvents: source.dividendEvents,
        futureYieldEstimate: unavailableEstimate,
        futureYieldEstimates: [unavailableEstimate]
      },
      fund: {
        category: source.category,
        manager: source.manager,
        trackingIndex: source.trackingIndex,
        benchmark: source.benchmark,
        latestNav: source.latestNav,
        fundScale: source.fundScale
      }
    }
  };
}
function toStockComparisonRowDto(source) {
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const estimates = estimateFutureYield({
    latestPrice: source.stock.latestPrice,
    latestTotalShares: source.latestTotalShares,
    latestAnnualNetProfit: source.latestAnnualNetProfit,
    lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
    lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
  });
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1);
  return {
    assetKey: buildStockAssetKey(source.stock.symbol),
    assetType: "STOCK",
    market: source.stock.market,
    code: source.stock.symbol,
    symbol: source.stock.symbol,
    name: source.stock.name,
    latestPrice: source.stock.latestPrice,
    marketCap: source.stock.marketCap,
    peRatio: source.stock.peRatio,
    pbRatio: source.stock.pbRatio,
    averageYield,
    estimatedFutureYield: estimates.baseline.estimatedFutureYield,
    valuation: {
      pe: toValuationMetricDto(source.valuation?.pe),
      pb: toValuationMetricDto(source.valuation?.pb)
    }
  };
}
function toAssetComparisonRowDto(source) {
  if (source.kind === "STOCK") {
    return toStockComparisonRowDto(source);
  }
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1);
  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    marketCap: source.fundScale,
    averageYield: yearlyYields.length > 0 ? averageYield : void 0
  };
}
function toWatchlistEntryDto(source) {
  if (source.kind === "STOCK") {
    const estimates = estimateFutureYield({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    });
    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: "STOCK",
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      name: source.stock.name,
      market: source.stock.market,
      latestPrice: source.stock.latestPrice,
      peRatio: source.stock.peRatio,
      estimatedFutureYield: estimates.baseline.estimatedFutureYield,
      yieldLabel: "预期股息率"
    };
  }
  const yearlyYields = buildHistoricalYields(source.dividendEvents);
  const averageYield = yearlyYields.reduce((sum, item) => sum + item.yield, 0) / Math.max(yearlyYields.length, 1);
  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    name: source.name,
    latestPrice: source.latestPrice,
    averageYield: yearlyYields.length > 0 ? averageYield : void 0,
    yieldLabel: "历史分配收益率"
  };
}
function toHistoricalYieldResponseDto(source) {
  if (source.kind === "STOCK") {
    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: "STOCK",
      market: source.stock.market,
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      basis: NATURAL_YEAR_YIELD_BASIS,
      yearlyYields: buildHistoricalYields(source.dividendEvents),
      dividendEvents: source.dividendEvents
    };
  }
  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    symbol: source.identifier.code,
    basis: FUND_YIELD_BASIS,
    yearlyYields: buildHistoricalYields(source.dividendEvents),
    dividendEvents: source.dividendEvents
  };
}
function toFutureYieldResponseDto(source) {
  if (source.kind === "STOCK") {
    const estimates = estimateFutureYield({
      latestPrice: source.stock.latestPrice,
      latestTotalShares: source.latestTotalShares,
      latestAnnualNetProfit: source.latestAnnualNetProfit,
      lastAnnualPayoutRatio: source.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: source.lastYearTotalDividendAmount
    });
    return {
      assetKey: buildStockAssetKey(source.stock.symbol),
      assetType: "STOCK",
      market: source.stock.market,
      code: source.stock.symbol,
      symbol: source.stock.symbol,
      estimates: [estimates.baseline, estimates.conservative]
    };
  }
  return {
    assetKey: buildAssetKey(source.identifier.assetType, source.identifier.market, source.identifier.code),
    assetType: source.identifier.assetType,
    market: source.identifier.market,
    code: source.identifier.code,
    symbol: source.identifier.code,
    estimates: [createUnavailableEstimate(source.identifier.assetType)]
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
async function getText(url, config) {
  try {
    const response = await httpClient.get(url, {
      responseType: "text",
      ...config
    });
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
const SEARCH_TOKEN$1 = "D43BF722C8E33BDC906FB84D85E326E8";
const TENCENT_KLINE_LIMIT = 2e3;
function isAShareSymbol$1(symbol) {
  return /^(6\d{5}|00[0-4]\d{3}|30[0-1]\d{3})$/.test(symbol.trim());
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
  const priceHistory = parseTencentPriceHistory(data?.day ?? data?.qfqday);
  if (!quoteFields || quoteFields.length < 58) {
    throw new Error(`Tencent market data is incomplete for ${symbol}`);
  }
  const latestPrice = toNumber(quoteFields[3]);
  if (latestPrice == null) {
    throw new Error(`Tencent latest price is missing for ${symbol}`);
  }
  const marketCapInYi = toNumber(quoteFields[44]);
  const peRatio = toNumber(quoteFields[39]);
  const totalSharesRaw = toNumber(quoteFields[73]) ?? toNumber(quoteFields[72]) ?? toNumber(quoteFields[76]);
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
function calculateDividendAmount(record) {
  const dividendPerShare = (toNumber(record.PRETAX_BONUS_RMB) ?? 0) / 10;
  const totalShares = toNumber(record.TOTAL_SHARES);
  return dividendPerShare > 0 && totalShares != null ? dividendPerShare * totalShares : void 0;
}
function buildLatestFiscalYearSummary(records) {
  const latestAnnualRecord = pickLatestAnnualDividendRecord(records);
  const fiscalYear = extractYear(latestAnnualRecord?.REPORT_DATE);
  if (!latestAnnualRecord || fiscalYear == null) {
    return {
      latestAnnualRecord: void 0,
      latestAnnualTotalShares: void 0,
      latestAnnualNetProfit: 0,
      lastYearTotalDividendAmount: 0,
      lastAnnualPayoutRatio: 0
    };
  }
  const sameFiscalYearRecords = records.filter((record) => extractYear(record.REPORT_DATE) === fiscalYear);
  const latestAnnualTotalShares = toNumber(latestAnnualRecord.TOTAL_SHARES);
  const latestAnnualBasicEps = toNumber(latestAnnualRecord.BASIC_EPS);
  const latestAnnualNetProfit = latestAnnualTotalShares != null && latestAnnualBasicEps != null ? latestAnnualTotalShares * latestAnnualBasicEps : 0;
  const lastYearTotalDividendAmount = sameFiscalYearRecords.reduce((sum, record) => {
    return sum + (calculateDividendAmount(record) ?? 0);
  }, 0);
  const lastAnnualPayoutRatio = latestAnnualNetProfit > 0 ? lastYearTotalDividendAmount / latestAnnualNetProfit : 0;
  return {
    latestAnnualRecord,
    latestAnnualTotalShares,
    latestAnnualNetProfit,
    lastYearTotalDividendAmount,
    lastAnnualPayoutRatio
  };
}
class EastmoneyAShareDataSource {
  async search(keyword) {
    const normalized = keyword.trim();
    if (!normalized) {
      return [];
    }
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(normalized)}&type=14&token=${SEARCH_TOKEN$1}&count=10`;
    const payload = await getJson(url);
    const quotations = payload.Quotations ?? payload.QuotationCodeTable?.Data ?? [];
    return quotations.filter((item) => item.Code && item.Name).filter((item) => {
      const classify = (item.Classify ?? "").toLowerCase();
      const securityTypeName = item.SecurityTypeName ?? "";
      const code = item.Code ?? "";
      return classify === "astock" || securityTypeName.includes("A") || /^(6\d{5}|00[0-4]\d{3}|30[0-1]\d{3})$/.test(code);
    }).map((item) => ({
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
    if (!isAShareSymbol$1(symbol)) {
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
      const totalDividendAmount = calculateDividendAmount(record);
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
    const fiscalYearSummary = buildLatestFiscalYearSummary(dividendRecords);
    return {
      stock: {
        symbol: market.symbol,
        name: dividendRecords[0]?.SECURITY_NAME_ABBR ?? market.name,
        market: "A_SHARE",
        latestPrice: market.latestPrice,
        marketCap: market.marketCap,
        peRatio: market.peRatio,
        totalShares: market.totalShares ?? fiscalYearSummary.latestAnnualTotalShares
      },
      dividendEvents,
      priceHistory,
      latestAnnualNetProfit: fiscalYearSummary.latestAnnualNetProfit,
      latestTotalShares: market.totalShares ?? fiscalYearSummary.latestAnnualTotalShares ?? 0,
      lastAnnualPayoutRatio: fiscalYearSummary.lastAnnualPayoutRatio,
      lastYearTotalDividendAmount: fiscalYearSummary.lastYearTotalDividendAmount,
      dataSource: "eastmoney"
    };
  }
  async compare(symbols) {
    return Promise.all(symbols.map((symbol) => this.getDetail(symbol)));
  }
}
const SEARCH_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";
function isSixDigitFundCode(code) {
  return /^\d{6}$/.test(code);
}
function isLikelyEtfCode(code) {
  return /^(5\d{5}|1[15]\d{4})$/.test(code);
}
function resolveFundAssetType(item) {
  const descriptor = `${item.Classify ?? ""}|${item.SecurityTypeName ?? ""}|${item.SecurityType ?? ""}`.toLowerCase();
  const rawDescriptor = `${item.Classify ?? ""}|${item.SecurityTypeName ?? ""}|${item.SecurityType ?? ""}`;
  const name = item.Name?.trim() ?? "";
  const code = item.Code?.trim() ?? "";
  if (descriptor.includes("etf") || /etf/i.test(name)) {
    return "ETF";
  }
  if (code && isLikelyEtfCode(code) && rawDescriptor.includes("场内基金")) {
    return "ETF";
  }
  if (descriptor.includes("fund") || descriptor.includes("lof") || rawDescriptor.includes("基金") || rawDescriptor.includes("场内基金")) {
    return "FUND";
  }
  return null;
}
class EastmoneyFundCatalogAdapter {
  async search(keyword, assetType) {
    const normalized = keyword.trim();
    if (!normalized) {
      return [];
    }
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(normalized)}&type=14&token=${SEARCH_TOKEN}&count=20`;
    const payload = await getJson(url);
    const quotations = payload.Quotations ?? payload.QuotationCodeTable?.Data ?? [];
    const seen = /* @__PURE__ */ new Set();
    const results = [];
    for (const item of quotations) {
      const code = item.Code?.trim() ?? "";
      const name = item.Name?.trim() ?? "";
      if (!code || !name || !isSixDigitFundCode(code)) {
        continue;
      }
      const resolvedType = resolveFundAssetType(item);
      if (!resolvedType) {
        continue;
      }
      if (assetType && resolvedType !== assetType) {
        continue;
      }
      const dedupeKey = `${resolvedType}:${code}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      results.push({
        assetType: resolvedType,
        code,
        name,
        market: "A_SHARE"
      });
    }
    return results;
  }
}
function decodeHtmlEntities(value) {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
function stripTags(value) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeDate$1(value) {
  const normalized = value?.trim();
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : void 0;
}
function normalizeOptionalText(value) {
  const normalized = value?.trim();
  return normalized ? normalized : void 0;
}
function parseChineseAmountToNumber(value) {
  if (!value) {
    return void 0;
  }
  const normalized = value.replace(/,/g, "").trim();
  const matched = normalized.match(/([0-9]+(?:\.[0-9]+)?)(亿|万)?/);
  if (!matched) {
    return void 0;
  }
  const base = Number(matched[1]);
  if (!Number.isFinite(base)) {
    return void 0;
  }
  if (matched[2] === "亿") {
    return base * 1e8;
  }
  if (matched[2] === "万") {
    return base * 1e4;
  }
  return base;
}
function extractFieldText(html, label) {
  const blockMatch = html.match(
    new RegExp(`<[^>]*>\\s*${escapeRegExp(label)}\\s*<\\/[^>]*>\\s*<[^>]*>([\\s\\S]{0,200}?)<\\/[^>]*>`, "i")
  );
  if (blockMatch) {
    return normalizeOptionalText(stripTags(blockMatch[1]));
  }
  const inlineMatch = html.match(new RegExp(`${escapeRegExp(label)}[：:]?([\\s\\S]{0,200}?)<`, "i"));
  if (inlineMatch) {
    return normalizeOptionalText(stripTags(inlineMatch[1]));
  }
  return void 0;
}
function extractFundNameFromTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const cleaned = normalizeOptionalText(stripTags(title ?? ""));
  if (!cleaned) {
    return void 0;
  }
  const normalized = cleaned.replace(/\s+/g, " ").replace(/基金基本概况.*$/i, "").replace(/基金档案.*$/i, "").replace(/_.*$/i, "").replace(/\(.*$/, "").trim();
  return normalized || void 0;
}
function parseFundBasicProfile(html) {
  return {
    name: extractFieldText(html, "基金简称") ?? extractFieldText(html, "基金全称") ?? extractFieldText(html, "基金名称") ?? extractFundNameFromTitle(html),
    category: extractFieldText(html, "基金类型") ?? extractFieldText(html, "类型"),
    manager: extractFieldText(html, "基金管理人") ?? extractFieldText(html, "管理人"),
    trackingIndex: extractFieldText(html, "跟踪标的"),
    benchmark: extractFieldText(html, "业绩比较基准"),
    latestNav: parseChineseAmountToNumber(extractFieldText(html, "单位净值")),
    fundScale: parseChineseAmountToNumber(extractFieldText(html, "净资产规模"))
  };
}
function toReferenceClosePrice(date, priceHistory) {
  if (!date) {
    return 0;
  }
  const matched = priceHistory.find((item) => item.date === date);
  if (matched) {
    return matched.close;
  }
  const previous = [...priceHistory].reverse().find((item) => item.date < date);
  return previous?.close ?? 0;
}
function parseFundDividendEvents(html, priceHistory) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const events = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => stripTags(match[1]));
    if (cells.length < 5) {
      continue;
    }
    const yearMatch = cells[0].match(/^(\d{4})年$/);
    const distributionMatch = cells[3].match(/每份派现金([0-9.]+)元/);
    if (!yearMatch || !distributionMatch) {
      continue;
    }
    const year = Number(yearMatch[1]);
    const recordDate = normalizeDate$1(cells[1]);
    const exDate = normalizeDate$1(cells[2]);
    const payDate = normalizeDate$1(cells[4]);
    const dividendPerShare = Number(distributionMatch[1]);
    if (!Number.isFinite(dividendPerShare)) {
      continue;
    }
    events.push({
      year,
      recordDate,
      exDate,
      payDate,
      dividendPerShare,
      referenceClosePrice: toReferenceClosePrice(recordDate ?? exDate, priceHistory),
      source: "eastmoney-fund"
    });
  }
  return events.sort((left, right) => {
    const leftDate = left.exDate ?? left.payDate ?? left.recordDate ?? `${left.year}-01-01`;
    const rightDate = right.exDate ?? right.payDate ?? right.recordDate ?? `${right.year}-01-01`;
    return leftDate.localeCompare(rightDate);
  });
}
function resolveFundSecId(code) {
  const normalized = code.trim();
  if (/^[56]\d{5}$/.test(normalized)) {
    return `1.${normalized}`;
  }
  if (/^[013]\d{5}$/.test(normalized)) {
    return `0.${normalized}`;
  }
  if (/^[12]\d{5}$/.test(normalized)) {
    return `0.${normalized}`;
  }
  throw new Error(`Unsupported A-share fund code: ${code}`);
}
function normalizeQuotePrice(value) {
  if (value == null || value <= 0) {
    return void 0;
  }
  const price = value >= 1e3 ? value / 1e3 : value;
  return Number.isFinite(price) && price > 0 ? price : void 0;
}
function parseKlines(payload) {
  return (payload.data?.klines ?? []).map((item) => item.split(",")).flatMap((parts) => {
    const date = parts[0]?.trim();
    const close = Number(parts[2]);
    if (!date || !Number.isFinite(close)) {
      return [];
    }
    return [{ date, close }];
  });
}
function resolveFundDisplayName(input) {
  return normalizeOptionalText(input.basicProfileName) ?? normalizeOptionalText(input.quoteName) ?? input.code.trim();
}
class EastmoneyFundDetailDataSource {
  async getDetail(code, assetType) {
    const normalizedCode = code.trim();
    const secId = resolveFundSecId(normalizedCode);
    const [basicHtml, dividendHtml, quotePayload, klinePayload] = await Promise.all([
      getText(`https://fund.eastmoney.com/f10/jbgk_${normalizedCode}.html`),
      getText(`https://fund.eastmoney.com/f10/fhsp_${normalizedCode}.html`),
      getJson(
        `https://push2.eastmoney.com/api/qt/stock/get?invt=2&fltt=2&fields=f43,f57,f58&secid=${secId}`
      ),
      getJson(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secId}&klt=101&fqt=1&lmt=800&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56`
      )
    ]);
    const basicProfile = parseFundBasicProfile(basicHtml);
    const priceHistory = parseKlines(klinePayload);
    const dividendEvents = parseFundDividendEvents(dividendHtml, priceHistory);
    const latestPrice = normalizeQuotePrice(quotePayload.data?.f43) ?? priceHistory[priceHistory.length - 1]?.close ?? basicProfile.latestNav;
    if (!latestPrice) {
      throw new Error(`Fund latest price / NAV is unavailable: ${normalizedCode}`);
    }
    return {
      assetType,
      code: normalizedCode,
      name: resolveFundDisplayName({
        basicProfileName: basicProfile.name,
        quoteName: quotePayload.data?.f58,
        code: normalizedCode
      }),
      market: "A_SHARE",
      category: basicProfile.category,
      manager: basicProfile.manager,
      trackingIndex: basicProfile.trackingIndex,
      benchmark: basicProfile.benchmark,
      latestPrice,
      latestNav: basicProfile.latestNav,
      fundScale: basicProfile.fundScale,
      priceHistory,
      dividendEvents,
      dataSource: "eastmoney"
    };
  }
}
const EASTMONEY_DATA_CENTER_BASE_URL = "https://datacenter.eastmoney.com/securities/api/data/get";
function buildHeaders() {
  return {
    Referer: "https://emdata.eastmoney.com/",
    Origin: "https://emdata.eastmoney.com"
  };
}
async function fetchTrendPage(symbol, indicatorType, page, pageSize) {
  const url = `${EASTMONEY_DATA_CENTER_BASE_URL}?type=RPT_CUSTOM_DMSK_TREND&sr=-1&st=TRADE_DATE&p=${page}&ps=${pageSize}&var=source=DataCenter&client=WAP&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")(INDICATORTYPE=${indicatorType})(DATETYPE=2)`)}`;
  return getJson(url, {
    headers: buildHeaders()
  });
}
class EastmoneyValuationAdapter {
  async getSnapshot(symbol, indicatorType) {
    const url = `${EASTMONEY_DATA_CENTER_BASE_URL}?type=RPT_VALUATIONSTATUS&sty=SECUCODE,TRADE_DATE,INDICATOR_TYPE,INDEX_VALUE,INDEX_PERCENTILE,VALATION_STATUS&callback=&extraCols=&p=1&ps=1&sr=&st=&token=&var=source=DataCenter&client=WAP&filter=${encodeURIComponent(`(SECURITY_CODE="${symbol}")(INDICATOR_TYPE="${indicatorType}")`)}`;
    try {
      const payload = await getJson(url, {
        headers: buildHeaders()
      });
      const record = payload.result?.data?.[0];
      if (!record) {
        return void 0;
      }
      return {
        currentValue: toNumber(record.INDEX_VALUE) ?? void 0,
        currentPercentile: toNumber(record.INDEX_PERCENTILE) ?? void 0,
        status: record.VALATION_STATUS
      };
    } catch {
      return void 0;
    }
  }
  async getTrend(symbol, indicatorType) {
    const pageSize = 2e3;
    try {
      const firstPage = await fetchTrendPage(symbol, indicatorType, 1, pageSize);
      const pages = Math.max(1, firstPage.result?.pages ?? 1);
      const payloads = [firstPage];
      for (let page = 2; page <= pages; page += 1) {
        payloads.push(await fetchTrendPage(symbol, indicatorType, page, pageSize));
      }
      return payloads.flatMap((payload) => payload.result?.data ?? []).map((record) => {
        const date = toIsoDate(record.TRADE_DATE);
        const value = toNumber(record.INDICATOR_VALUE);
        if (!date || value == null || value <= 0) {
          return null;
        }
        return {
          date,
          value
        };
      }).filter((item) => item != null).sort((left, right) => right.date.localeCompare(left.date));
    } catch {
      return [];
    }
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
function createValuationDataSource(mode = getAppConfig().dataSourceMode) {
  if (mode !== "eastmoney") {
    throw new Error(`Unsupported valuation data source mode: ${mode}`);
  }
  return new EastmoneyValuationAdapter();
}
function createFundCatalogDataSource(mode = getAppConfig().dataSourceMode) {
  if (mode !== "eastmoney") {
    throw new Error(`Unsupported fund catalog data source mode: ${mode}`);
  }
  return new EastmoneyFundCatalogAdapter();
}
function createFundDetailDataSource(mode = getAppConfig().dataSourceMode) {
  if (mode !== "eastmoney") {
    throw new Error(`Unsupported fund detail data source mode: ${mode}`);
  }
  return new EastmoneyFundDetailDataSource();
}
const VALUATION_CACHE_TTL_MS = 15 * 60 * 1e3;
const valuationCache = /* @__PURE__ */ new Map();
function buildMetric(snapshot, history) {
  const currentValue = snapshot?.currentValue ?? history[0]?.value;
  if (currentValue == null && history.length === 0) {
    return void 0;
  }
  return {
    currentValue: currentValue != null && currentValue > 0 ? currentValue : void 0,
    currentPercentile: snapshot?.currentPercentile != null && snapshot.currentPercentile >= 0 ? snapshot.currentPercentile : void 0,
    status: snapshot?.status,
    history
  };
}
class ValuationRepository {
  constructor(dataSource = createValuationDataSource()) {
    this.dataSource = dataSource;
  }
  async getStockValuation(symbol) {
    const cached = valuationCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const [pe, pb] = await Promise.all([this.resolveMetric(symbol, 1), this.resolveMetric(symbol, 2)]);
    const valuation = pe || pb ? {
      pe,
      pb
    } : void 0;
    valuationCache.set(symbol, {
      expiresAt: Date.now() + VALUATION_CACHE_TTL_MS,
      value: valuation
    });
    return valuation;
  }
  async resolveMetric(symbol, indicatorType) {
    const [snapshotResult, trendResult] = await Promise.allSettled([
      this.dataSource.getSnapshot(symbol, indicatorType),
      this.dataSource.getTrend(symbol, indicatorType)
    ]);
    const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : void 0;
    const history = trendResult.status === "fulfilled" ? trendResult.value : [];
    return buildMetric(snapshot, history);
  }
}
const STOCK_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: true,
  hasBacktest: true,
  hasComparisonMetrics: true
};
const ETF_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: false,
  hasBacktest: true,
  hasComparisonMetrics: true
};
const FUND_CAPABILITIES = {
  hasIncomeAnalysis: true,
  hasValuationAnalysis: false,
  hasBacktest: true,
  hasComparisonMetrics: true
};
const sharedValuationRepository = new ValuationRepository();
function mergeStockDetail(source, valuation) {
  return {
    ...source,
    stock: {
      ...source.stock,
      peRatio: valuation?.pe?.currentValue ?? source.stock.peRatio,
      pbRatio: valuation?.pb?.currentValue ?? source.stock.pbRatio
    },
    valuation
  };
}
class StockAssetProvider {
  constructor(dataSource = createAShareDataSource(), valuationRepository = sharedValuationRepository) {
    this.dataSource = dataSource;
    this.valuationRepository = valuationRepository;
  }
  assetType = "STOCK";
  getCapabilities() {
    return STOCK_CAPABILITIES;
  }
  supports(identifier) {
    return identifier.assetType === "STOCK" && identifier.market === "A_SHARE";
  }
  async search(keyword) {
    const items = await this.dataSource.search(keyword);
    return items.map((item) => ({
      assetType: "STOCK",
      market: item.market,
      code: item.symbol,
      symbol: item.symbol,
      name: item.name
    }));
  }
  async getDetail(identifier) {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported stock asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`);
    }
    const [source, valuation] = await Promise.all([
      this.dataSource.getDetail(identifier.code),
      this.valuationRepository.getStockValuation(identifier.code)
    ]);
    return {
      kind: "STOCK",
      identifier,
      ...mergeStockDetail(source, valuation)
    };
  }
  async compare(identifiers) {
    if (identifiers.length === 0) {
      return [];
    }
    const unsupported = identifiers.find((identifier) => !this.supports(identifier));
    if (unsupported) {
      throw new Error(
        `Unsupported stock comparison identifier: ${unsupported.assetType}:${unsupported.market}:${unsupported.code}`
      );
    }
    const symbols = identifiers.map((identifier) => identifier.code);
    const [sources, valuations] = await Promise.all([
      this.dataSource.compare(symbols),
      Promise.all(symbols.map((symbol) => this.valuationRepository.getStockValuation(symbol)))
    ]);
    return sources.map((source, index) => ({
      kind: "STOCK",
      identifier: identifiers[index],
      ...mergeStockDetail(source, valuations[index])
    }));
  }
}
class EtfAssetProvider {
  constructor(catalogDataSource = createFundCatalogDataSource(), detailDataSource = createFundDetailDataSource()) {
    this.catalogDataSource = catalogDataSource;
    this.detailDataSource = detailDataSource;
  }
  assetType = "ETF";
  getCapabilities() {
    return ETF_CAPABILITIES;
  }
  supports(identifier) {
    return identifier.assetType === "ETF" && identifier.market === "A_SHARE";
  }
  async search(keyword) {
    const items = await this.catalogDataSource.search(keyword, "ETF");
    return items.map((item) => ({
      assetType: item.assetType,
      market: item.market,
      code: item.code,
      name: item.name
    }));
  }
  async getDetail(identifier) {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported ETF asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`);
    }
    const source = await this.detailDataSource.getDetail(identifier.code, "ETF");
    return {
      kind: "ETF",
      identifier,
      ...source
    };
  }
}
class FundAssetProvider {
  constructor(catalogDataSource = createFundCatalogDataSource(), detailDataSource = createFundDetailDataSource()) {
    this.catalogDataSource = catalogDataSource;
    this.detailDataSource = detailDataSource;
  }
  assetType = "FUND";
  getCapabilities() {
    return FUND_CAPABILITIES;
  }
  supports(identifier) {
    return identifier.assetType === "FUND" && identifier.market === "A_SHARE";
  }
  async search(keyword) {
    const items = await this.catalogDataSource.search(keyword, "FUND");
    return items.map((item) => ({
      assetType: item.assetType,
      market: item.market,
      code: item.code,
      name: item.name
    }));
  }
  async getDetail(identifier) {
    if (!this.supports(identifier)) {
      throw new Error(`Unsupported fund asset identifier: ${identifier.assetType}:${identifier.market}:${identifier.code}`);
    }
    const source = await this.detailDataSource.getDetail(identifier.code, "FUND");
    return {
      kind: "FUND",
      identifier,
      ...source
    };
  }
}
class AssetProviderRegistry {
  constructor(providers = [new StockAssetProvider(), new EtfAssetProvider(), new FundAssetProvider()]) {
    this.providers = providers;
  }
  getProvider(identifier) {
    const provider = this.providers.find((item) => item.supports(identifier));
    if (!provider) {
      throw new Error(`No asset provider found for ${identifier.assetType}:${identifier.market}:${identifier.code}`);
    }
    return provider;
  }
  getSearchProviders(assetTypes) {
    if (!assetTypes || assetTypes.length === 0) {
      return this.providers;
    }
    const allowed = new Set(assetTypes);
    return this.providers.filter((provider) => allowed.has(provider.assetType));
  }
}
class AssetRepository {
  constructor(registry = new AssetProviderRegistry()) {
    this.registry = registry;
  }
  async search(request) {
    const providers = this.registry.getSearchProviders(request.assetTypes);
    const groups = await Promise.all(providers.map((provider) => provider.search(request.keyword)));
    return groups.flat();
  }
  async getDetail(query) {
    const identifier = resolveAssetQuery(query);
    const provider = this.registry.getProvider(identifier);
    return provider.getDetail(identifier);
  }
  async compare(request) {
    const identifiers = request.items.map((item) => resolveAssetQuery(item));
    if (identifiers.length === 0) {
      return [];
    }
    const grouped = /* @__PURE__ */ new Map();
    for (const identifier of identifiers) {
      const provider = this.registry.getProvider(identifier);
      const key = provider.assetType;
      const items = grouped.get(key) ?? [];
      items.push(identifier);
      grouped.set(key, items);
    }
    const resolved = /* @__PURE__ */ new Map();
    for (const identifiersForProvider of grouped.values()) {
      const provider = this.registry.getProvider(identifiersForProvider[0]);
      const details = provider.compare ? await provider.compare(identifiersForProvider) : await Promise.all(identifiersForProvider.map((identifier) => provider.getDetail(identifier)));
      for (const detail of details) {
        resolved.set(`${detail.identifier.assetType}:${detail.identifier.market}:${detail.identifier.code}`, detail);
      }
    }
    return identifiers.map((identifier) => {
      const key = `${identifier.assetType}:${identifier.market}:${identifier.code}`;
      const detail = resolved.get(key);
      if (!detail) {
        throw new Error(`Missing compare detail for ${key}`);
      }
      return detail;
    });
  }
}
async function compareAssets(request) {
  const repository = new AssetRepository();
  const sources = await repository.compare(request);
  return sources.map((source) => toAssetComparisonRowDto(source));
}
async function getAssetDetail(query) {
  const repository = new AssetRepository();
  const source = await repository.getDetail(query);
  return toAssetDetailDto(source);
}
async function searchAssets(request) {
  const repository = new AssetRepository();
  const assets = await repository.search(request);
  return assets.map(toAssetSearchItemDto);
}
class HttpError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}
function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.end(JSON.stringify(payload));
}
function sendNoContent(response) {
  response.statusCode = 204;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.end();
}
function asHttpError(error) {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    return new HttpError(error.message, 500);
  }
  return new HttpError("未知服务异常。", 500);
}
async function handleAssetRoute({ pathname, method, body, response }) {
  if (pathname === "/api/asset/search" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("搜索请求体无效。", 400);
    }
    const result = await searchAssets(body);
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/asset/detail" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("详情请求体无效。", 400);
    }
    const result = await getAssetDetail(body);
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/asset/compare" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("对比请求体无效。", 400);
    }
    const result = await compareAssets(body);
    sendJson(response, 200, result);
    return true;
  }
  return false;
}
async function estimateFutureYieldForAsset(query) {
  const repository = new AssetRepository();
  const source = await repository.getDetail(query);
  return toFutureYieldResponseDto(source);
}
async function getHistoricalYieldForAsset(query) {
  const repository = new AssetRepository();
  const source = await repository.getDetail(query);
  return toHistoricalYieldResponseDto(source);
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
function runDividendReinvestmentBacktest(input) {
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
      "Use raw daily close prices (non-adjusted when available) to avoid double-counting dividend effects during explicit reinvestment",
      "Cash dividends are received on pay date and fully reinvested at the next available close",
      "Bonus shares and transfer shares increase holdings separately from cash dividends"
    ],
    transactions
  };
}
async function runDividendReinvestmentBacktestForAsset(request) {
  const identifier = resolveAssetQuery(request.asset);
  const repository = new AssetRepository();
  const source = await repository.getDetail(request.asset);
  const result = runDividendReinvestmentBacktest({
    symbol: identifier.code,
    buyDate: request.buyDate,
    priceHistory: source.priceHistory,
    dividendEvents: source.dividendEvents
  });
  return {
    assetKey: buildAssetKey(identifier.assetType, identifier.market, identifier.code),
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    symbol: source.kind === "STOCK" ? source.stock.symbol : identifier.code,
    ...result
  };
}
async function handleCalculationRoute({ pathname, method, body, response }) {
  if (pathname === "/api/calculation/historical-yield" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("历史股息率请求体无效。", 400);
    }
    const result = await getHistoricalYieldForAsset(body);
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/calculation/estimate-future-yield" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("未来股息率请求体无效。", 400);
    }
    const result = await estimateFutureYieldForAsset(body);
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/calculation/backtest" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("回测请求体无效。", 400);
    }
    const result = await runDividendReinvestmentBacktestForAsset(body);
    sendJson(response, 200, result);
    return true;
  }
  return false;
}
let database = null;
function getDatabaseFilePath() {
  return join(app.getPath("userData"), "db", "dividend-monitor.sqlite");
}
function createBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      asset_key TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id TEXT PRIMARY KEY,
      asset_key TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_cost REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
      ON portfolio_positions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
      ON portfolio_positions(asset_key, updated_at DESC);
  `);
}
function getWatchlistColumns(db) {
  return db.prepare("PRAGMA table_info(watchlist_items)").all();
}
function migrateLegacyWatchlistTable(db) {
  const columns = getWatchlistColumns(db).map((column) => column.name);
  if (columns.includes("asset_key")) {
    return;
  }
  db.exec(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS watchlist_items_v2 (
      asset_key TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      market TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO watchlist_items_v2 (asset_key, asset_type, market, code, name, created_at, updated_at)
    SELECT
      'STOCK:A_SHARE:' || symbol,
      'STOCK',
      'A_SHARE',
      symbol,
      NULL,
      created_at,
      updated_at
    FROM watchlist_items;

    DROP TABLE watchlist_items;
    ALTER TABLE watchlist_items_v2 RENAME TO watchlist_items;

    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_asset_identity
      ON watchlist_items(asset_type, market, code);

    COMMIT;
  `);
}
function initializeSchema(db) {
  createBaseSchema(db);
  migrateLegacyWatchlistTable(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_updated_at
      ON watchlist_items(updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_items_asset_identity
      ON watchlist_items(asset_type, market, code);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_updated_at
      ON portfolio_positions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_positions_asset_identity
      ON portfolio_positions(asset_key, updated_at DESC);
  `);
}
function getDatabase() {
  if (database) {
    return database;
  }
  const filePath = getDatabaseFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  database = new DatabaseSync(filePath);
  initializeSchema(database);
  return database;
}
function normalizeIdentity(request) {
  const identity = resolveAssetQuery(request);
  return {
    assetType: identity.assetType,
    market: identity.market,
    code: normalizeAssetCode(identity.code)
  };
}
function toDto(row) {
  return {
    id: row.id,
    assetKey: row.asset_key,
    assetType: row.asset_type,
    market: row.market,
    code: row.code,
    symbol: row.asset_type === "STOCK" ? row.code : void 0,
    name: row.name,
    direction: row.direction,
    shares: Number(row.shares),
    avgCost: Number(row.avg_cost),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
class PortfolioRepository {
  async list() {
    const db = getDatabase();
    const rows = db.prepare(
      `
          SELECT id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
          FROM portfolio_positions
          ORDER BY updated_at DESC, created_at DESC, id DESC
        `
    ).all();
    return rows.map(toDto);
  }
  async upsert(request) {
    const code = normalizeAssetCode(request.code ?? request.symbol ?? "");
    const assetType = request.assetType ?? (request.symbol ? "STOCK" : void 0);
    const market = request.market ?? (request.symbol ? "A_SHARE" : void 0);
    if (!assetType || !market || !code) {
      throw new Error("持仓缺少资产标识信息。");
    }
    const name = request.name.trim();
    if (!name) {
      throw new Error("持仓名称不能为空。");
    }
    const shares = Number(request.shares);
    const avgCost = Number(request.avgCost);
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      throw new Error("持仓股数和成本价必须为正数。");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = request.id?.trim() || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assetKey = request.assetKey?.trim() || buildAssetKey(assetType, market, code);
    const direction = request.direction === "SELL" ? "SELL" : "BUY";
    const db = getDatabase();
    const existing = db.prepare("SELECT created_at FROM portfolio_positions WHERE id = ?").get(id);
    db.prepare(
      `
        INSERT INTO portfolio_positions (
          id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          asset_key = excluded.asset_key,
          asset_type = excluded.asset_type,
          market = excluded.market,
          code = excluded.code,
          name = excluded.name,
          direction = excluded.direction,
          shares = excluded.shares,
          avg_cost = excluded.avg_cost,
          updated_at = excluded.updated_at
      `
    ).run(id, assetKey, assetType, market, code, name, direction, shares, avgCost, existing?.created_at ?? now, now);
  }
  async remove(id) {
    const normalized = id.trim();
    if (!normalized) {
      return;
    }
    const db = getDatabase();
    db.prepare("DELETE FROM portfolio_positions WHERE id = ?").run(normalized);
  }
  async removeByAsset(request) {
    const identity = normalizeIdentity(request);
    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code);
    const db = getDatabase();
    db.prepare("DELETE FROM portfolio_positions WHERE asset_key = ?").run(assetKey);
  }
  async replaceByAsset(request) {
    const identity = normalizeIdentity(request.asset);
    const name = request.name.trim();
    const shares = Number(request.shares);
    const avgCost = Number(request.avgCost);
    if (!name) {
      throw new Error("持仓名称不能为空。");
    }
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      throw new Error("持仓股数和成本价必须为正数。");
    }
    const assetKey = buildAssetKey(identity.assetType, identity.market, identity.code);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const db = getDatabase();
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM portfolio_positions WHERE asset_key = ?").run(assetKey);
      db.prepare(
        `
          INSERT INTO portfolio_positions (
            id, asset_key, asset_type, market, code, name, direction, shares, avg_cost, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(id, assetKey, identity.assetType, identity.market, identity.code, name, "BUY", shares, avgCost, now, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
async function listPortfolioPositions() {
  const repository = new PortfolioRepository();
  return repository.list();
}
async function removePortfolioPosition(id) {
  const repository = new PortfolioRepository();
  await repository.remove(id);
}
async function removePortfolioPositionsByAsset(request) {
  const repository = new PortfolioRepository();
  await repository.removeByAsset(request);
}
async function replacePortfolioPositionsByAsset(request) {
  const repository = new PortfolioRepository();
  await repository.replaceByAsset(request);
}
async function upsertPortfolioPosition(request) {
  const repository = new PortfolioRepository();
  await repository.upsert(request);
}
async function handlePortfolioRoute({ pathname, method, body, response }) {
  if (pathname === "/api/portfolio" && method === "GET") {
    const result = await listPortfolioPositions();
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/portfolio/upsert" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("持仓写入请求体无效。", 400);
    }
    await upsertPortfolioPosition(body);
    sendNoContent(response);
    return true;
  }
  if (pathname === "/api/portfolio/remove" && method === "POST") {
    if (!body || typeof body !== "object" || typeof body.id !== "string") {
      throw new HttpError("持仓删除请求体无效。", 400);
    }
    await removePortfolioPosition(body.id);
    sendNoContent(response);
    return true;
  }
  if (pathname === "/api/portfolio/remove-by-asset" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("按资产删除持仓请求体无效。", 400);
    }
    await removePortfolioPositionsByAsset(body);
    sendNoContent(response);
    return true;
  }
  if (pathname === "/api/portfolio/replace-by-asset" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("按资产替换持仓请求体无效。", 400);
    }
    await replacePortfolioPositionsByAsset(body);
    sendNoContent(response);
    return true;
  }
  return false;
}
function normalizeSymbol(symbol) {
  return normalizeAssetCode(symbol);
}
function isAShareSymbol(symbol) {
  return /^(6|0|3)\d{5}$/.test(symbol);
}
function isAShareAssetCode(code) {
  return /^\d{6}$/.test(code);
}
function sanitizeSymbols(symbols) {
  const seen = /* @__PURE__ */ new Set();
  return symbols.map(normalizeSymbol).filter((symbol) => isAShareSymbol(symbol)).filter((symbol) => {
    if (seen.has(symbol)) {
      return false;
    }
    seen.add(symbol);
    return true;
  });
}
class WatchlistRepository {
  async listAssets() {
    const db = getDatabase();
    const rows = db.prepare(
      `
          SELECT asset_key, asset_type, market, code, name
          FROM watchlist_items
          ORDER BY updated_at DESC, created_at DESC, code ASC
        `
    ).all();
    const assets = [];
    for (const row of rows) {
      const assetKey = row.asset_key.trim();
      const parsed = parseAssetKey(assetKey);
      if (!parsed) {
        continue;
      }
      assets.push({
        assetKey,
        assetType: row.asset_type ?? parsed.assetType,
        market: row.market ?? parsed.market,
        code: normalizeAssetCode(row.code ?? parsed.code),
        name: row.name ?? void 0
      });
    }
    return assets;
  }
  async listSymbols() {
    const assets = await this.listAssets();
    return sanitizeSymbols(
      assets.filter((asset) => asset.assetType === "STOCK" && asset.market === "A_SHARE").map((asset) => asset.code)
    );
  }
  async addAsset(asset) {
    const normalizedCode = normalizeAssetCode(asset.code);
    if (asset.market === "A_SHARE" && !isAShareAssetCode(normalizedCode)) {
      throw new Error(`Only A-share 6-digit asset codes are supported: ${asset.code}`);
    }
    const db = getDatabase();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const assetKey = buildAssetKey(asset.assetType, asset.market, normalizedCode);
    db.prepare(
      `
        INSERT INTO watchlist_items (asset_key, asset_type, market, code, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_key) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `
    ).run(assetKey, asset.assetType, asset.market, normalizedCode, asset.name?.trim() || null, now, now);
  }
  async removeAsset(assetKey) {
    const normalized = assetKey.trim();
    if (!normalized) {
      return;
    }
    const db = getDatabase();
    db.prepare("DELETE FROM watchlist_items WHERE asset_key = ?").run(normalized);
  }
  async addSymbol(symbol) {
    const normalized = normalizeSymbol(symbol);
    await this.addAsset({
      assetType: "STOCK",
      market: "A_SHARE",
      code: normalized
    });
  }
  async removeSymbol(symbol) {
    const normalized = normalizeSymbol(symbol);
    await this.removeAsset(buildStockAssetKey(normalized));
  }
}
async function addWatchlistAsset(request) {
  const identifier = resolveAssetQuery(request);
  const repository = new AssetRepository();
  const watchlistRepository = new WatchlistRepository();
  const detail = await repository.getDetail(request);
  await watchlistRepository.addAsset({
    assetType: identifier.assetType,
    market: identifier.market,
    code: identifier.code,
    name: request.name?.trim() || (detail.kind === "STOCK" ? detail.stock.name : detail.name)
  });
}
async function listWatchlist() {
  const assetRepository = new AssetRepository();
  const watchlistRepository = new WatchlistRepository();
  const assets = await watchlistRepository.listAssets();
  if (assets.length === 0) {
    return [];
  }
  const sources = await Promise.allSettled(assets.map((asset) => assetRepository.getDetail({ assetKey: asset.assetKey })));
  return sources.flatMap((source) => {
    if (source.status !== "fulfilled") {
      return [];
    }
    return [source.value];
  }).map(toWatchlistEntryDto);
}
async function removeWatchlistAsset(assetKey) {
  const watchlistRepository = new WatchlistRepository();
  await watchlistRepository.removeAsset(assetKey);
}
async function handleWatchlistRoute({ pathname, method, body, response }) {
  if (pathname === "/api/watchlist" && method === "GET") {
    const result = await listWatchlist();
    sendJson(response, 200, result);
    return true;
  }
  if (pathname === "/api/watchlist/add-asset" && method === "POST") {
    if (!body || typeof body !== "object") {
      throw new HttpError("自选新增请求体无效。", 400);
    }
    await addWatchlistAsset(body);
    sendNoContent(response);
    return true;
  }
  if (pathname === "/api/watchlist/remove-asset" && method === "POST") {
    if (!body || typeof body !== "object" || typeof body.assetKey !== "string") {
      throw new HttpError("自选移除请求体无效。", 400);
    }
    await removeWatchlistAsset(body.assetKey);
    sendNoContent(response);
    return true;
  }
  return false;
}
let httpServer = null;
function getBaseUrl() {
  return new URL(LOCAL_HTTP_API_ORIGIN);
}
async function readJsonBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return void 0;
  }
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return void 0;
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError("请求体不是合法 JSON。", 400);
  }
}
async function handleRequest(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", LOCAL_HTTP_API_ORIGIN);
  const pathname = url.pathname;
  const method = request.method ?? "GET";
  const body = await readJsonBody(request);
  const handled = await handleAssetRoute({ pathname, method, body, response }) || await handleWatchlistRoute({ pathname, method, body, response }) || await handleCalculationRoute({ pathname, method, body, response }) || await handlePortfolioRoute({ pathname, method, body, response });
  if (!handled) {
    throw new HttpError(`未找到接口：${method} ${pathname}`, 404);
  }
}
async function startLocalHttpServer() {
  if (httpServer) {
    return;
  }
  const baseUrl = getBaseUrl();
  const host = baseUrl.hostname;
  const port = Number(baseUrl.port || 80);
  httpServer = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      const httpError = asHttpError(error);
      sendJson(response, httpError.statusCode, {
        error: {
          message: httpError.message
        }
      });
    });
  });
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer?.off("error", reject);
      resolve();
    });
  });
}
async function stopLocalHttpServer() {
  if (!httpServer) {
    return;
  }
  const server = httpServer;
  httpServer = null;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
function registerAssetChannels() {
  ipcMain.handle("asset:search", async (_event, request) => {
    return searchAssets(request);
  });
  ipcMain.handle("asset:get-detail", async (_event, request) => {
    return getAssetDetail(request);
  });
  ipcMain.handle("asset:compare", async (_event, request) => {
    return compareAssets(request);
  });
}
function registerCalculationChannels() {
  ipcMain.handle("calculation:historical-yield", async (_event, symbol) => {
    return getHistoricalYieldForAsset(createStockAssetQuery(symbol));
  });
  ipcMain.handle("calculation:estimate-future-yield", async (_event, symbol) => {
    return estimateFutureYieldForAsset(createStockAssetQuery(symbol));
  });
  ipcMain.handle("calculation:run-dividend-reinvestment-backtest", async (_event, symbol, buyDate) => {
    return runDividendReinvestmentBacktestForAsset({
      asset: createStockAssetQuery(symbol),
      buyDate
    });
  });
  ipcMain.handle("calculation:historical-yield-for-asset", async (_event, request) => {
    return getHistoricalYieldForAsset(request);
  });
  ipcMain.handle("calculation:estimate-future-yield-for-asset", async (_event, request) => {
    return estimateFutureYieldForAsset(request);
  });
  ipcMain.handle("calculation:run-dividend-reinvestment-backtest-for-asset", async (_event, request) => {
    return runDividendReinvestmentBacktestForAsset(request);
  });
}
function registerPortfolioChannels() {
  ipcMain.handle("portfolio:list", async () => {
    return listPortfolioPositions();
  });
  ipcMain.handle("portfolio:upsert", async (_event, request) => {
    return upsertPortfolioPosition(request);
  });
  ipcMain.handle("portfolio:remove", async (_event, id) => {
    return removePortfolioPosition(id);
  });
  ipcMain.handle("portfolio:remove-by-asset", async (_event, request) => {
    return removePortfolioPositionsByAsset(request);
  });
  ipcMain.handle("portfolio:replace-by-asset", async (_event, request) => {
    return replacePortfolioPositionsByAsset(request);
  });
}
function registerStockChannels() {
  ipcMain.handle("stock:search", async (_event, keyword) => {
    return searchAssets({
      keyword,
      assetTypes: ["STOCK"]
    });
  });
  ipcMain.handle("stock:get-detail", async (_event, symbol) => {
    return getAssetDetail(createStockAssetQuery(symbol));
  });
  ipcMain.handle("stock:compare", async (_event, symbols) => {
    return compareAssets({
      items: symbols.map((symbol) => createStockAssetQuery(symbol))
    });
  });
}
class StockRepository {
  constructor(assetRepository = new AssetRepository()) {
    this.assetRepository = assetRepository;
  }
  async search(keyword) {
    const items = await this.assetRepository.search({
      keyword,
      assetTypes: ["STOCK"]
    });
    return items.map(assertStockSearchItem);
  }
  async getDetail(symbol) {
    const source = await this.assetRepository.getDetail(createStockAssetQuery(symbol));
    assertStockDetailSource(source);
    return source;
  }
  async compare(symbols) {
    const sources = await this.assetRepository.compare({
      items: symbols.map((symbol) => createStockAssetQuery(symbol))
    });
    return sources.map((source) => {
      assertStockDetailSource(source);
      return source;
    });
  }
}
async function addWatchlistItem(symbol) {
  const repository = new StockRepository();
  const watchlistRepository = new WatchlistRepository();
  const detail = await repository.getDetail(symbol);
  const asset = createStockAssetQuery(symbol);
  await watchlistRepository.addAsset({
    assetType: "STOCK",
    market: "A_SHARE",
    code: asset.code ?? symbol,
    name: detail.stock.name
  });
}
async function removeWatchlistItem(symbol) {
  const watchlistRepository = new WatchlistRepository();
  await watchlistRepository.removeSymbol(symbol);
}
function registerWatchlistChannels() {
  ipcMain.handle("watchlist:list", async () => {
    return listWatchlist();
  });
  ipcMain.handle("watchlist:add", async (_event, symbol) => {
    return addWatchlistItem(symbol);
  });
  ipcMain.handle("watchlist:remove", async (_event, symbol) => {
    return removeWatchlistItem(symbol);
  });
  ipcMain.handle("watchlist:add-asset", async (_event, request) => {
    return addWatchlistAsset(request);
  });
  ipcMain.handle("watchlist:remove-asset", async (_event, assetKey) => {
    return removeWatchlistAsset(assetKey);
  });
}
function registerIpcHandlers() {
  registerAssetChannels();
  registerCalculationChannels();
  registerPortfolioChannels();
  registerStockChannels();
  registerWatchlistChannels();
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
const isDevelopment = Boolean(process.env["ELECTRON_RENDERER_URL"]);
const isHeadlessRuntime = process.env["DIVIDEND_MONITOR_HEADLESS"] === "1";
if (isDevelopment) {
  app.setPath("userData", join(process.cwd(), ".runtime-data"));
}
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
  void startLocalHttpServer();
  if (!isHeadlessRuntime) {
    createWindow();
  }
  app.on("activate", () => {
    if (!isHeadlessRuntime && BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void stopLocalHttpServer();
    app.quit();
  }
});
