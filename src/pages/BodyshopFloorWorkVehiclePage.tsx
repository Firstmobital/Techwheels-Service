import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getLinkedEmployeeContext } from '../lib/api/bodyshopFloorWorkContext'
import { loadBodyshopFloorInchargeScope } from '../lib/bodyshopFloorInchargeScope'
import { shouldUseFloorWorkAdminOverview } from '../lib/bodyshopFloorWork/inchargeOverview'
import { listAllWorkTasksForAdmin } from '../lib/bodyshopFloorWork/roles'
import { fetchAllFloorWorkPhotosForJobCards, type FloorWorkPhotoWithLog } from '../lib/api/bodyshopFloorRoleWorkLog'
import {
  fetchBodyshopAssignmentsForEmployee,
  fetchBodyshopSupportAssignmentsForEmployee,
} from '../lib/api/bodyshopFloorWorkAssignments'
import {
  aliasAssignmentMapForVehicleCatalog,
  resolveBodyshopAssignmentRow,
} from '../lib/bodyshopFloorWork/assignmentLookup'
import { buildAssignmentRowByJobCard } from '../lib/bodyshopFloorWork/pipeline'
import {
  fetchLiveOnFloorVehicleCatalog,
  fetchRepairCardVehicleByJcs,
} from '../lib/api/bodyshopFloorWorkVehicles'
import { BodyshopFloorWorkVehicleDetailPanel } from '../components/BodyshopFloorWorkVehicleDetailPanel'
import {
  decodeFloorWorkVehicleRouteParam,
  floorWorkVehicleDetailPath,
} from '../lib/bodyshopFloorWork/floorWorkRoutes'
import {
  floorWorkJobCardLookupKeys,
  floorWorkPhotoBelongsToVehicle,
  floorWorkVehicleTitle,
  type FloorWorkVehicleMeta,
} from '../lib/bodyshopFloorWork/display'

function groupPhotosForVehicle(
  displayJc: string,
  meta: FloorWorkVehicleMeta | undefined,
  photos: FloorWorkPhotoWithLog[],
): FloorWorkPhotoWithLog[] {
  const list = photos.filter((p) => floorWorkPhotoBelongsToVehicle(displayJc, meta, p))
  list.sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    return a.id - b.id
  })
  return list
}

export default function BodyshopFloorWorkVehiclePage() {
  const { vehicleKey: routeKey } = useParams()
  const jobCardNumber = useMemo(() => decodeFloorWorkVehicleRouteParam(routeKey), [routeKey])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdminOverview, setIsAdminOverview] = useState(false)
  const [vehicleMeta, setVehicleMeta] = useState<FloorWorkVehicleMeta | undefined>()
  const [assignmentRow, setAssignmentRow] = useState<Record<string, unknown> | undefined>()
  const [photos, setPhotos] = useState<FloorWorkPhotoWithLog[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const assignmentRowsRef = useRef<Record<string, unknown>[]>([])

  const load = useCallback(async () => {
    if (!jobCardNumber) {
      setError('Missing vehicle id in URL.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const ctx = await getLinkedEmployeeContext()
      if (ctx.error || !ctx.data) throw new Error(ctx.error ?? 'Employee link missing')
      const inchargeScope = await loadBodyshopFloorInchargeScope()
      const adminOverview = shouldUseFloorWorkAdminOverview(ctx.data, inchargeScope)
      setIsAdminOverview(adminOverview)

      let assRows: Record<string, unknown>[] = []
      let supportRows: Record<string, unknown>[] = []
      const myCode = String(ctx.data.employeeCode ?? '').trim().toUpperCase()

      if (adminOverview) {
        const { data: assAll, error: assErr } = await supabase
          .from('bodyshop_assignments')
          .select('*')
          .eq('is_active', true)
        if (assErr) throw assErr
        const { data: supAll, error: supErr } = await supabase
          .from('bodyshop_floor_support_assignments')
          .select('*')
          .eq('is_active', true)
        if (supErr) throw supErr
        assRows = assAll ?? []
        supportRows = supAll ?? []
      } else if (myCode) {
        const [assRes, supRes] = await Promise.all([
          fetchBodyshopAssignmentsForEmployee(myCode),
          fetchBodyshopSupportAssignmentsForEmployee(myCode),
        ])
        if (assRes.error) throw new Error(assRes.error)
        if (supRes.error) throw new Error(supRes.error)
        assRows = assRes.data ?? []
        supportRows = supRes.data ?? []
      } else {
        throw new Error('No employee linked to your login.')
      }

      assignmentRowsRef.current = assRows
      let assignmentMap = buildAssignmentRowByJobCard(assRows)
      listAllWorkTasksForAdmin(assRows, supportRows)

      let meta: FloorWorkVehicleMeta | undefined
      const catalog = await fetchLiveOnFloorVehicleCatalog()
      if (catalog.metaByJc[jobCardNumber]) {
        meta = catalog.metaByJc[jobCardNumber]
      } else {
        for (const [jc, m] of Object.entries(catalog.metaByJc)) {
          const keys = floorWorkJobCardLookupKeys(jc, m)
          if (keys.includes(jobCardNumber)) {
            meta = m
            break
          }
        }
      }
      if (!meta) {
        const batch = await fetchRepairCardVehicleByJcs([jobCardNumber])
        meta = batch[jobCardNumber]
      }

      assignmentMap = aliasAssignmentMapForVehicleCatalog(
        assignmentMap,
        assRows,
        meta ? { [jobCardNumber]: meta } : {},
        [jobCardNumber],
      )

      const row = resolveBodyshopAssignmentRow(
        jobCardNumber,
        meta,
        assignmentMap,
        assRows,
      )
      setVehicleMeta(meta)
      setAssignmentRow(row)

      setLoadingPhotos(true)
      setPhotosError(null)
      const lookup = new Set(floorWorkJobCardLookupKeys(jobCardNumber, meta))
      const phRes = await fetchAllFloorWorkPhotosForJobCards([...lookup])
      if (phRes.error) setPhotosError(phRes.error)
      else setPhotos(groupPhotosForVehicle(jobCardNumber, meta, phRes.data ?? []))
      setLoadingPhotos(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [jobCardNumber])

  useEffect(() => {
    void load()
  }, [load])

  const title = floorWorkVehicleTitle(vehicleMeta, jobCardNumber)

  if (loading) {
    return (
      <div className="page-pad">
        <p>Loading vehicle…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-pad">
        <p className="alert alert--err">{error}</p>
        <Link to="/bodyshop-floor-work" className="btn btn--ghost">
          Back to Floor Work list
        </Link>
      </div>
    )
  }

  return (
    <div className="page-pad bfw-vehicle-page">
      <div className="bfw-vehicle-page__toolbar">
        <Link to="/bodyshop-floor-work" className="btn btn--ghost btn--sm">
          ← Floor Work list
        </Link>
        <a
          href={floorWorkVehicleDetailPath(jobCardNumber)}
          className="btn btn--ghost btn--sm"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab
        </a>
      </div>
      <h1 className="bfw-vehicle-page__title">{title}</h1>
      <div className="card bfw-vehicle-page__panel">
        <BodyshopFloorWorkVehicleDetailPanel
          jobCardNumber={jobCardNumber}
          vehicleMeta={vehicleMeta}
          assignmentRow={assignmentRow}
          qcStatus={vehicleMeta?.qcStatus}
          allPhotos={photos}
          loadingPhotos={loadingPhotos}
          photosError={photosError}
          adminWorkReview={isAdminOverview}
        />
      </div>
    </div>
  )
}
