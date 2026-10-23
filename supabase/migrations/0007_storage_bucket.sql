-- 0007_storage_bucket.sql -------------------------------------------------------
-- T-06 (D-016): the private bucket for medical documents, provisioned as SQL so
-- cloud applies (`db push`) create it identically to the local stack.
-- Server-side access only (service-role client inside server-only modules):
-- storage.objects carries no client policies, so the default-deny posture holds
-- and the browser never receives a bucket write credential. The bucket itself
-- re-enforces what the app boundary validates: 4 MiB cap (Vercel function-body
-- ceiling — files larger than ~4.5 MB cannot traverse a server action at all)
-- and the PDF/JPG/PNG allowlist.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-documents', 'medical-documents', false,
   4194304,  -- 4 MiB, matches lib/validation/application.ts DOCUMENT_MAX_BYTES
   array['application/pdf', 'image/jpeg', 'image/png']::text[])
on conflict (id) do nothing;
