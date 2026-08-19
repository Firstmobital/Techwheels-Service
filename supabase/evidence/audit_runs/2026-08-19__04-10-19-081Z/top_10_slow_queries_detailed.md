# Top 10 Slow Queries (Detailed) - 2026-08-19T04:10:19.081Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 4868736656759022764 | authenticated | 39234 | 597.000013701435 | 1.215084 | 7992.835593 | 23422698.537562 | 39234 | 99.999927 | 12.303527 |
| -2876120296317350531 | supabase_admin | 2587915 | 8.006987246651 | 3.053744 | 14523.515393 | 20721402.400416 | 2588625 | 100.000000 | 10.884584 |
| 852176900607336119 | authenticated | 7798 | 1551.138511676710 | 0.016122 | 7920.013424 | 12095778.114055 | 7798 | 99.999959 | 6.353697 |
| 8843009277484467611 | authenticated | 1074 | 4791.000142817500 | 236.055823 | 7959.964216 | 5145534.153386 | 1074 | 99.999997 | 2.702858 |
| 9034250094703622185 | authenticated | 1068 | 4713.333044393260 | 74.372166 | 7930.070970 | 5033839.691412 | 1068 | 99.999800 | 2.644186 |
| -397576279058981298 | authenticated | 1400 | 3564.210973735720 | 104.037250 | 7938.084773 | 4989895.363230 | 1400 | 99.999997 | 2.621103 |
| 3787216458397661678 | authenticated | 8951 | 546.853115928610 | 0.027627 | 7709.788822 | 4894882.240677 | 8951 | 100.000000 | 2.571195 |
| -2147031708195470770 | authenticated | 3965 | 1223.391522202770 | 0.023032 | 7425.456072 | 4850747.385534 | 3965 | 100.000000 | 2.548011 |
| 8976932172498995662 | authenticated | 29263 | 156.191813838021 | 0.542312 | 4438.703738 | 4570641.048342 | 29263 | 99.999880 | 2.400876 |
| -6327570512180762919 | authenticated | 31481 | 137.140088143102 | 1.431074 | 2526.413916 | 4317307.114833 | 31481 | 99.999992 | 2.267805 |

## Query Text

### queryid 4868736656759022764

```sql
WITH pgrst_source AS (SELECT "pgrst_call".* FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "p_created_at_from", "p_created_at_to", "p_page_size", "p_cursor_created_at", "p_cursor_id", "p_service_types", "p_search_query", "p_require_non_empty_jc" FROM json_to_record(pgrst_payload.json_data) AS _("p_created_at_from" timestamp with time zone, "p_created_at_to" timestamp with time zone, "p_page_size" integer, "p_cursor_created_at" timestamp with time zone, "p_cursor_id" bigint, "p_service_types" text[], "p_search_query" text, "p_require_non_empty_jc" boolean) LIMIT $4) pgrst_body , LATERAL "public"."list_reception_entries_page"("p_created_at_from" := pgrst_body."p_created_at_from", "p_created_at_to" := pgrst_body."p_created_at_to", "p_page_size" := pgrst_body."p_page_size", "p_cursor_created_at" := pgrst_body."p_cursor_created_at", "p_cursor_id" := pgrst_body."p_cursor_id", "p_service_types" := pgrst_body."p_service_types", "p_search_query" := pgrst_body."p_search_query", "p_require_non_empty_jc" := pgrst_body."p_require_non_empty_jc") pgrst_call) SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM (SELECT "service_reception_entries".* FROM "pgrst_source" AS "service_reception_entries"   LIMIT $2 OFFSET $3) _postgrest_t
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

### queryid 852176900607336119

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8843009277484467611

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 9034250094703622185

```sql
WITH pgrst_source AS ( SELECT "public"."post_service_feedback_messages"."id" FROM "public"."post_service_feedback_messages" WHERE NOT "public"."post_service_feedback_messages"."sent_at" IS NULL   LIMIT $1 OFFSET $2 ) , pgrst_source_count AS (SELECT $3  FROM "public"."post_service_feedback_messages" WHERE NOT "public"."post_service_feedback_messages"."sent_at" IS NULL) SELECT (SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, $4::text AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -397576279058981298

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."portal" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."created_at" >= $1 AND  "public"."service_reception_entries"."created_at" <= $2  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $3 OFFSET $4 )  SELECT $5::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $6) AS body, nullif(current_setting($7, $8), $9) AS response_headers, nullif(current_setting($10, $11), $12) AS response_status, $13 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 3787216458397661678

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."dealer_code", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."sa_display_name", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."remark", "public"."service_reception_entries"."estimate_storage_path", "public"."service_reception_entries"."estimate_file_name", "public"."service_reception_entries"."estimate_content_type", "public"."service_reception_entries"."estimate_uploaded_at", "public"."service_reception_entries"."estimate_uploaded_by", "public"."service_reception_entries"."estimate_drive_url", "public"."service_reception_entries"."estimate_drive_file_id", "public"."service_reception_entries"."invoice_storage_path", "public"."service_reception_entries"."invoice_file_name", "public"."service_reception_entries"."invoice_content_type", "public"."service_reception_entries"."invoice_uploaded_at", "public"."service_reception_entries"."invoice_uploaded_by", "public"."service_reception_entries"."invoice_drive_url", "public"."service_reception_entries"."invoice_drive_file_id", "public"."service_reception_entries"."invoice_done_at", "public"."service_reception_entries"."invoice_done_by", "public"."service_reception_entries"."created_by", "public"."service_reception_entries"."created_at", "public"."service_reception_entries"."updated_at" FROM "public"."service_reception_entries" WHERE  ( "public"."service_reception_entries"."created_at" < $1 OR  ( "public"."service_reception_entries"."created_at" = $2 AND  "public"."service_reception_entries"."id" < $3)) AND  "public"."service_reception_entries"."created_at" >= $4 AND  "public"."service_reception_entries"."created_at" <= $5  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $6 OFFSET $7 )  SELECT $8::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $9) AS body, nullif(current_setting($10, $11), $12) AS response_headers, nullif(current_setting($13, $14), $15) AS response_status, $16 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2147031708195470770

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."id" < $1  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8976932172498995662

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status" FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)    LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -6327570512180762919

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)   ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
