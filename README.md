# MiRadio

A static website for **MiRadio**, a platform for starting your own internet radio station, with a built-in live radio directory.

## Pages
- `index.html`: landing page (hero with a live demo player, how it works, broadcaster app, pro gear, directory teaser, pricing with a monthly/yearly toggle, features, FAQ, a sign-up wizard)
- `listen.html`: **MiRadio Listen**, a working directory of real live stations. Search by name, filter by genre and country, sort, save favourites, and play in a persistent bottom player.
- `contact.html`: contact form

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
The sign-up pop-up and the contact form email each submission through [FormSubmit](https://formsubmit.co); the endpoint is `MI_FORM_ENDPOINT` in `js/main.js`. Log-in and a station dashboard are not built yet.
