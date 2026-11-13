# Enable Haven accounts

The UI and sync implementation are included. The public Web app configuration for `sign-in-for-haven` is installed; the project owner must enable the services and publish its access rules before account sync will work. No service-account key belongs in this repository or the browser.

## 1. Create the Firebase project and Web app

In https://console.firebase.google.com create a project in your own Google account. Google Analytics is optional and is not used by Haven. Register a Web app and copy its **public** `firebaseConfig` object.

Put its fields in `src/firebase-config.json`, replacing `{"enabled": false}`. Required fields:

```json
{
  "enabled": true,
  "apiKey": "your public web API key",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your actual bucket name from Firebase",
  "appId": "your web app ID"
}
```

Use the bucket exactly as Firebase provides it; new buckets commonly end in `.firebasestorage.app`. This config is public by design. Do not include admin credentials or a Google OAuth client secret.

## 2. Enable Google sign-in

Under **Build → Authentication → Get started → Sign-in method**, enable **Google**, select the support email, and save. The same Google button creates new accounts or signs existing users in.

Under **Authentication → Settings → Authorized domains**, add `undeadcommander.github.io`. Add `localhost` and `127.0.0.1` only if you want local development sign-in. Haven uses popup sign-in, so it does not rely on third-party redirect storage on GitHub Pages. A blocked popup is reported to the user.

## 3. Create Firestore and Storage

Create a **Cloud Firestore** database with the default database ID in production mode. Choose a suitable region.

Create **Cloud Storage** in the same project. Firebase may require the Blaze billing plan for Storage. The project owner must decide whether to enable billing and set a budget alert. Account scans need Storage; enabling Authentication alone does not enable inventory sync.

## 4. Install the access rules

Use the Firebase console's Firestore **Rules** tab to publish `firebase/firestore.rules`, and Storage **Rules** to publish `firebase/storage.rules`.

Alternatively, from an authenticated owner/admin terminal in this repository:

```sh
npx firebase login
npx firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,storage
```

Do not deploy with test-mode/open rules. Owners can only read/write `/users/{their Firebase uid}` and their own storage objects. Inventory metadata revisions must advance by one; immutable snapshots prevent partial uploads from replacing an account. Scan objects cannot be overwritten.

## 5. Permit authenticated browser downloads with CORS

Firebase Storage's `getBytes` API needs the bucket to allow browser requests from the hosted app. In Google Cloud Shell, create `cors.json` with the contents of `firebase/storage-cors.json`, then run:

```sh
gcloud storage buckets update gs://YOUR_ACTUAL_BUCKET_NAME --cors-file=cors.json
```

CORS is not authorization: the Storage rules still require the matching signed-in user for every read/write. No public bucket access or public download-token URLs are used.

## 6. Deploy and verify with real accounts

Commit the public config and push to `main`. The existing Pages workflow runs tests and deploys the site. Use Google to sign in, add an item, wait for **Saved to your account**, then sign in on a second device and check that item. Import a scan on the first device and open it on the second. A real Google sign-in cannot be verified using mock accounts or without configuring a Firebase project.

Guest inventory stays under its original device key. After sign-in, choose **Account → Copy device inventory to account** to copy it; this is additive, retains guest data, and remaps IDs. Repeating the operation creates another copy.

## Operation and recovery

- Local edits are immediate; uploads are debounced. Scan blobs upload before the inventory revision commits.
- Account inventory is limited to 10 MB of JSON; individual scans retain the 30 MB limit.
- Account caches and scan cache keys are isolated by UID. Signing out returns to guest inventory. Pending changes remain on this device for that account; the UI asks before signing out with unsynced changes. Clearing browser storage erases pending changes.
- Two devices changing the same revision produce a conflict instead of an automatic overwrite. Users can keep either version. A local recovery copy is retained and can be exported from the Account dialog.
- Disconnected users see pending/error status and can choose **Sync now**. Returning online retries sync. Realtime changes load when there are no pending local edits.
- Old inventory snapshots are pruned, retaining the current and previous snapshots. Scan blobs are immutable and retained, including removed scans, to avoid breaking concurrent readers and recovery. An owner-controlled retention/cleanup policy may be needed for extensive scan use; monitor Storage usage and set budget alerts.
- Google profile name/email are shown only in the account UI; inventory paths use Firebase UID. The app does not access Gmail, Drive, contacts, or other Google account data.

## Tests

`npm test` checks queueing, retry, concurrent changes, stale responses, account switching, and guest migration. Browser tests exercise the sign-in UI with a fake adapter; they do not authenticate real Google users. `npm run test:rules` uses local Firestore and Storage emulators to verify owner access, cross-account denial, immutable files, and revision checks. It requires Java 21 and downloads the official emulator binaries on its first run.
