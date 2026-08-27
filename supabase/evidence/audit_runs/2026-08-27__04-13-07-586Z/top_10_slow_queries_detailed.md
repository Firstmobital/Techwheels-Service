# Top 10 Slow Queries (Detailed) - 2026-08-27T04:13:07.586Z

| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 4868736656759022764 | authenticated | 79722 | 376.871577956734 | 1.215084 | 7992.835593 | 30044955.937867 | 79722 | 99.999967 | 12.545434 |
| -2876120296317350531 | supabase_admin | 3308315 | 7.802658093541 | 3.053744 | 14523.515393 | 25813650.810734 | 3310420 | 100.000000 | 10.778630 |
| 852176900607336119 | authenticated | 7799 | 1551.242206298750 | 0.016122 | 7920.013424 | 12098137.966924 | 7799 | 99.999959 | 5.051643 |
| 9034250094703622185 | authenticated | 1419 | 5075.212599570110 | 74.372166 | 7949.892234 | 7201726.678790 | 1419 | 99.999834 | 3.007120 |
| 8976932172498995662 | authenticated | 44979 | 153.676092832323 | 0.542312 | 4438.703738 | 6912196.979505 | 44979 | 99.999923 | 2.886225 |
| -6635419992937290236 | authenticated | 5894 | 1112.333650270450 | 54.710375 | 2661.591987 | 6556094.534694 | 5894 | 100.000000 | 2.737533 |
| -2147031708195470770 | authenticated | 5242 | 1228.634454331930 | 0.023032 | 7425.456072 | 6440501.809608 | 5242 | 100.000000 | 2.689266 |
| -7693544260640056809 | authenticated | 3006 | 1988.929716046910 | 7.020358 | 7818.319344 | 5978722.726437 | 3006 | 99.999962 | 2.496448 |
| -6327570512180762919 | authenticated | 44167 | 129.250524283786 | 1.431074 | 2526.413916 | 5708607.906042 | 44167 | 99.999994 | 2.383660 |
| 8843009277484467611 | authenticated | 1074 | 4791.000142817500 | 236.055823 | 7959.964216 | 5145534.153386 | 1074 | 99.999997 | 2.148546 |

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

### queryid 9034250094703622185

```sql
WITH pgrst_source AS ( SELECT "public"."post_service_feedback_messages"."id" FROM "public"."post_service_feedback_messages" WHERE NOT "public"."post_service_feedback_messages"."sent_at" IS NULL   LIMIT $1 OFFSET $2 ) , pgrst_source_count AS (SELECT $3  FROM "public"."post_service_feedback_messages" WHERE NOT "public"."post_service_feedback_messages"."sent_at" IS NULL) SELECT (SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, $4::text AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8976932172498995662

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments"."job_card_number", "public"."technician_assignments"."work_status" FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)    LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -6635419992937290236

```sql
WITH pgrst_source AS ( SELECT "public"."parts_requests".* FROM "public"."parts_requests"  ORDER BY "public"."parts_requests"."created_at" DESC  LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -2147031708195470770

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."id" < $1  ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -7693544260640056809

```sql
WITH pgrst_source AS ( SELECT "public"."bodyshop_repair_cards"."id", "public"."bodyshop_repair_cards"."reception_entry_id", "public"."bodyshop_repair_cards"."job_card_no", "public"."bodyshop_repair_cards"."bodyshop_floor", "public"."bodyshop_repair_cards"."current_stage", "public"."bodyshop_repair_cards"."additional_approval", "public"."bodyshop_repair_cards"."qc_status", "public"."bodyshop_repair_cards"."qc_fail_reason", "public"."bodyshop_repair_cards"."qc_checked_by", "public"."bodyshop_repair_cards"."qc_checked_at", "public"."bodyshop_repair_cards"."reinspection_status", "public"."bodyshop_repair_cards"."reinspection_type", "public"."bodyshop_repair_cards"."reinspection_by", "public"."bodyshop_repair_cards"."reinspection_at", "public"."bodyshop_repair_cards"."updated_at", "public"."bodyshop_repair_cards"."created_at" FROM "public"."bodyshop_repair_cards"   LIMIT $1 OFFSET $2 )  SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, nullif(current_setting($5, $6), $7) AS response_headers, nullif(current_setting($8, $9), $10) AS response_status, $11 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid -6327570512180762919

```sql
WITH pgrst_source AS ( SELECT "public"."technician_assignments".* FROM "public"."technician_assignments" WHERE  "public"."technician_assignments"."job_card_number" = ANY ($1)   ORDER BY "public"."technician_assignments"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```

### queryid 8843009277484467611

```sql
WITH pgrst_source AS ( SELECT "public"."service_reception_entries"."id", "public"."service_reception_entries"."reg_number", "public"."service_reception_entries"."model", "public"."service_reception_entries"."service_type", "public"."service_reception_entries"."sa_name", "public"."service_reception_entries"."sa_employee_code", "public"."service_reception_entries"."jc_number", "public"."service_reception_entries"."owner_name", "public"."service_reception_entries"."owner_phone", "public"."service_reception_entries"."branch", "public"."service_reception_entries"."location", "public"."service_reception_entries"."portal", "public"."service_reception_entries"."branch_label", "public"."service_reception_entries"."km_reading", "public"."service_reception_entries"."source", "public"."service_reception_entries"."created_at" FROM "public"."service_reception_entries" WHERE  "public"."service_reception_entries"."service_type" = ANY ($1)  AND NOT "public"."service_reception_entries"."jc_number" IS NULL  ORDER BY "public"."service_reception_entries"."created_at" DESC , "public"."service_reception_entries"."id" DESC  LIMIT $2 OFFSET $3 )  SELECT $4::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $5) AS body, nullif(current_setting($6, $7), $8) AS response_headers, nullif(current_setting($9, $10), $11) AS response_status, $12 AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
