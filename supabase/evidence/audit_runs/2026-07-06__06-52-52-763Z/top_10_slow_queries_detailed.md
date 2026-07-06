# Top 10 Slow Queries (Detailed) - 2026-07-06T06:52:52.763Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 6416750758406621842 | authenticated | 38443 | 2157.947129398980 | 0.085848 | 7994.818713 | 82957961.495485 | 38443 | 99.9999999098845709 | 32.9945334819321000 |
| -5344960703026327435 | authenticated | 11096 | 2415.248574743150 | 109.996363 | 7970.778383 | 26799598.185350 | 11096 | 100.0000000000000000 | 10.6588954657111000 |
| 3220864789079889211 | postgres | 18636 | 677.560653263842 | 1.653406 | 104200.037291 | 12627020.334225 | 18636 | 99.9940473438683434 | 5.0220935722642900 |
| -6712128630152386476 | authenticated | 5109 | 1957.004129632610 | 10.296223 | 7971.796774 | 9998334.098293 | 5109 | 99.9999902306090779 | 3.9765968596953300 |
| 4251000708073776526 | anon | 26074 | 255.555061751975 | 0.850813 | 2880.988136 | 6663342.680121 | 26074 | 99.9992030766646886 | 2.6501842523312900 |
| -225245605736690330 | authenticated | 4549 | 1329.089415637940 | 112.179006 | 7793.894959 | 6046027.751737 | 4549 | 99.9999966292007669 | 2.4046620901869000 |
| 7336725908253715888 | authenticated | 11510 | 478.369075533450 | 0.183027 | 7377.871056 | 5506028.059390 | 11510 | 100.0000000000000000 | 2.1898902032192300 |
| 6462467893367818088 | authenticated | 1933 | 2373.042633141230 | 25.029095 | 7437.968206 | 4587091.409862 | 1933 | 99.9998838152531910 | 1.8244052575425500 |
| -2647655532108368607 | postgres | 5441 | 724.515237135451 | 63.536723 | 31327.461308 | 3942087.405254 | 424398 | 99.9987710760458143 | 1.5678704314405600 |
| -5044213774447814878 | authenticated | 3062 | 1278.081436574460 | 0.018838 | 7148.082687 | 3913485.358791 | 3062 | 100.0000000000000000 | 1.5564946555335600 |

## Query Text

### queryid 6416750758406621842

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2   LIMIT $3 OFFSET $4 ) , pgrst_source_count AS (SELECT $7  FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $5 AND  "public"."service_reception_entries"."created_at" <= $6) SELECT (SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, $8::text AS body, nullif(current_setting($9, $10), $11) AS response_headers, nullif(current_setting($12, $13), $14) AS response_status, $15 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -5344960703026327435

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries"  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3220864789079889211

```sql
SELECT public.process_all_service_history_sync_queue($1)
```

### queryid -6712128630152386476

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status", "public"."technician_assignments"."technician_code" FROM "public"."technician_assignments"   LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 4251000708073776526

```sql
WITH pgrst_source AS ( SELECT "public"."all_service_data_dynamic"."chassis_no", "public"."all_service_data_dynamic"."fuel_tp", "public"."all_service_data_dynamic"."priority_bucket", "public"."all_service_data_dynamic"."priority_score", "public"."all_service_data_dynamic"."updated_by_robot" FROM "public"."all_service_data_dynamic" WHERE  "public"."all_service_data_dynamic"."fuel_tp" = $1 AND  "public"."all_service_data_dynamic"."updated_by_robot" IS NULL  ORDER BY "public"."all_service_data_dynamic"."priority_bucket" ASC , "public"."all_service_data_dynamic"."priority_score" ASC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -225245605736690330

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 7336725908253715888

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3))  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $4 OFFSET $5 )  SELECT $6::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $7) AS body, nullif(current_setting($8, $9), $10) AS response_headers, nullif(current_setting($11, $12), $13) AS response_status, $14 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 6462467893367818088

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."id", "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status", "public"."technician_assignments"."technician_code" FROM "public"."technician_assignments"  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
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

### queryid -5044213774447814878

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."assigned_at" >= $1 AND  "public"."technician_assignments"."assigned_at" <= $2  ORDER BY "public"."technician_assignments"."updated_at" DESC , "public"."technician_assignments"."assigned_at" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
