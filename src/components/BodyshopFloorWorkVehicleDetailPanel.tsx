import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BODYSHOP_FLOOR_WORK_ROLE_LABELS } from '../lib/bodyshopFloorWork/roles'
import type { BodyshopFloorWorkLogRole } from '../lib/bodyshopFloorWork/roles'
import type { FloorWorkVehicleMeta } from '../lib/bodyshopFloorWork/display'
import { floorWorkVehicleSubtitle, floorWorkVehicleTitle, floorWorkStandingLine } from '../lib/bodyshopFloorWork/display'
import {
  buildFloorWorkVehicleStatusSummary,
  type FloorWorkRoleStatusTone,
} from '../lib/bodyshopFloorWork/vehiclePipelineStatus'
import type { BodyshopFloorRoleDailyLogRow } from '../lib/bodyshopFloorRoleWorkLog'
import {
  createSignedRoleLogPhotoUrl,
  fetchRoleDailyLogPhotos,
  fetchRoleDailyLogsForJobCard,
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
    () => buildFloorWorkVehicleStatusSummary(assignmentRow, qcStatus),
    [assignmentRow, qcStatus],
  )

  const [logs, setLogs] = useState<BodyshopFloorRoleDailyLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [photoCountByLogId, setPhotoCountByLogId] = useState<Record<number, number>>({})
  const [thumbByPhotoId, setThumbByPhotoId] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    setLogsLoading(true)
    setLogsError(null)
    const loadLogs = adminWorkReview
      ? fetchRoleDailyLogsForVehicleKeys(jobCardNumber, vehicleMeta, 200)
      : fetchRoleDailyLogsForJobCard(jobCardNumber, 48)
    void loadLogs.then(async (res) => {
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
        setPhotoCountByLogId({})
        setLogsLoading(false)
        return
      }
      const ph = await fetchRoleDailyLogPhotos(rows.map((r) => r.id))
      if (cancelled) return
      const counts: Record<number, number> = {}
      for (const p of ph.data ?? []) {
        counts[p.log_id] = (counts[p.log_id] ?? 0) + 1
      }
      setPhotoCountByLogId(counts)
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
      for (const p of allPhotos) {
        if (p.drive_url) continue
        const res = await createSignedRoleLogPhotoUrl(p.storage_bucket, p.storage_path, 3600)
        if (res.data) next[p.id] = res.data
      }
      if (!cancelled) setThumbByPhotoId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [allPhotos])

  const photosByLogId = useMemo(() => {
    const map = new Map<number, FloorWorkPhotoWithLog[]>()
    for (const p of allPhotos) {
      const list = map.get(p.log_id) ?? []
      list.push(p)
      map.set(p.log_id, list)
    }
    return map
  }, [allPhotos])

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

      {children ? <section className="bfw-detail__section">{children}</section> : null}

      <details className="bfw-detail__expand" open={adminWorkReview}>
        <summary className="bfw-detail__expand-summary">
          {adminWorkReview ? 'All worker work — who did what (Dentor / Painter / …)' : 'Work updates — notes & photos by worker'}
          {logs.length > 0 ? ` (${logs.length})` : ''}
        </summary>
        <div className="bfw-detail__expand-body">
          {logsLoading ? <p className="bfw-detail__muted">Loading worker logs…</p> : null}
          {logsError ? <p className="bfw-detail__err">{logsError}</p> : null}
          {!logsLoading && !logsError && logs.length === 0 ? (
            <p className="bfw-detail__muted">No Floor Work app submissions yet for this vehicle.</p>
          ) : null}
          <div className="bfw-log-list">
            {logs.map((log) => {
              const role = log.floor_role as BodyshopFloorWorkLogRole
              const roleLabel = BODYSHOP_FLOOR_WORK_ROLE_LABELS[role] ?? log.floor_role
              const count = photoCountByLogId[log.id] ?? 0
              const logPhotos = photosByLogId.get(log.id) ?? []
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
                  {count > 0 ? (
                    <div className="bfw-log-card__photos">
                      <span className="bfw-log-card__photo-label">
                        {count} photo{count === 1 ? '' : 's'}
                      </span>
                      <div className="bfw-log-card__thumb-row">
                        {(adminWorkReview ? logPhotos : logPhotos.slice(0, 6)).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="bfw-log-card__thumb-btn"
                            title={p.file_name ?? 'Open photo'}
                            onClick={() => void openRoleDailyLogPhoto(p).then((res) => {
                              if (res.data) window.open(res.data, '_blank', 'noopener,noreferrer')
                            })}
                          >
                            {p.drive_url || thumbByPhotoId[p.id] ? (
                              <img
                                src={p.drive_url || thumbByPhotoId[p.id]}
                                alt=""
                                className="bfw-log-card__thumb"
                              />
                            ) : (
                              <span className="bfw-log-card__thumb-ph">Photo</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="bfw-detail__muted">No photos on this log</p>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      </details>

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
