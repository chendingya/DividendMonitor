import { getDefaultSourceGateway } from '@main/infrastructure/dataSources/gateway/sourceGateway'
import type { EastmoneySuggestItem } from '@main/infrastructure/dataSources/registry/eastmoneyEndpoints'

export type IndexCodeResult = {
  code: string
  name: string
  market: 'SH' | 'SZ'
}

type CacheEntry = {
  expiresAt: number
  value: IndexCodeResult | undefined
}

const INDEX_CODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const indexCodeCache = new Map<string, CacheEntry>()

function normalizeIndexName(name: string): string {
  return name
    .trim()
    .replace(/\(.*?\)/g, '')   // 去除括号内容，如 "创业板指数(价格)" → "创业板指数"
    .replace(/（.*?）/g, '')    // 去除全角括号内容
    .replace(/人民币$/u, '')    // 去除货币后缀
    .replace(/指数$/u, '')      // 去除"指数"后缀
    .replace(/[　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchBestResult(items: EastmoneySuggestItem[], normalizedName: string): EastmoneySuggestItem | undefined {
  const indices = items.filter((item) => item.SecurityType === '5' && item.Code)

  if (indices.length === 0) {
    return undefined
  }

  const exact = indices.find((item) => item.Name === normalizedName || normalizeIndexName(item.Name ?? '') === normalizedName)
  if (exact) {
    return exact
  }

  const prefix = indices.find((item) => (item.Name ?? '').startsWith(normalizedName) || normalizeIndexName(item.Name ?? '').startsWith(normalizedName))
  if (prefix) {
    return prefix
  }

  return indices[0]
}

async function searchIndices(keyword: string): Promise<EastmoneySuggestItem[]> {
  try {
    const response = await getDefaultSourceGateway().request<{ keyword: string; count: number }, EastmoneySuggestItem[]>({
      capability: 'asset.search',
      input: { keyword, count: 20 }
    })
    return response.data
  } catch {
    return []
  }
}

function generateSearchKeywords(normalizedName: string): string[] {
  const keywords = [normalizedName]

  // 去除常见前缀组合
  const prefixes = ['中证全指', '中证海外', '中证', '全指', '国证', '上证', '深证', '恒生']
  for (const prefix of prefixes) {
    if (normalizedName.startsWith(prefix)) {
      const stripped = normalizedName.slice(prefix.length).trim()
      if (stripped) {
        keywords.push(stripped)
      }
    }
  }

  // 去除货币/修饰词后缀
  const suffixPatterns = [/人民币$/u, /美元$/u, /港币$/u]
  for (const pattern of suffixPatterns) {
    const stripped = normalizedName.replace(pattern, '').trim()
    if (stripped && stripped !== normalizedName) {
      keywords.push(stripped)
    }
  }

  return [...new Set(keywords)]
}

export async function resolveIndexCode(indexName: string): Promise<IndexCodeResult | undefined> {
  const normalized = normalizeIndexName(indexName)
  if (!normalized) {
    return undefined
  }

  const cached = indexCodeCache.get(indexName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  // 尝试多个关键词搜索
  const searchKeywords = generateSearchKeywords(normalized)
  for (const keyword of searchKeywords) {
    const items = await searchIndices(keyword)
    const best = matchBestResult(items, normalized)
    if (best) {
      const result: IndexCodeResult = {
        code: best.Code!,
        name: best.Name!,
        market: (best.MktNum === '1' ? 'SH' : 'SZ')
      }
      indexCodeCache.set(indexName, { expiresAt: Date.now() + INDEX_CODE_CACHE_TTL_MS, value: result })
      return result
    }
  }

  indexCodeCache.set(indexName, { expiresAt: Date.now() + INDEX_CODE_CACHE_TTL_MS, value: undefined })
  return undefined
}

export function clearIndexCodeCache(): void {
  indexCodeCache.clear()
}
