# Storage Patterns

Supabase Storage for file uploads, downloads, signed URLs, and image transformations.

---

## Bucket Setup

### Create a Bucket

Create buckets in Supabase Dashboard: Storage -> New Bucket.

| Setting | Public bucket | Private bucket |
|---------|--------------|----------------|
| Public | Yes | No |
| Use case | Avatars, public images | Documents, private files |
| Access | Direct URL (no auth) | Signed URL or RLS policy |
| RLS | Optional but recommended | Required |

### RLS on Storage

Storage uses the `storage.objects` table. Policies follow the same pattern as data tables:

```sql
-- Allow users to upload to their own folder
CREATE POLICY "upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to read their own files
CREATE POLICY "read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own files
CREATE POLICY "delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

**Convention**: store files under `{user_id}/{filename}`. This makes RLS policies simple.

---

## Upload

### Client-Side Upload

```typescript
'use client';

import { createClient } from '@/lib/supabase/client';

async function uploadFile(file: File, userId: string) {
  const supabase = createClient();
  const filePath = `${userId}/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false, // false = error on duplicate, true = overwrite
    });

  if (error) throw error;
  return data.path; // Store this path in your DB
}
```

### Server Action Upload

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('file') as File;
  if (!file) return { error: 'No file provided' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = `${user.id}/${Date.now()}-${file.name}`;

  const { error } = await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) return { error: error.message };
  return { path: filePath };
}
```

---

## Download & URLs

### Public URL (public buckets only)

```typescript
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl('path/to/file.jpg');

// data.publicUrl = full URL, no expiry
```

### Signed URL (private buckets)

```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .createSignedUrl('path/to/file.pdf', 3600); // expires in 1 hour (seconds)

// data.signedUrl = URL with token, expires after duration
```

### Download File

```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .download('path/to/file.pdf');

// data = Blob
```

---

## Image Transformations

Supabase supports on-the-fly image transforms for public buckets:

```typescript
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl('path/to/photo.jpg', {
    transform: {
      width: 200,
      height: 200,
      resize: 'cover', // 'cover' | 'contain' | 'fill'
    },
  });
```

Works only with image files (jpg, png, webp). Transform parameters are appended to URL.

---

## Common Storage Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 403 on upload | Missing INSERT policy on storage.objects | Add RLS policy for bucket |
| 403 on download | Missing SELECT policy or wrong bucket_id in policy | Check policy bucket_id matches |
| "Bucket not found" | Bucket name mismatch or not created | Verify bucket exists in Dashboard |
| "The resource already exists" | Uploading to existing path with upsert: false | Use upsert: true or unique filename |
| Large file fails | Default limit is 50MB | Increase in Dashboard: Storage -> Settings |

---

## Storage + Database Pattern

Store the file path in your table, not the full URL (URLs change, paths don't):

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS avatar_path text;
```

```typescript
// Upload, then save path to DB
const path = await uploadFile(file, user.id);
await supabase.from('projects').update({ avatar_path: path }).eq('id', projectId);

// Display: generate URL from path
const { data } = supabase.storage.from('avatars').getPublicUrl(project.avatar_path);
```
