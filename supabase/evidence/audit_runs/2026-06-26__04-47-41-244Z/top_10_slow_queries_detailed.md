# Top 10 Slow Queries (Detailed) - 2026-06-26T04:47:41.244Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 6416750758406621842 | authenticated | 38414 | 2157.829014353540 | 0.085848 | 7994.818713 | 82890843.757377 | 38414 | 99.9999999098379352 | 44.9309054367099000 |
| -5344960703026327435 | authenticated | 6665 | 2110.660840598500 | 109.996363 | 7970.778383 | 14067554.502589 | 6665 | 100.0000000000000000 | 7.6253049484170300 |
| -6712128630152386476 | authenticated | 5106 | 1955.621891128680 | 10.296223 | 7971.796774 | 9985405.376103 | 5106 | 99.9999902185421141 | 5.4125797779802400 |
| -225245605736690330 | authenticated | 3209 | 1303.041730538790 | 114.246486 | 7793.894959 | 4181460.913299 | 3209 | 99.9999975297098401 | 2.2665570329173400 |
| -5044213774447814878 | authenticated | 3056 | 1278.566266602090 | 0.018838 | 7148.082687 | 3907298.510736 | 3056 | 100.0000000000000000 | 2.1179475553746300 |
| -2876120296317350531 | supabase_admin | 612039 | 6.262175815873 | 3.378710 | 14862.932423 | 3832695.824171 | 612039 | 99.9999998765094468 | 2.0775092379027300 |
| 3220864789079889211 | postgres | 4115 | 735.412797910327 | 1.658808 | 83360.270320 | 3026223.663401 | 4115 | 99.9998360449398298 | 1.6403617466917500 |
| -2647655532108368607 | postgres | 4354 | 667.356317525263 | 63.536723 | 28689.976900 | 2905669.406505 | 339612 | 99.9984099979329973 | 1.5750154228873800 |
| -922008049376959953 | authenticated | 2254 | 1170.401992885980 | 2.936267 | 7982.198723 | 2638086.091965 | 2254 | 99.9999210331297847 | 1.4299721339418800 |
| 852176900607336119 | authenticated | 2242 | 1170.325685710970 | 1.063163 | 7973.687440 | 2623870.187364 | 2242 | 100.0000000000000000 | 1.4222664159593900 |

## Query Text

### queryid 6416750758406621842

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2   LIMIT $3 OFFSET $4 ) , pgrst_source_count AS (SELECT $7  FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $5 AND  "public"."service_reception_entries"."created_at" <= $6) SELECT (SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, $8::text AS body, nullif(current_setting($9, $10), $11) AS response_headers, nullif(current_setting($12, $13), $14) AS response_status, $15 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -5344960703026327435

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries"  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -6712128630152386476

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status", "public"."technician_assignments"."technician_code" FROM "public"."technician_assignments"   LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -225245605736690330

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -5044213774447814878

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."assigned_at" >= $1 AND  "public"."technician_assignments"."assigned_at" <= $2  ORDER BY "public"."technician_assignments"."updated_at" DESC , "public"."technician_assignments"."assigned_at" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2876120296317350531

```sql
SELECT wal->>$5 as type,
       wal->>$6 as schema,
       wal->>$7 as table,
       COALESCE(wal->>$8, $9) as columns,
       COALESCE(wal->>$10, $11) as record,
       COALESCE(wal->>$12, $13) as old_record,
       wal->>$14 as commit_timestamp,
       subscription_ids,
       errors,
       slot_changes_count
FROM realtime.list_changes($1, $2, $3, $4)
```

### queryid 3220864789079889211

```sql
SELECT public.process_all_service_history_sync_queue($1)
```

### queryid -2647655532108368607

```sql
SELECT
  e.name,
  n.nspname AS schema,
  e.default_version,
  x.extversion AS installed_version,
  e.comment,
  ev.schema AS default_version_schema
FROM
  pg_available_extensions e
  LEFT JOIN pg_extension x ON e.name = x.extname
  LEFT JOIN pg_namespace n ON x.extnamespace = n.oid
  LEFT JOIN pg_available_extension_versions ev
    ON ev.name = e.name AND ev.version = e.default_version
```

### queryid -922008049376959953

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."source", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."service_type" FROM "public"."service_reception_entries"  ORDER BY "public"."service_reception_entries"."created_at" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 852176900607336119

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
