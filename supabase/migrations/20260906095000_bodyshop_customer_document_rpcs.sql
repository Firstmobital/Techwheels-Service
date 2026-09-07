-- Body Shop Customer App: document metadata RPCs.
--
-- Reuses bodyshop_repair_card_documents + the existing 'autodoc' storage
-- bucket unchanged. Actual file bytes never pass through Postgres: the
-- customer-doc-access edge function (server-side, holds the service-role key)
-- issues signed upload/download URLs and calls customer_register_document
-- only after a successful storage write. customer_list_documents never
-- returns a raw storage_path -- the edge function resolves a short-lived
-- signed URL per request instead.

CREATE FUNCTION public.customer_list_documents(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_docs jsonb;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'doc_key', doc_key,
    'file_name', file_name,
    'content_type', content_type,
    'uploaded_at', uploaded_at
  ) ORDER BY doc_key)
  INTO v_docs
  FROM public.bodyshop_repair_card_documents
  WHERE reception_entry_id = v_ctx.reception_entry_id
    AND doc_key IN ('doc_rc', 'doc_dl', 'doc_pan', 'doc_kyc', 'doc_insurance');

  RETURN jsonb_build_object('documents', COALESCE(v_docs, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_list_documents(text) TO anon, authenticated;

-- Returns the storage path for one customer document, scoped to the caller's
-- own session -- called only by the edge function (service_role) immediately
-- before minting a signed download URL, never returned directly to the browser.
CREATE FUNCTION public.customer_resolve_document_path(p_session_token text, p_doc_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_doc record;
BEGIN
  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT storage_bucket, storage_path INTO v_doc
  FROM public.bodyshop_repair_card_documents
  WHERE reception_entry_id = v_ctx.reception_entry_id AND doc_key = p_doc_key
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF v_doc.storage_path IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  RETURN jsonb_build_object('storage_bucket', v_doc.storage_bucket, 'storage_path', v_doc.storage_path);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_resolve_document_path(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_resolve_document_path(text, text) TO service_role;

-- Registers metadata for a document the edge function has just written to
-- storage under a session-scoped path. Restricted to service_role: the
-- browser never inserts this row directly, so a forged storage_path can't be
-- attributed to another customer's repair card.
CREATE FUNCTION public.customer_register_document(
  p_session_token text,
  p_doc_key text,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_file_size_bytes bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx record;
  v_entry record;
  v_card_id bigint;
  v_doc_id bigint;
BEGIN
  IF p_doc_key NOT IN ('doc_rc', 'doc_dl', 'doc_pan', 'doc_kyc', 'doc_insurance') THEN
    RAISE EXCEPTION 'Invalid document type';
  END IF;

  SELECT * INTO v_ctx FROM public.bodyshop_customer_session_context(p_session_token);

  SELECT reg_number INTO v_entry FROM public.service_reception_entries WHERE id = v_ctx.reception_entry_id;

  SELECT id INTO v_card_id FROM public.bodyshop_repair_cards
  WHERE reception_entry_id = v_ctx.reception_entry_id
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.bodyshop_repair_card_documents (
    dealer_code, repair_card_id, reception_entry_id, reg_number, doc_key,
    storage_bucket, storage_path, file_name, content_type, file_size_bytes, uploaded_by
  ) VALUES (
    v_ctx.dealer_code, v_card_id, v_ctx.reception_entry_id, v_entry.reg_number, p_doc_key,
    'autodoc', p_storage_path, p_file_name, p_content_type, p_file_size_bytes, 'customer:' || v_ctx.mobile
  )
  RETURNING id INTO v_doc_id;

  RETURN jsonb_build_object('document_id', v_doc_id);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_register_document(text, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_register_document(text, text, text, text, text, bigint) TO service_role;
