# Object Storage Setup Guide

This guide explains how to set up Replit Object Storage for the 369 Art Collective platform to enable persistent image storage across deployments.

## Why Object Storage?

Replit deployments use ephemeral filesystems, meaning any files uploaded to the local filesystem (`/uploads/`) are deleted when the deployment restarts. Object Storage provides persistent, reliable storage that survives deployments.

## Setup Steps

### 1. Create Object Storage Buckets

1. Open your Repl's "Tools" panel
2. Click on "Object Storage"
3. Create a new bucket (e.g., `247-print-network-storage`)

### 2. Set Environment Variables

Add the following environment variables to your Repl's Secrets:

```bash
ARTWORK_UPLOADS_DIR=/247-print-network-storage/artwork-uploads
AI_GENERATED_DIR=/247-print-network-storage/ai-generated
AI_PREVIEWS_DIR=/247-print-network-storage/ai-previews
```

**Format:** `/bucket-name/directory-name`

### 3. Verify Setup

The application will automatically verify that these environment variables are set when it starts. If they're missing, you'll see error messages in the console.

## Migration from Filesystem

If you have existing images in the `/uploads/` directory, use the migration script to transfer them to object storage:

### Running the Migration Script

```bash
npx tsx server/scripts/migrate-to-object-storage.ts
```

The script will:
1. Scan `/uploads/` for all image files
2. Upload them to the appropriate object storage directories
3. Update database records (artworks, portfolio submissions) to point to new `/objects/` URLs
4. Report migration statistics

### After Migration

1. **Verify** images are accessible at `/objects/` URLs
2. **Test** upload and viewing functionality
3. **Monitor** logs for any errors
4. Once verified, you can safely delete the `/uploads` directory

## URL Structure

### Before Migration (Filesystem)
```
/uploads/artwork-123.jpg
/uploads/ai-generated/image-456.png
/uploads/ai-previews/preview-789.jpg
```

### After Migration (Object Storage)
```
/objects/artwork-uploads/artwork-123.jpg
/objects/ai-generated/image-456.png
/objects/ai-previews/preview-789.jpg
```

## How It Works

### Upload Flow
1. User uploads an image
2. Backend validates image quality
3. Image is uploaded to Object Storage
4. Database stores `/objects/...` URL
5. Frontend displays image via `/objects/` route

### Serving Images
- The `/objects/*` route streams images from Object Storage
- Images are cached with a 1-year TTL for performance
- CORS headers allow cross-origin access

### AI Preview System
- Large images (>20MB) are automatically downsized for OpenAI Vision API
- Previews are cached in Object Storage to avoid reprocessing
- Supports both legacy `/uploads/` and new `/objects/` URLs during migration

## Troubleshooting

### "Object storage not configured" Error

**Cause:** Environment variables not set  
**Fix:** Add ARTWORK_UPLOADS_DIR, AI_GENERATED_DIR, and AI_PREVIEWS_DIR to Secrets

### Images Not Loading

**Cause:** Migration not completed or bucket permissions  
**Fix:** 
1. Run migration script
2. Check bucket exists in Object Storage panel
3. Verify environment variables are correct

### Upload Failures

**Cause:** Bucket name mismatch or quota exceeded  
**Fix:**
1. Verify bucket name matches environment variable
2. Check Object Storage quota in Replit dashboard
3. Review error logs for specific issues

## Architecture

### Storage Service (`server/objectStorage.ts`)
- `uploadFile()` - Upload buffers to object storage
- `getFile()` - Retrieve files by URL path
- `readObjectAsBuffer()` - Download files as buffers
- `putObjectFromBuffer()` - Upload buffers directly
- `objectExists()` - Check if file exists

### Vision Preview Helper (`server/lib/vision-preview-helper.ts`)
- Automatically handles both `/uploads/` and `/objects/` URLs
- Creates downsized JPEG previews for large images
- Caches previews in Object Storage

### Upload Routes
- `/api/upload` - Main artwork upload (with quality validation)
- `/api/upload/design` - AI upscale widget upload
- `/api/artists/portfolio` - Portfolio submission upload (2-3 images)

## Production Deployment

1. **Before Deployment:**
   - Set up Object Storage buckets
   - Add environment variables to production Secrets
   - Run migration script in development to test

2. **During Deployment:**
   - Object Storage will automatically be used for all new uploads
   - Existing database records with `/uploads/` URLs will still work (legacy support)

3. **After Deployment:**
   - Monitor logs for any object storage errors
   - Test image upload and viewing
   - Run migration script if needed to update legacy URLs

## Security

- **Path Validation:** Uploads restricted to configured directories only
- **Access Control:** Public read access via `/objects/` route
- **CORS:** Enabled for frontend access
- **Caching:** Long cache TTL for immutable files

## Support

If you encounter issues:
1. Check the console logs for specific error messages
2. Verify environment variables are set correctly
3. Ensure bucket exists in Object Storage panel
4. Review migration script output for errors
