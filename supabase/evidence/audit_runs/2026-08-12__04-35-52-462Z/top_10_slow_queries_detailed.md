# Top 10 Slow Queries (Detailed) - 2026-08-12T04:35:52.462Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| -2876120296317350531 | supabase_admin | 2082724 | 8.166468214953 | 3.053744 | 14523.515393 | 17008499.346519 | 2083193 | 100.000000 | 11.971760 |
| 852176900607336119 | authenticated | 7797 | 1551.205394833010 | 0.016122 | 7920.013424 | 12094748.463513 | 7797 | 99.999959 | 8.513122 |
| 4868736656759022764 | authenticated | 6773 | 878.448567597223 | 1.215084 | 7858.096532 | 5949732.148336 | 6773 | 99.999874 | 4.187834 |
| 8843009277484467611 | authenticated | 1074 | 4791.000142817500 | 236.055823 | 7959.964216 | 5145534.153386 | 1074 | 99.999997 | 3.621783 |
| 3787216458397661678 | authenticated | 8951 | 546.853115928610 | 0.027627 | 7709.788822 | 4894882.240677 | 8951 | 100.000000 | 3.445357 |
| -397576279058981298 | authenticated | 1356 | 3507.673686116520 | 104.037250 | 7938.084773 | 4756405.518374 | 1356 | 99.999997 | 3.347888 |
| -2147031708195470770 | authenticated | 2890 | 1183.024293582700 | 0.023032 | 7246.014802 | 3418940.208454 | 2890 | 100.000000 | 2.406487 |
| 8976932172498995662 | authenticated | 17876 | 175.277352132356 | 0.542312 | 4438.703738 | 3133257.946718 | 17876 | 99.999828 | 2.205404 |
| 3109077696112254485 | authenticated | 1008 | 2945.813859349210 | 103.932720 | 7978.726952 | 2969380.370224 | 1008 | 100.000000 | 2.090056 |
| 1012486468402746359 | authenticated | 387 | 6838.525888149870 | 692.680260 | 7988.416198 | 2646509.518714 | 387 | 99.999988 | 1.862797 |

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

### queryid 4868736656759022764

```sql
WITH pgrst_source AS (SELECT "pgrst_call".* FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "p_created_at_from", "p_created_at_to", "p_page_size", "p_cursor_created_at", "p_cursor_id", "p_service_types", "p_search_query", "p_require_non_empty_jc" FROM json_to_record(pgrst_payload.json_data) AS _("p_created_at_from" timestamp with time zone, "p_created_at_to" timestamp with time zone, "p_page_size" integer, "p_cursor_created_at" timestamp with time zone, "p_cursor_id" bigint, "p_service_types" text[], "p_search_query" text, "p_require_non_empty_jc" boolean) LIMIT $4) pgrst_body , LATERAL "public"."list_reception_entries_page"("p_created_at_from" := pgrst_body."p_created_at_from", "p_created_at_to" := pgrst_body."p_created_at_to", "p_page_size" := pgrst_body."p_page_size", "p_cursor_created_at" := pgrst_body."p_cursor_created_at", "p_cursor_id" := pgrst_body."p_cursor_id", "p_service_types" := pgrst_body."p_service_types", "p_search_query" := pgrst_body."p_search_query", "p_require_non_empty_jc" := pgrst_body."p_require_non_empty_jc") pgrst_call) SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM (SELECT "service_reception_entries".* FROM "pgrst_source" AS "service_reception_entries"   LIMIT $2 OFFSET $3) _postgrest_t
```

### queryid 8843009277484467611

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3787216458397661678

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3)) AND  "public"."service_reception_entries"."created_at" >= $4 AND  "public"."service_reception_entries"."created_at" <= $5  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $6 OFFSET $7 )  SELECT $8::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $9) AS body, nullif(current_setting($10, $11), $12) AS response_headers, nullif(current_setting($13, $14), $15) AS response_status, $16 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -397576279058981298

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."portal" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2147031708195470770

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."id" < $1  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8976932172498995662

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status" FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)    LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3109077696112254485

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."portal" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2 AND  "public"."service_reception_entries"."service_type" = ANY ($3)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL AND  "public"."service_reception_entries"."jc_number" <> $4  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $5 OFFSET $6 )  SELECT $7::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $8) AS body, nullif(current_setting($9, $10), $11) AS response_headers, nullif(current_setting($12, $13), $14) AS response_status, $15 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 1012486468402746359

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1   LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
