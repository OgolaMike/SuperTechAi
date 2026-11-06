# SuperTech AI authentication email templates

Apply these templates in **Supabase Dashboard → Authentication → Email Templates**.

The application now requests these destinations:
- Signup confirmation: the current SuperTech AI app URL with `?auth=confirmed`
- Password recovery: the current SuperTech AI app URL with `?auth=recovery`

Keep `{{ .ConfirmationURL }}` as the button destination. Supabase uses it to verify the one-time token and then return the member to the redirect URL requested by the app. Do not replace it with `{{ .RedirectTo }}` by itself.

## Confirm signup

**Subject:** Confirm your email address — SuperTech AI

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#151515;background:#ffffff">
  <p style="font-size:12px;letter-spacing:3px;font-weight:bold;color:#9a762b">SUPERTECH AI</p>
  <h1 style="font-size:26px">Welcome to SuperTech AI</h1>
  <p>One quick step remains before you can sign in. Confirm that this email address belongs to you.</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#b18a3b;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px">Confirm my email</a>
  </p>
  <p>After confirmation, you will return to SuperTech AI. Sign in to continue to your account.</p>
  <p style="font-size:13px;color:#666">If you did not create a SuperTech AI account, you can ignore this email.</p>
</div>
```

## Reset password

**Subject:** Reset your SuperTech AI password

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#151515;background:#ffffff">
  <p style="font-size:12px;letter-spacing:3px;font-weight:bold;color:#9a762b">SUPERTECH AI</p>
  <h1 style="font-size:26px">Create a new password</h1>
  <p>We received a request to reset the password for your SuperTech AI account.</p>
  <p>To choose a new password:</p>
  <ol>
    <li>Select the button below.</li>
    <li>On the SuperTech AI recovery page, enter your new password.</li>
    <li>Enter it again to confirm, then select <strong>Update password</strong>.</li>
    <li>Return to sign in using your new password.</li>
  </ol>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#b18a3b;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px">Reset my password</a>
  </p>
  <p style="font-size:13px;color:#666">If you did not request this change, ignore this email. Your current password will remain unchanged.</p>
</div>
```

## Redirect configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to the exact production URL members use to open SuperTech AI.
2. Add that same origin with a wildcard path to **Redirect URLs** (for example, `https://your-production-domain/**`).
3. Add the local development origin if needed (for example, `http://localhost:5173/**`).

Use the actual production domain from the published app. The app sends the active origin as its redirect destination, so every production or preview origin that should receive auth emails must be allow-listed.

For production email delivery, configure a trusted custom SMTP provider and verify the sender domain. Supabase's default email service is intended for testing and has strict sending limits.
