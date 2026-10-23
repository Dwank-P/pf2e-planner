# Decisions and explicit security tradeoffs

This is a design record, not a claim that every safeguard exists in code.

**D1: User identity is site-global.** A person joins multiple campaigns under one account. A GM's "add existing" action grants another membership and does not reset their password. A "new name" creates a pending global account and one-time onboarding code; user chooses globally unique username and password themselves.

**D2: Codes are onboarding credentials, not login sessions.** Share once and redeem by explicit POST. Pending accounts cannot log in. Reissue/revoke must invalidate older codes. Code entropy is far higher than 6-digit OTP; human manually typing 43 characters is cumbersome but safe, so provide a copyable URL plus code.

**D3: Foundry module is an untrusted browser-side client.** No durable world-shared API key. A GM-authorized browser stores a rotating refresh token; access token lasts 15 minutes. Site authorization is checked on every request. Token persistence in GM browser origin-local storage carries XSS and malicious-module risk; require trusted Foundry extensions and a future trusted server agent if this risk is unacceptable.

**D4: No unattended sync.** Automatic sync is tied to a previously authorized GM client login; inactive or unauthorized worlds do not sync. One active GM plus website idempotency avoids race conditions.

**D5: Minimal first publish.** A small class/feat catalog preview is the first authenticated transport. General staged pack batches, item licensing policy, editable character plans and actor application are separate milestones.

**D6: One-time manual repo visibility changes affect install/update only.** Publishing GitHub temporarily reveals all repository content. Never put credentials in repo; generated module manifest and ZIP should be distribution-only assets.
