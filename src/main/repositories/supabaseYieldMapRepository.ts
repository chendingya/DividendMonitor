import type { YieldMapIndustryDto } from '@shared/contracts/api'
import { getSupabaseClient } from '@main/infrastructure/supabase/supabaseClient'
import { authService } from '@main/infrastructure/supabase/authService'

type IndustrySnapshotRow = {
  industry: string
  snapshot_date: string
  median_yield: number
  avg_yield: number
  stock_count: number
}

/**
 * Online mode industry snapshot repository for the yield map.
 * Industry-level aggregates live on Supabase (per-user, RLS enforced);
 * stock-level entries stay in the local SQLite snapshot.
 */
export class SupabaseYieldMapRepository {
  /**
   * 两次查询：先取最新 snapshot_date，再按该日期取全部行业，
   * 避免单次 limit(500) 在最新快照行数超限时截断。
   */
  async getLatestIndustries(): Promise<{ snapshotDate: string | null; industries: YieldMapIndustryDto[] }> {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const dateQuery = await supabase
      .from('industry_yield_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
    if (dateQuery.error) {
      throw new Error(`读取云端行业快照失败: ${dateQuery.error.message}`)
    }

    const snapshotDate = ((dateQuery.data ?? [])[0] as { snapshot_date?: string } | undefined)?.snapshot_date ?? null
    if (!snapshotDate) {
      return { snapshotDate: null, industries: [] }
    }

    const { data, error } = await supabase
      .from('industry_yield_snapshots')
      .select('industry, snapshot_date, median_yield, avg_yield, stock_count')
      .eq('snapshot_date', snapshotDate)
    if (error) {
      throw new Error(`读取云端行业快照失败: ${error.message}`)
    }

    const rows = (data ?? []) as unknown as IndustrySnapshotRow[]
    return {
      snapshotDate,
      industries: rows.map((row) => ({
        industry: row.industry,
        medianYield: row.median_yield,
        avgYield: row.avg_yield,
        stockCount: row.stock_count
      }))
    }
  }

  async upsertIndustries(industries: YieldMapIndustryDto[], snapshotDate: string): Promise<void> {
    if (industries.length === 0) return

    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('在线服务未配置（缺少 SUPABASE_URL / SUPABASE_ANON_KEY）')

    const session = await authService.getSession()
    if (!session?.user.id) throw new Error('未登录，无法上传行业快照')

    const rows = industries.map((item) => ({
      user_id: session.user.id,
      industry: item.industry,
      snapshot_date: snapshotDate,
      median_yield: item.medianYield,
      avg_yield: item.avgYield,
      stock_count: item.stockCount
    }))

    const { error } = await supabase
      .from('industry_yield_snapshots')
      .upsert(rows, { onConflict: 'user_id,industry,snapshot_date' })
    if (error) {
      throw new Error(`写入云端行业快照失败: ${error.message}`)
    }
  }
}
