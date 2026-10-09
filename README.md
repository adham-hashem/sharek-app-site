# SHARek public website

Static Arabic/English website for the SHARek app. It includes the public homepage, privacy policy, terms of use, and an account-deletion request page.

## Deploy to Vercel

1. Import this folder (`SharekApp/sharek-site`) as its own Vercel project, or set it as the Root Directory in the project settings.
2. No build command or framework preset is needed. The site is static HTML/CSS/JS.
3. Add `sharek.space` and `www.sharek.space` in Vercel's Domains settings. Follow the exact DNS records Vercel displays at that time; DNS values can vary by account and configuration.
4. After deployment, confirm these URLs load publicly:
   - `https://sharek.space/`
   - `https://sharek.space/privacy/`
   - `https://sharek.space/terms/`
   - `https://sharek.space/delete-account/`
5. In Google Auth Platform → Branding, use `https://sharek.space/` as the homepage and `https://sharek.space/privacy/` as the privacy policy URL. Add `sharek.space` to Authorized domains after verifying ownership in Google Search Console if Google requests it.

## Before public release

- Set up working email addresses for `privacy@sharek.space` and `support@sharek.space`, or replace these addresses in the HTML files with addresses you monitor.
- Review the privacy policy against the final production data practices, retention rules, and deletion process. Deletion requests sent through the page currently require manual handling by the app operator; this static site does not delete Supabase accounts automatically.
- Register/verify the domain with your registrar and Google Search Console. Vercel hosting alone does not prove domain ownership.

The site does not include analytics, ad scripts, API keys, or a client-side Supabase key.
