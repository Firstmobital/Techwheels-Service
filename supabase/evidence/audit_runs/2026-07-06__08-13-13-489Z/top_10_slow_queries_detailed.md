# Top 10 Slow Queries (Detailed) - 2026-07-06T08:13:13.489Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3220864789079889211 | postgres | 22 | 1413.311282000000 | 10.958160 | 2398.721595 | 31092.848204 | 22 | 100.0000000000000000 | 31.7832474836807000 |
| -3550207178760076775 | authenticated | 8 | 1273.557644875000 | 477.517360 | 2180.768921 | 10188.461159 | 8 | 100.0000000000000000 | 10.4146902326145000 |
| -6279881906384027513 | authenticated | 4 | 1561.732386750000 | 1489.635576 | 1656.796338 | 6246.929547 | 4 | 100.0000000000000000 | 6.3856391187693000 |
| 852176900607336119 | authenticated | 7 | 874.600740714286 | 677.016144 | 1461.763337 | 6122.205185 | 7 | 100.0000000000000000 | 6.2581453221675400 |
| 6462467893367818088 | authenticated | 2 | 3057.925083500000 | 2682.091185 | 3433.758982 | 6115.850167 | 2 | 100.0000000000000000 | 6.2516491945522200 |
| -2647655532108368607 | postgres | 12 | 502.101627833333 | 209.057815 | 909.518330 | 6025.219534 | 936 | 100.0000000000000000 | 6.1590061591074600 |
| 8843009277484467611 | authenticated | 1 | 3848.709367000000 | 3848.709367 | 3848.709367 | 3848.709367 | 1 | 100.0000000000000000 | 3.9341678028835100 |
| 4198387656238320733 | authenticated | 1 | 2472.529320000000 | 2472.529320 | 2472.529320 | 2472.529320 | 1 | 100.0000000000000000 | 2.5274304487199400 |
| -2722561837642443195 | anon | 32 | 72.118587062500 | 4.073870 | 375.764826 | 2307.794786 | 32 | 100.0000000000000000 | 2.3590380766580800 |
| 7306672297351416794 | anon | 27 | 67.948600555556 | 13.059171 | 133.083824 | 1834.612215 | 27 | 98.4907497565725414 | 1.8753487516922700 |

## Query Text

### queryid 3220864789079889211

```sql
SELECT public.process_all_service_history_sync_queue($1)
```

### queryid -3550207178760076775

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3)) AND  "public"."service_reception_entries"."service_type" = ANY ($4)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $5 AND  "public"."service_reception_entries"."created_at" >= $6 AND  "public"."service_reception_entries"."created_at" <= $7  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $8 OFFSET $9 )  SELECT $10::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $11) AS body, nullif(current_setting($12, $13), $14) AS response_headers, nullif(current_setting($15, $16), $17) AS response_status, $18 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -6279881906384027513

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $2 AND  "public"."service_reception_entries"."created_at" >= $3 AND  "public"."service_reception_entries"."created_at" <= $4  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $5 OFFSET $6 )  SELECT $7::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $8) AS body, nullif(current_setting($9, $10), $11) AS response_headers, nullif(current_setting($12, $13), $14) AS response_status, $15 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 852176900607336119

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
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

### queryid 8843009277484467611

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 4198387656238320733

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."id", "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status" FROM "public"."technician_assignments"  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2722561837642443195

```sql
WITH pgrst_source AS ( SELECT "public"."temp_data"."id", "public"."temp_data"."vehicle_registration_number", "public"."temp_data"."chassis_no", "public"."temp_data"."fuel_type" FROM "public"."temp_data" WHERE  "public"."temp_data"."chassis_no" IS NULL AND  "public"."temp_data"."fuel_type" = $1  ORDER BY "public"."temp_data"."id" ASC  LIMIT $2 OFFSET $3 )  SELECT null::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), '[]') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 7306672297351416794

```sql
WITH pgrst_source AS (UPDATE "public"."all_service_data" SET "extended_warranty_end_date" = "pgrst_body"."extended_warranty_end_date", "last_service_date" = "pgrst_body"."last_service_date", "last_service_dealer" = "pgrst_body"."last_service_dealer", "last_service_km" = "pgrst_body"."last_service_km", "last_updated_at" = "pgrst_body"."last_updated_at", "model" = "pgrst_body"."model", "product_line" = "pgrst_body"."product_line", "scheduled_next_service_date" = "pgrst_body"."scheduled_next_service_date", "scheduled_next_service_type" = "pgrst_body"."scheduled_next_service_type", "updated_by_robot" = "pgrst_body"."updated_by_robot", "updated_by_robot_at" = "pgrst_body"."updated_by_robot_at", "vehicle_registration_number" = "pgrst_body"."vehicle_registration_number", "vehicle_sale_date" = "pgrst_body"."vehicle_sale_date" FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "extended_warranty_end_date", "last_service_date", "last_service_dealer", "last_service_km", "last_updated_at", "model", "product_line", "scheduled_next_service_date", "scheduled_next_service_type", "updated_by_robot", "updated_by_robot_at", "vehicle_registration_number", "vehicle_sale_date" FROM json_to_record(pgrst_payload.json_data) AS _("extended_warranty_end_date" date, "last_service_date" timestamp with time zone, "last_service_dealer" text, "last_service_km" text, "last_updated_at" timestamp with time zone, "model" text, "product_line" text, "scheduled_next_service_date" date, "scheduled_next_service_type" text, "updated_by_robot" boolean, "updated_by_robot_at" timestamp with time zone, "vehicle_registration_number" text, "vehicle_sale_date" date) ) pgrst_body  WHERE  "public"."all_service_data"."chassis_no" = $2 RETURNING "public"."all_service_data".*) SELECT '' AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, array[]::text[] AS header, coalesce(json_agg(_postgrest_t), '[]') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT "all_service_data".* FROM "pgrst_source" AS "all_service_data"   ) _postgrest_t
```
