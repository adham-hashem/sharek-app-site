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

- Monitor `mrd.shams1@gmail.com` for account-deletion, privacy, and support requests; replace it in the HTML files if the contact address changes.
- Review the privacy policy against the final production data practices, retention rules, and deletion process. Deletion requests sent through the page currently require manual handling by the app operator; this static site does not delete Supabase accounts automatically.
- Follow the internal `SharekApp/project/ACCOUNT_DELETION_RUNBOOK.md` for full and selected-data deletion. Before deploying the published 30-day periods, verify that the privacy mailbox is monitored, uploaded storage objects are removed, and **all** production backups (including PITR and manual exports) expire within the promised limit.
- After changing `privacy/index.html`, deploy this site and confirm `https://www.sharek.space/privacy` redirects to a public HTTPS page displaying the new update date. Editing this folder alone does not update the policy linked in Play Console.
- After changing `delete-account/index.html`, deploy this site and confirm `https://www.sharek.space/delete-account` publicly shows the data categories, retention periods, and selected-data deletion instructions before updating Play Console.
- Make sure the Play Console Data safety answers cover email/account IDs, profile data including optional religion, user content, precise and approximate location, app activity, and notification tokens as actually collected, including through service providers. Keep those answers consistent with the policy and app behavior.
- Check that deletion requests are actually processed for the Supabase account and associated data, with any legal or security retention documented, and that the privacy mailbox accepts incoming messages.
- If the Play developer's listed name differs from SHARek, identify the responsible developer in the policy as well as the app name.
- Register/verify the domain with your registrar and Google Search Console. Vercel hosting alone does not prove domain ownership.

The site does not include analytics, ad scripts, API keys, or a client-side Supabase key.
