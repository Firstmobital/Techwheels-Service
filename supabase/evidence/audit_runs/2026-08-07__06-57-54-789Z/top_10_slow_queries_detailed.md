# Top 10 Slow Queries (Detailed) - 2026-08-07T06:57:54.789Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| -2876120296317350531 | supabase_admin | 1654781 | 8.470882072381 | 3.053744 | 12315.854770 | 14017454.706616 | 1655097 | 100.000000 | 11.913953 |
| 852176900607336119 | authenticated | 7791 | 1552.117757243480 | 0.016122 | 7920.013424 | 12092549.446684 | 7791 | 99.999959 | 10.277905 |
| 3787216458397661678 | authenticated | 8951 | 546.853115928610 | 0.027627 | 7709.788822 | 4894882.240677 | 8951 | 100.000000 | 4.160342 |
| 8843009277484467611 | authenticated | 932 | 4679.712902664160 | 236.055823 | 7959.964216 | 4361492.425283 | 932 | 99.999996 | 3.706994 |
| -397576279058981298 | authenticated | 1190 | 3410.100858936970 | 104.037250 | 7904.277414 | 4058020.022135 | 1190 | 99.999997 | 3.449061 |
| 8976932172498995662 | authenticated | 14968 | 193.365005766636 | 0.542312 | 4438.703738 | 2894287.406315 | 14968 | 99.999814 | 2.459962 |
| -2147031708195470770 | authenticated | 2296 | 1143.245053345380 | 0.023032 | 7246.014802 | 2624890.642481 | 2296 | 100.000000 | 2.230992 |
| -3550207178760076775 | authenticated | 6947 | 363.062567263279 | 0.087433 | 5525.251598 | 2522195.654778 | 6947 | 99.999891 | 2.143707 |
| 3109077696112254485 | authenticated | 893 | 2802.516672782750 | 103.932720 | 7938.251815 | 2502647.388795 | 893 | 100.000000 | 2.127093 |
| -1851842182524549347 | authenticated | 32201 | 77.265788950871 | 0.013694 | 7971.807267 | 2488035.670007 | 32201 | 99.999874 | 2.114674 |

## Query Text

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

### queryid 852176900607336119

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3787216458397661678

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3)) AND  "public"."service_reception_entries"."created_at" >= $4 AND  "public"."service_reception_entries"."created_at" <= $5  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $6 OFFSET $7 )  SELECT $8::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $9) AS body, nullif(current_setting($10, $11), $12) AS response_headers, nullif(current_setting($13, $14), $15) AS response_status, $16 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8843009277484467611

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -397576279058981298

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."portal" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8976932172498995662

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status" FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)    LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2147031708195470770

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."id" < $1  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -3550207178760076775

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3)) AND  "public"."service_reception_entries"."service_type" = ANY ($4)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $5 AND  "public"."service_reception_entries"."created_at" >= $6 AND  "public"."service_reception_entries"."created_at" <= $7  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $8 OFFSET $9 )  SELECT $10::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $11) AS body, nullif(current_setting($12, $13), $14) AS response_headers, nullif(current_setting($15, $16), $17) AS response_status, $18 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3109077696112254485

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."portal" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2 AND  "public"."service_reception_entries"."service_type" = ANY ($3)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $4  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $5 OFFSET $6 )  SELECT $7::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $8) AS body, nullif(current_setting($9, $10), $11) AS response_headers, nullif(current_setting($12, $13), $14) AS response_status, $15 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -1851842182524549347

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2   LIMIT $3 OFFSET $4 )  SELECT null::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), '[]') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
