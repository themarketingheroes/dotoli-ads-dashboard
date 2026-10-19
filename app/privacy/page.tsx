export const metadata = { title: "Privacy Policy · Ads Dashboard" };

export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 4px" }}>Privacy Policy</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Last updated October 20, 2026</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>What this app is</h2>
      <p>
        Ads Dashboard is an internal reporting tool operated by Md Khalid Azam. It shows advertising performance for ad accounts
        that the operator already manages. It is not offered to the public.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Data we access</h2>
      <p>
        With the account owner&apos;s authorization, the app reads campaign and performance data (for example spend, impressions,
        clicks and conversions) from the Google Ads API and the Meta Marketing API. Access is read-only: the app never creates,
        changes, pauses or deletes ads, campaigns or settings.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>How data is used and stored</h2>
      <p>
        Data is used only to display performance reports in this dashboard. Report snapshots are stored in private cloud storage
        and older snapshots are deleted automatically. Data is never sold, shared with third parties for their own purposes, or used
        for advertising.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Google user data</h2>
      <p>
        Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use
        requirements.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Revoking access</h2>
      <p>
        Access can be revoked at any time from your Google Account (Security, Third-party apps) or Meta Business settings. Stored
        snapshots are deleted on request.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Contact</h2>
      <p>khalid.azam126@gmail.com</p>
    </main>
  );
}
