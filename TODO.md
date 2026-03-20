# Account Switch Bug Fix

## Information Gathered
- New window opens with wrong account after switch.
- background.js handleSwitchSession: cookie clear → inject → reload → new window.
- Root Causes:
  1. Cookie set URL: `${protocol}//${cleanDomain}${c.path}` - path may not start '/', cleanDomain wrong for subdomains.
  2. Domain mismatch: Saved cookies have full `.mail.google.com`, set uses base.
  3. Timing: window.create() before cookies propagate.
  4. No verification post-set.

## Plan
1. Fix cookie set: Use saved c.domain/c.path exactly for URL.
2. Sequential set + delay 2s.
3. Verify cookies set before window.
4. Better logging.
5. Update activeSessions after verify.

**File**: background.js (handleSwitchSession)

**Dependent**: None.

**Followup**: Reload extension, test switch on gmail.com.

Approve to proceed?

