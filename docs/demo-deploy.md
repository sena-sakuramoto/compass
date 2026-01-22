# Demo Deploy (No-Auth, No-Save)

This demo build disables Firebase Auth and does not persist edits. Reloading resets to the initial sample data.

## 1) Build demo assets

```bash
cd web
pnpm install
pnpm run build:demo
```

Output: `web/dist`

## 2) Deploy (Firebase Hosting)

Recommended: use a separate Firebase Hosting site (e.g. `compass-demo`) to avoid overwriting production.

```bash
# Login if needed
firebase login

# Create a new hosting site (choose any site id)
firebase hosting:sites:create compass-demo
```

If you used a different site id, update `firebase.demo.json`:

```json
{
  "hosting": {
    "site": "your-site-id"
  }
}
```

Deploy:

```bash
firebase deploy -c firebase.demo.json --only hosting
```

## 3) Optional local preview

```bash
cd web
pnpm run preview:demo
```
