Quirk Chevrolet MA Sight Unseen Trade Tool
[README_BRAINTREE.md](https://github.com/user-attachments/files/22100723/README_BRAINTREE.md)
# Quirk Chevrolet (Braintree, MA) — Sight Unseen Trade-In Appraisal (Clone)

This folder is a branded clone of the NH form, customized for **Quirk Chevrolet — Braintree, MA**.

## What changed
- Title, hero copy, and smallprint updated to reference Quirk Chevrolet Braintree.
- Success page CTA now points to a **placeholder** dealer site URL; update it before going live.
- Netlify Functions remain the same, but **recipients** and **webhooks** are controlled via environment variables.

## Deployment Checklist (Braintree)
1. **Create/Use a Netlify site** for Braintree, or a separate environment.
2. Add environment variables (Site Settings → Environment):
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL` (e.g., trade-appraisal@quirkcars.com)
   - `TO_EMAIL` (e.g., braintree-trade-appraisal@quirkchevrolet.com)
   - (Optional) `SHEETS_WEBHOOK_URL` and `SHEETS_SHARED_SECRET`
3. Update success page link:
   - Edit `success/index.html` and replace `https://DEALER_SITE_URL_TBD/` with the Quirk Chevrolet Braintree site.
4. Verify the redirect in `netlify.toml`:
   - Form posts to `/.netlify/functions/trade-appraisal` (serverless email + optional backup webhook).
5. Test end-to-end:
   - Use a test email recipient; submit a sample and confirm email + optional webhook delivery.

## Technical Notes
- **Primary submit path**: `/.netlify/functions/trade-appraisal`
  - Sends a formatted email using SendGrid (env: `SENDGRID_API_KEY`, `FROM_EMAIL`, `TO_EMAIL`).
  - If `SHEETS_WEBHOOK_URL` is set, also POSTs the sanitized payload there (with optional `SHEETS_SHARED_SECRET`).
- **VIN Decode**: NHTSA VPIC (`https://vpic.nhtsa.dot.gov`), client-side only.
- **Uploads**: Photos are accepted and relayed via email; size constraints enforced in the browser.

## i18n
- English/Spanish toggle stored in `localStorage` key `quirk_lang`.

## Where to change branding text
- `index.html` (title, intro paragraph, smallprint)
- `success/index.html` (title, message, CTA URL/text)
