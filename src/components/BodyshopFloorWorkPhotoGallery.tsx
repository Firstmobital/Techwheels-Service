import { useEffect, useState } from 'react'
import { BODYSHOP_FLOOR_WORK_ROLE_LABELS } from '../lib/bodyshopFloorWork/roles'
import type { FloorWorkPhotoWithLog } from '../lib/api/bodyshopFloorRoleWorkLog'
import { createSignedRoleLogPhotoUrl, openRoleDailyLogPhoto } from '../lib/api/bodyshopFloorRoleWorkLog'

function photoRowIndex(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index)
  return `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26)}`
}

type Props = {
  photos: FloorWorkPhotoWithLog[]
  title?: string
}

export function BodyshopFloorWorkPhotoGallery({ photos, title = 'All work photos (oldest → newest)' }: Props) {
  const [thumbById, setThumbById] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<number, string> = {}
      for (const p of photos) {
        if (p.drive_url) continue
        const res = await createSignedRoleLogPhotoUrl(p.storage_bucket, p.storage_path, 3600)
        if (res.data) next[p.id] = res.data
      }
      if (!cancelled) setThumbById(next)
    })()
    return () => {
      cancelled = true
    }
  }, [photos])

  if (photos.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No photos uploaded for this vehicle yet.</p>
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{title}</h3>
      <div className="tbl-wrap scroll">
        <table className="tbl" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th style={{ width: 88 }}>Preview</th>
              <th>Uploaded by</th>
              <th>Role</th>
              <th>Work date (IST)</th>
              <th>File</th>
              <th style={{ width: 72 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {photos.map((p, idx) => {
              const name =
                String(p.log_employee_name ?? '').trim() ||
                String(p.log_employee_code ?? '').trim() ||
                'Unknown'
              const role = BODYSHOP_FLOOR_WORK_ROLE_LABELS[p.log_floor_role] ?? p.log_floor_role
              const preview = p.drive_url || thumbById[p.id] || ''
              return (
                <tr key={p.id}>
                  <td>{photoRowIndex(idx)}</td>
                  <td>
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border, #e5e7eb)' }}
                      />
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>…</span>
                    )}
                  </td>
                  <td><strong>{name}</strong></td>
                  <td>{role}</td>
                  <td>{p.log_update_date}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.file_name ?? `Photo ${p.sort_order + 1}`}
                    {p.drive_url ? ' · Drive' : ''}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      onClick={() =>
                        void openRoleDailyLogPhoto(p).then((res) => {
                          if (res.data) window.open(res.data, '_blank', 'noopener,noreferrer')
                        })
                      }
                    >
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
