import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BODYSHOP_FLOOR_WORK_ROLE_LABELS } from '../lib/bodyshopFloorWork/roles'
import type { BodyshopFloorWorkLogRole } from '../lib/bodyshopFloorWork/roles'
import type { FloorWorkVehicleMeta } from '../lib/bodyshopFloorWork/display'
import { floorWorkVehicleSubtitle, floorWorkVehicleTitle, floorWorkStandingLine } from '../lib/bodyshopFloorWork/display'
import {
  buildFloorWorkVehicleStatusSummary,
  type FloorWorkRoleStatusTone,
} from '../lib/bodyshopFloorWork/vehiclePipelineStatus'
import type {
  BodyshopFloorRoleDailyLogPhotoRow,
  BodyshopFloorRoleDailyLogRow,
} from '../lib/bodyshopFloorRoleWorkLog'
import {
  fetchRoleDailyLogPhotos,
  resolveRoleLogPhotoPreviewUrl,
  fetchRoleDailyLogsForVehicleKeys,
  openRoleDailyLogPhoto,
  type FloorWorkPhotoWithLog,
} from '../lib/api/bodyshopFloorRoleWorkLog'
import { BodyshopFloorWorkPhotoGallery } from './BodyshopFloorWorkPhotoGallery'

const TONE_CLASS: Record<FloorWorkRoleStatusTone, string> = {
  done: 'bfw-pill bfw-pill--done',
  active: 'bfw-pill bfw-pill--active',
  pending: 'bfw-pill bfw-pill--pending',
  waiting: 'bfw-pill bfw-pill--waiting',
  muted: 'bfw-pill bfw-pill--muted',
}

const HIGHLIGHT_ROLES: BodyshopFloorWorkLogRole[] = [
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'TECHNICIAN',
  'RUBBING',
]

function latestLogByRole(logs: BodyshopFloorRoleDailyLogRow[]): Map<BodyshopFloorWorkLogRole, BodyshopFloorRoleDailyLogRow> {
  const map = new Map<BodyshopFloorWorkLogRole, BodyshopFloorRoleDailyLogRow>()
  for (const log of logs) {
    const role = log.floor_role as BodyshopFloorWorkLogRole
    if (!map.has(role)) map.set(role, log)
  }
  return map
}

type Props = {
  jobCardNumber: string
  vehicleMeta: FloorWorkVehicleMeta | undefined
  assignmentRow: Record<string, unknown> | undefined
  qcStatus: unknown
  allPhotos: FloorWorkPhotoWithLog[]
  loadingPhotos: boolean
  photosError: string | null
  /** Admin: all worker logs + photos for denter/painter/etc. */
  adminWorkReview?: boolean
  children?: ReactNode
}

export function BodyshopFloorWorkVehicleDetailPanel({
  jobCardNumber,
  vehicleMeta,
  assignmentRow,
  qcStatus,
  allPhotos,
  loadingPhotos,
  photosError,
  adminWorkReview = false,
  children,
}: Props) {
  const summary = useMemo(
    () => buildFloorWorkVehicleStatusSummary(assignmentRow, qcStatus, vehicleMeta),
    [assignmentRow, qcStatus, vehicleMeta],
  )

  const [logs, setLogs] = useState<BodyshopFloorRoleDailyLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [photosByLogIdFetched, setPhotosByLogIdFetched] = useState<
    Record<number, BodyshopFloorRoleDailyLogPhotoRow[]>
  >({})
  const [thumbByPhotoId, setThumbByPhotoId] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    setLogsLoading(true)
    setLogsError(null)
    setPhotosByLogIdFetched({})
    void fetchRoleDailyLogsForVehicleKeys(jobCardNumber, vehicleMeta, adminWorkReview ? 200 : 80).then(async (res) => {
      if (cancelled) return
      if (res.error) {
        setLogsError(res.error)
        setLogs([])
        setLogsLoading(false)
        return
      }
      const rows = res.data ?? []
      setLogs(rows)
      if (rows.length === 0) {
        setLogsLoading(false)
        return
      }
      const ph = await fetchRoleDailyLogPhotos(rows.map((r) => r.id))
      if (cancelled) return
      const byLog: Record<number, BodyshopFloorRoleDailyLogPhotoRow[]> = {}
      for (const p of ph.data ?? []) {
        const list = byLog[p.log_id] ?? []
        list.push(p)
        byLog[p.log_id] = list
      }
      for (const id of Object.keys(byLog)) {
        byLog[Number(id)].sort((a, b) => {
          const o = (a.sort_order ?? 0) - (b.sort_order ?? 0)
          if (o !== 0) return o
          return a.id - b.id
        })
      }
      setPhotosByLogIdFetched(byLog)
      setLogsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [jobCardNumber, vehicleMeta, adminWorkReview])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<number, string> = {}
      const seen = new Set<number>()
      for (const p of allPhotos) {
        seen.add(p.id)
        const url = await resolveRoleLogPhotoPreviewUrl(p, 3600)
        if (url) next[p.id] = url
      }
      for (const list of Object.values(photosByLogIdFetched)) {
        for (const p of list) {
          if (seen.has(p.id)) continue
          seen.add(p.id)
          const url = await resolveRoleLogPhotoPreviewUrl(p, 3600)
          if (url) next[p.id] = url
        }
      }
      if (!cancelled) setThumbByPhotoId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [allPhotos, photosByLogIdFetched])

  const photosByLogId = useMemo(() => {
    const map = new Map<number, FloorWorkPhotoWithLog[]>()
    for (const p of allPhotos) {
      const list = map.get(p.log_id) ?? []
      list.push(p)
      map.set(p.log_id, list)
    }
    return map
  }, [allPhotos])

  const latestByRole = useMemo(() => latestLogByRole(logs), [logs])

  const renderLogPhotoThumbs = (
    logId: number,
    max: number | null,
  ) => {
    const fromGallery = photosByLogId.get(logId) ?? []
    const fromFetch = photosByLogIdFetched[logId] ?? []
    const merged: Array<FloorWorkPhotoWithLog | BodyshopFloorRoleDailyLogPhotoRow> = []
    const ids = new Set<number>()
    for (const p of fromGallery) {
      if (ids.has(p.id)) continue
      ids.add(p.id)
      merged.push(p)
    }
    for (const p of fromFetch) {
      if (ids.has(p.id)) continue
      ids.add(p.id)
      merged.push(p)
    }
    const slice = max == null ? merged : merged.slice(0, max)
    if (slice.length === 0) return null
    return (
      <div className="bfw-log-card__thumb-row">
        {slice.map((p) => (
          <button
            key={p.id}
            type="button"
            className="bfw-log-card__thumb-btn"
            title={p.file_name ?? 'Open photo'}
            onClick={() => void openRoleDailyLogPhoto(p).then((res) => {
              if (res.data) window.open(res.data, '_blank', 'noopener,noreferrer')
            })}
          >
            {thumbByPhotoId[p.id] ? (
              <img
                src={thumbByPhotoId[p.id]}
                alt=""
                className="bfw-log-card__thumb"
                loading="lazy"
              />
            ) : (
              <span className="bfw-log-card__thumb-ph">Photo</span>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="bfw-detail">
      <header className="bfw-detail__hero">
        <div>
          <h2 className="bfw-detail__title">{floorWorkVehicleTitle(vehicleMeta, jobCardNumber)}</h2>
          <p className="bfw-detail__sub">{floorWorkVehicleSubtitle(vehicleMeta, jobCardNumber)}</p>
          <p className="bfw-detail__meta">
            {floorWorkStandingLine(vehicleMeta) ?? 'Time on floor —'}
            {' · '}
            JC {jobCardNumber}
          </p>
        </div>
        <div className="bfw-detail__status-card">
          <div className="bfw-detail__headline">{summary.headline}</div>
          <div className="bfw-detail__subline">{summary.subline}</div>
          {!assignmentRow ? (
            <p className="bfw-detail__subline" style={{ marginTop: 8 }}>
              <Link to="/bodyshop-floor">Assign roles on Bodyshop Floor</Link>
              {' '}for this registration / job card, then refresh this page.
            </p>
          ) : null}
          <div className="bfw-detail__qc">{summary.qcLabel}</div>
        </div>
      </header>

      <section className="bfw-detail__section">
        <h3 className="bfw-detail__section-title">Pipeline — who &amp; status</h3>
        <div className="bfw-pipeline-grid">
          {summary.steps.map((step) => (
            <div
              key={step.stepIndex}
              className={`bfw-pipeline-step bfw-pipeline-step--${step.stepState}`}
            >
              <div className="bfw-pipeline-step__head">
                <span className="bfw-pipeline-step__title">{step.stepTitle}</span>
                <span className={`bfw-pipeline-step__state bfw-pipeline-step__state--${step.stepState}`}>
                  {step.stepState === 'active' ? 'Running' : step.stepState === 'done' ? 'Done' : 'Waiting'}
                </span>
              </div>
              {step.roles.length === 0 ? (
                <p className="bfw-detail__empty">No roles assigned</p>
              ) : (
                <ul className="bfw-pipeline-step__roles">
                  {step.roles.map((r) => (
                    <li key={r.role}>
                      <span className="bfw-pipeline-step__role">{r.roleLabel}</span>
                      <span className="bfw-pipeline-step__who">{r.assignee}</span>
                      <span className={TONE_CLASS[r.tone]}>{r.statusLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bfw-detail__section bfw-detail__section--work">
        <h3 className="bfw-detail__section-title">Work submitted — Dentor / Painter / …</h3>
        <p className="bfw-detail__muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Notes and photos from each worker. Click a photo to open full size.
        </p>
        {logsLoading ? <p className="bfw-detail__muted">Loading worker logs…</p> : null}
        {logsError ? <p className="bfw-detail__err">{logsError}</p> : null}
        {!logsLoading && !logsError && logs.length === 0 ? (
          <p className="bfw-detail__muted">No Floor Work app submissions for this vehicle yet.</p>
        ) : null}

        {!logsLoading && logs.length > 0 ? (
          <div className="bfw-role-highlight-grid">
            {HIGHLIGHT_ROLES.map((roleKey) => {
              const log = latestByRole.get(roleKey)
              if (!log) return null
              const roleLabel = BODYSHOP_FLOOR_WORK_ROLE_LABELS[roleKey]
              const photoCount = (photosByLogIdFetched[log.id] ?? []).length
              return (
                <article key={roleKey} className="bfw-role-highlight">
                  <div className="bfw-role-highlight__head">
                    <strong>{roleLabel}</strong>
                    <span className="bfw-role-highlight__who">{log.employee_name ?? log.employee_code}</span>
                  </div>
                  <p className="bfw-detail__muted bfw-role-highlight__date">
                    Last update · {log.update_date}
                    {log.is_support ? ' · support' : ''}
                  </p>
                  {log.note_text?.trim() ? (
                    <p className="bfw-log-card__note">{log.note_text.trim()}</p>
                  ) : (
                    <p className="bfw-detail__muted bfw-log-card__note">No note</p>
                  )}
                  {photoCount > 0 ? (
                    <div className="bfw-log-card__photos">
                      <span className="bfw-log-card__photo-label">
                        {photoCount} photo{photoCount === 1 ? '' : 's'}
                      </span>
                      {renderLogPhotoThumbs(log.id, adminWorkReview ? null : 12)}
                    </div>
                  ) : (
                    <p className="bfw-detail__muted">No photos on this update</p>
                  )}
                </article>
              )
            })}
          </div>
        ) : null}

        {logs.length > 0 ? (
          <>
            <h4 className="bfw-detail__subsection-title">
              All entries {logs.length > 0 ? `(${logs.length})` : ''}
            </h4>
            <div className="bfw-log-list">
              {logs.map((log) => {
                const role = log.floor_role as BodyshopFloorWorkLogRole
                const roleLabel = BODYSHOP_FLOOR_WORK_ROLE_LABELS[role] ?? log.floor_role
                const photoCount = (photosByLogIdFetched[log.id] ?? []).length
                return (
                  <article key={log.id} className="bfw-log-card">
                    <div className="bfw-log-card__top">
                      <strong>
                        {log.update_date} · {roleLabel}
                        {log.is_support ? ' (support)' : ''}
                      </strong>
                      <span>{log.employee_name ?? log.employee_code}</span>
                    </div>
                    {log.note_text?.trim() ? (
                      <p className="bfw-log-card__note">{log.note_text.trim()}</p>
                    ) : (
                      <p className="bfw-detail__muted bfw-log-card__note">No work note</p>
                    )}
                    {photoCount > 0 ? (
                      <div className="bfw-log-card__photos">
                        <span className="bfw-log-card__photo-label">
                          {photoCount} photo{photoCount === 1 ? '' : 's'}
                        </span>
                        {renderLogPhotoThumbs(log.id, adminWorkReview ? null : 6)}
                      </div>
                    ) : (
                      <p className="bfw-detail__muted">No photos on this log</p>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        ) : null}
      </section>

      {children ? <section className="bfw-detail__section">{children}</section> : null}

      <details className="bfw-detail__expand" open>
        <summary className="bfw-detail__expand-summary">
          All floor work photos
          {allPhotos.length > 0 ? ` (${allPhotos.length})` : ''}
        </summary>
        <div className="bfw-detail__expand-body">
          {photosError ? <p className="bfw-detail__err">{photosError}</p> : null}
          {loadingPhotos ? (
            <p className="bfw-detail__muted">Loading photos…</p>
          ) : (
            <BodyshopFloorWorkPhotoGallery
              photos={allPhotos}
              title={`${allPhotos.length} photo(s) — oldest first`}
            />
          )}
        </div>
      </details>
    </div>
  )
}
