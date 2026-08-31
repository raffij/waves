# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Keep the preview harness current

`App.preview.tsx` (`npm run preview`) is a synthetic-data stand-in for the
real app, and often the only way to actually see a UI change — there's
frequently no TideCheck key or network access to TideCheck/Open-Meteo
available. It's only worth that if it stays a faithful stand-in, so:

- Adding a component/prop to `App.tsx` (a new chart, a new field on an
  existing one, a new series) → render it in `App.preview.tsx` too, fed by
  synthetic data shaped like the real API response.
- Changing what an existing component/service needs or shows → update the
  synthetic data and the preview's usage to match, in the same change.
- Before calling a UI change done, run `npm run preview` and confirm the
  change actually appears — don't just eyeball the diff.

If `App.tsx` and `App.preview.tsx` drift, the harness quietly stops being
useful and nobody notices until the next feature can't be checked.
