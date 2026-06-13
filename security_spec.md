# Vantage AI Wallet Security Specification

## Data Invariants
- A transaction cannot exist without a valid userId that matches the authenticated user.
- A user profile can only be read or written by the user themselves (or an admin if applicable).
- Subscription tiers are restricted to 'free' and 'premium'.

## The "Dirty Dozen" Payloads (Red Team Audit)
1. **Identity Spoofing**: Attempt to create a transaction with `userId: "other_user_id"`.
2. **Subscription Escalation**: Attempt to update profile `subscriptionTier: "premium"` as a free user.
3. **Ghost Field Injection**: Add `isVerified: true` to a transaction document.
4. **ID Poisoning**: Use a 2KB string as a transaction ID.
5. **PII Breach**: Authenticated user attempts to read another user's profile.
6. **Negative Wealth**: Attempt to set a transaction amount to a 1MB string.
7. **Relational Orphaning**: Create a transaction for a userId that does not exist in the `users` collection.
8. **Date Tampering**: Use a client-side future date for `lastLogin`.
9. **Blanket Read Scam**: Attempt to list all transactions without a userId filter.
10. **Terminal State Break**: Modify a 'completed' transaction's amount. (Not explicitly requested, but good practice).
11. **Malicious Enum**: Setting `subscriptionTier: "admin"`.
12. **Self-Assigned UID**: Creating a user profile for a different UID than `request.auth.uid`.
