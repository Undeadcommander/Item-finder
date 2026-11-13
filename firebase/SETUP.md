# Enable Haven Google accounts without Cloud Storage

Haven uses **Firebase Authentication + Cloud Firestore only**. The public Web configuration for `sign-in-for-haven` is already installed. Cloud Storage, bucket setup, bucket CORS, and a billing upgrade are not required by this implementation. Stay on the Spark plan if you do not want billing; its usage quotas still apply. When quota is exhausted, the app keeps local edits and reports a sync error rather than claiming they were saved online.

## Finish setup in your Firebase console

1. In [Authentication → Sign-in method](https://console.firebase.google.com/project/sign-in-for-haven/authentication/providers), enable **Google**, choose the support email, and save.
2. In [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/sign-in-for-haven/authentication/settings), add **undeadcommander.github.io**. Add localhost/127.0.0.1 only if you want to test sign-in locally.
3. Create the default Cloud Firestore database in production mode if you have not already done so. In [Firestore → Rules](https://console.firebase.google.com/project/sign-in-for-haven/firestore/rules), replace the rules with the contents of [firestore.rules](firestore.rules) and click **Publish**. These rules deny anonymous access and isolate records by the authenticated user's UID. Do not use open/test-mode rules.

From an authenticated owner/admin terminal, the equivalent rules/index configuration deployment is:

```sh
npx firebase login
npx firebase deploy --project sign-in-for-haven --only firestore
```

The optional `firestore.indexes.json` exclusion keeps the inventory JSON payload out of indexes. The app does not query payload text.

## What syncs

- Rooms, containers, items, descriptions, scan metadata, and marker positions sync privately to the Google account.
- **Binary 3D scan files stay in IndexedDB on the device that captured/imported them.** They are not uploaded to Firestore or Cloud Storage. On another device, the app explains that the model is not present; the inventory and marker target information remain accessible. Transfer a full exported backup to bring the model to another device. Scan replacement deliberately clears old markers, so use a full backup to preserve exact coordinates.
- Guest inventory remains in localStorage on that browser. Merely opening the URL on another device does not transfer it. Every new guest starts with the same empty Living room template, not another person's saved data.
- Account inventory is separate from guest inventory. **Account → Copy device inventory to account** copies guest data additively and remaps IDs; this is never automatic. Scan files are copied into that account's local device cache, not uploaded.
- Signing in to the same Google account on multiple devices intentionally shows the same account inventory. Signing out returns to that browser's guest inventory. Account caches and unsynced edits remain on their original device; clearing browser data erases them.

## Storage limits and conflict handling

Firestore has a per-document size limit, so inventory JSON is split into UTF-8-safe chunks below that limit. Chunks and their revision pointer commit together in one transaction. Metadata is capped at 10 MB per account snapshot. A concurrent write produces an explicit choice of device/account versions instead of silently overwriting changes. A recovery copy of the device version can be exported from the Account dialog.

The app retains the current and previous cloud snapshots and removes older chunks. Uploads are debounced to reduce writes, but each snapshot costs one metadata write plus its chunk writes; reads, writes, and stored data count toward Firebase's free quotas. Firebase's current quotas and project usage are shown in the console. This architecture avoids storing large 3D files in Firestore.

## Verify after publishing rules

Open Haven, choose **Sign in → Continue with Google**, add an item, and wait for **Saved to your account** or **Account is up to date**. Sign in with the same account in another browser and confirm the item appears. A signed-out/private browser should show its own guest inventory. A different Google account should start with its own inventory.

No service-account key or OAuth client secret belongs in this repository. The Web API key/configuration is public by design; security is enforced by Firebase Authentication and the published database rules. Analytics is not used.

## Checks

`npm test` covers sync retries, conflict handling, account isolation, guest migration, and Firestore chunk boundaries. Browser tests use a fake authentication adapter and never contact the production project. `npm run test:rules` verifies the real rules with the Firestore emulator, including cross-account denial and immutable snapshot chunks. It requires Java 21 and downloads the official emulator on first use. GitHub CI runs all of these checks before publishing the website. Live Google OAuth and the installed production rules require a real project-owner verification; mocks do not establish that they are enabled.
