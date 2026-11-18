# MiRadio

A static website for **MiRadio**, a platform for starting your own internet radio station, with a built-in live radio directory.

## Pages
- `index.html`: landing page (hero with a live demo player, how it works, broadcaster app, pro gear, directory teaser, pricing with a monthly/yearly toggle, features, FAQ, a sign-up wizard)
- `listen.html`: **MiRadio Listen**, a working directory of real live stations. Search by name, filter by genre and country, sort, save favourites, and play in a persistent bottom player.
- `contact.html`: contact form
- `dashboard.html`: log-in for station owners (see and edit their station) and admins (every sign-up, change status, search, download CSV)

Station data comes from the free, community-run [Radio Browser API](https://www.radio-browser.info). On HTTPS hosting, only HTTPS streams are listed so browsers don't block audio.

## Run locally
No build step. Serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy
Any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

## Not yet built
The sign-up pop-up and the contact form email each submission through [FormSubmit](https://formsubmit.co); the endpoint is `MI_FORM_ENDPOINT` in `js/main.js`.

## Accounts and dashboard (Supabase)
Accounts and the dashboard use [Supabase](https://supabase.com) (free tier). Until it's connected, sign-ups are only emailed and the dashboard shows a "coming online" notice.

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/setup.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to your site and add `<your site>/dashboard.html` to the redirect URLs.
4. Put the project URL and the anon/publishable key in `js/config.js`. Never use the service_role/secret key.
5. Sign up on the site, then make yourself admin with the `insert into public.admins …` line at the bottom of `setup.sql`.
