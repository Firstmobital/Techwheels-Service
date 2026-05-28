# Web AutoDoc GPS Implementation - Testing & Verification Guide

**Date:** 2026-05-28  
**Status:** Ready for Testing  
**Implementation:** COMPLETE ✅

---

## 📋 Web Implementation Summary

### ✅ What's Implemented

The web AutoDocPage.tsx has **complete end-to-end GPS workflow**:

1. **GPS Capture** (src/lib/gpsUtils.ts)
   - `getCurrentLocation()` - requests browser geolocation permission
   - Timeout: 15 seconds, accuracy: high
   - Error handling for permission denied, timeout, unavailable

2. **GPS Metadata Assembly**
   - `assembleGpsMetadata()` - captures lat, lng, city (reverse geocode), timestamp, timezone
   - Includes stage (pre/under/post) and panel name for context

3. **Image Stamping** (src/lib/imageStamping.ts)
   - `stampImageWithGps()` - adds GPS card to image bottom using Canvas
   - Card includes: City | Lat/Lng | Timestamp | Stage/Panel
   - Quality: 92% JPEG, readable on all brightness levels

4. **Upload Flow** (AutoDocPage.tsx lines 654-808)
   - Select damage photo file from input
   - Capture GPS location (MANDATORY - blocks if fails)
   - Stamp image with GPS overlay
   - Upload STAMPED image to Supabase storage
   - Create panel_photos DB record with all GPS fields
   - Replace/remove flows preserve enforcement

5. **Error Handling**
   - GPS permission denied → user-facing error with remediation
   - GPS timeout → user-facing error message
   - Stamp failure → retry with user notification
   - Storage upload failure → rollback attempt
   - DB insert failure → storage cleanup + error

---

## 🧪 Manual Testing Checklist

### Prerequisites
- [ ] Browser with geolocation support (Chrome, Firefox, Safari, Edge)
- [ ] Techwheels app running on http://localhost:5173 (Vite dev server)
- [ ] Admin access to a test job card
- [ ] Test images available on device/disk

### Test Case 1: Basic Upload with GPS Stamp
**Goal:** Verify damage photo uploads with GPS metadata

**Steps:**
1. Open AutoDoc page in browser
2. Select a test job card
3. Go to "Damage Photos" section
4. Select a panel (e.g., "Front Left Door")
5. Select stage: "Pre-Repair"
6. Click "Upload Photos" button
7. Browser requests location permission
   - ✅ Grant permission
8. Select an image file (JPG/PNG)
9. Observe:
   - [ ] GPS capture spinner shows
   - [ ] GPS coordinates displayed (Lat: X.XXXXXX°, Lng: X.XXXXXX°)
   - [ ] Timestamp shown in local timezone
   - [ ] Stage and panel label shown
   - [ ] Upload progress indicator
   - [ ] Success toast message

**Expected Result:**
- ✅ Stamped image visible in photo grid under Pre-Repair
- ✅ Database record created with repair_stage='pre-repair', gps_lat, gps_lng, gps_city

---

### Test Case 2: Permission Denied Flow
**Goal:** Verify handling when user denies location

**Steps:**
1. Clear browser location permissions for this site
2. Repeat Test Case 1, step 8
3. Browser requests permission
   - ✅ DENY permission
4. Observe:
   - [ ] Red error toast appears
   - [ ] Message: "GPS capture failed: Location permission denied"
   - [ ] File input cleared
   - [ ] Photo NOT uploaded

**Expected Result:**
- ✅ Upload blocked with clear error message
- ✅ No partial upload or orphaned files
- ✅ User can retry after enabling permission

---

### Test Case 3: GPS Timeout
**Goal:** Verify handling when GPS takes too long

**Steps:**
1. Open browser DevTools (F12)
2. Go to Console
3. Run: `navigator.geolocation.getCurrentPosition = () => { /* timeout */ }`
4. Repeat Test Case 1, step 8
5. Observe:
   - [ ] Wait 15 seconds
   - [ ] Red error toast: "GPS location timeout"
   - [ ] File input cleared

**Expected Result:**
- ✅ Upload blocked after timeout
- ✅ Clear error message with retry option

---

### Test Case 4: Replace Photo Flow
**Goal:** Verify replacing existing damage photo maintains GPS enforcement

**Steps:**
1. Complete Test Case 1 (upload initial photo)
2. In Pre-Repair section, hover over uploaded photo
   - ✅ "Replace" button appears
3. Click "Replace" button
4. Grant location permission
5. Select different image file
6. Observe:
   - [ ] New GPS captured for different timestamp
   - [ ] Stamped with NEW location/time (not old one)
   - [ ] Old photo removed after successful upload
   - [ ] New photo appears in same stage

**Expected Result:**
- ✅ Replace flow maintains GPS enforcement
- ✅ Each photo has its own GPS capture time
- ✅ No old unstamped photos remain

---

### Test Case 5: Remove Photo Flow
**Goal:** Verify removing photo doesn't affect other stages

**Steps:**
1. Upload 2 photos: 1 Pre-Repair, 1 Under-Repair
2. Click Remove on Pre-Repair photo
3. Confirm delete
4. Observe:
   - [ ] Pre-Repair photo deleted
   - [ ] Under-Repair photo still there
   - [ ] Grid updates immediately
   - [ ] Success toast message

**Expected Result:**
- ✅ Remove only affects target stage
- ✅ Other stage photos unchanged
- ✅ No orphaned DB records

---

### Test Case 6: Image Quality & Stamping Verification
**Goal:** Verify stamped image quality and card visibility

**Steps:**
1. Upload a photo
2. In photo grid, right-click → "Open image in new tab"
3. View full-resolution stamped image
4. Observe:
   - [ ] GPS card visible at image bottom
   - [ ] Text readable (white on dark background)
   - [ ] Latitude/Longitude to 6 decimals
   - [ ] Timestamp format: MM/DD/YYYY HH:MM:SS AM/PM
   - [ ] Timezone shown (e.g., "America/New_York")
   - [ ] Stage format: "Pre Repair" or "Under Repair"
   - [ ] Image quality acceptable (not blurry/compressed)

**Expected Result:**
- ✅ GPS card clearly visible and readable
- ✅ All required fields present
- ✅ Image quality suitable for insurance claims

---

### Test Case 7: Multiple Upload (Batch)
**Goal:** Verify uploading multiple photos for same stage

**Steps:**
1. Go to Pre-Repair section
2. Click "Upload Photos"
3. Select 3 image files at once (hold Ctrl/Cmd)
4. Observe:
   - [ ] GPS captured once (not per image)
   - [ ] All 3 images stamped with SAME GPS location
   - [ ] All 3 show in Pre-Repair grid
   - [ ] Success: "3 photos uploaded"

**Expected Result:**
- ✅ Batch upload works correctly
- ✅ Same GPS location used for all images in batch
- ✅ All DB records created

---

### Test Case 8: Database Verification
**Goal:** Verify GPS fields persisted correctly in DB

**Steps:**
1. Complete upload in Test Case 1
2. Open browser DevTools → Network tab
3. Find request to `panel_photos` insert
4. View response JSON
5. Verify fields:

```json
{
  "id": "...",
  "job_card_id": "...",
  "panel_id": "...",
  "repair_stage": "pre-repair",  // ✅ Should be set
  "gps_lat": 37.7749,            // ✅ Should be number (not null)
  "gps_lng": -122.4194,          // ✅ Should be number (not null)
  "gps_city": "San Francisco",   // ✅ Can be string or null
  "captured_at": "2026-05-28T...",  // ✅ Should be ISO timestamp
  "storage_path": "...",
  "photo_type": "damage_pre_repair",
  "created_at": "...",
  "updated_at": "..."
}
```

**Expected Result:**
- ✅ repair_stage set correctly (pre-repair, under-repair, or post-repair)
- ✅ gps_lat and gps_lng are numbers (not null)
- ✅ gps_city is string or null (never undefined)
- ✅ captured_at is valid ISO timestamp

---

### Test Case 9: Stamped File in Storage
**Goal:** Verify ONLY stamped image is uploaded (not unstamped)

**Steps:**
1. Upload a photo
2. Note the storage path from network tab
3. Open Supabase dashboard → Storage → AUTODOC_BUCKET
4. Navigate to dealer_code/job_card_id/panel_id/ folder
5. Download the uploaded file
6. View in image viewer
7. Verify:
   - [ ] GPS card visible at bottom
   - [ ] File is JPG (not PNG or raw binary)
   - [ ] File size reasonable (< 5MB)

**Expected Result:**
- ✅ Downloaded file has GPS stamp visible
- ✅ No unstamped version exists in storage
- ✅ File format and size acceptable

---

### Test Case 10: Reverse Geocoding (City Lookup)
**Goal:** Verify city name is captured (or graceful fallback)

**Steps:**
1. Upload a photo from known location (or simulate location)
2. Check DB record for gps_city field
3. Observe:
   - [ ] If reverse geocode succeeds: City name populated (e.g., "San Francisco")
   - [ ] If reverse geocode fails: gps_city is null (acceptable)
   - [ ] Upload still succeeds (non-blocking)

**Expected Result:**
- ✅ City populated if reverse geocode works
- ✅ Upload not blocked if reverse geocode fails
- ✅ gps_lat/gps_lng always present

---

## ⚠️ Known Limitations & Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Offline browser | GPS capture fails, user sees error |
| Very slow location | 15-second timeout, error shown |
| HTTPS required | Browser will deny geolocation on HTTP (dev only) |
| Private browsing | Some browsers deny geolocation permission |
| Multiple rapid uploads | Each batch gets current GPS (correct behavior) |

---

## 🐛 Debugging Tips

### GPS Not Capturing?
1. Check browser console for errors
2. Verify location permission granted for localhost/domain
3. Try different browser (Chrome recommended)
4. Check firewall/network not blocking location services

### Image Stamping Missing?
1. Right-click image → "View image info" to check dimensions
2. Open in new tab and zoom to verify card is there
3. Check browser console for Canvas errors

### GPS Data Not in DB?
1. Open Network tab in DevTools
2. Filter for "panel_photos" requests
3. Check response payload has gps fields
4. Query Supabase dashboard directly

---

## 📝 Sign-Off Checklist (For QA)

### Functional Tests
- [ ] Test Case 1: Basic upload with GPS ✅
- [ ] Test Case 2: Permission denied ✅
- [ ] Test Case 3: GPS timeout ✅
- [ ] Test Case 4: Replace photo ✅
- [ ] Test Case 5: Remove photo ✅
- [ ] Test Case 6: Stamping quality ✅
- [ ] Test Case 7: Batch upload ✅
- [ ] Test Case 8: DB verification ✅
- [ ] Test Case 9: Storage file check ✅
- [ ] Test Case 10: Reverse geocoding ✅

### Non-Functional
- [ ] No TypeScript errors: `npx tsc --noEmit` ✅
- [ ] No console errors in browser DevTools ✅
- [ ] Performance acceptable (< 5 sec per upload) ✅
- [ ] Memory stable (no leaks after 10 uploads) ✅

### Regression
- [ ] Existing job card list not affected ✅
- [ ] Existing status update buttons work ✅
- [ ] Existing document uploads not broken ✅
- [ ] Other panel operations unchanged ✅

### Sign-Off
- [ ] All test cases passed
- [ ] No P0/P1 issues found
- [ ] Ready for mobile to follow same pattern
- [ ] QA Lead Signature: _________________ Date: _______

---

## 🎯 Next Steps After Testing

1. **If all tests pass:**
   - ✅ Web version ready for production
   - ✅ Mobile can follow identical GPS/stamping pattern
   - ✅ Start mobile Phase 3 (image stamping with react-native-view-shot)

2. **If issues found:**
   - Document issue + reproduction steps
   - Fix in AutoDocPage.tsx or utility functions
   - Rerun relevant test case
   - Get re-approval

3. **For mobile implementation:**
   - Use same GPS metadata from src/lib/gpsUtils.ts
   - Implement mobile-specific stamping (react-native-view-shot)
   - Follow identical upload flow logic
   - Test on Android/iOS device
