# Review — controls-ranking-tuning

## Red→green evidence (requirement 4.4)

Eval suite run against the **pre-fix** ranking (2026-07-27, before any meta.ts change): 4 of 5 domain evals failed —

- FAIL "storing user passwords with bcrypt" → expected IA-5 branch; got AC-12.1, AC-2, AC-2.7… (session/account controls)
- FAIL "encrypt customer data at rest in the database" → SC-28 branch absent
- FAIL "validate and sanitize uploaded CSV file input" → SI-10 absent
- FAIL "authorization checks for new admin endpoint" → AC-3/AC-6 branches absent
- PASS "implement idle session timeout and logout" (passed pre-fix only because the catalog-order bias happens to favor the AC family)

Diagnosed causes: (1) per-token search truncated at 50 in catalog order, so broad tokens credited only the alphabetically-first AC family; (2) equal token weights let "auth" (344 matches) count as much as "password" (15); (3) "bcrypt" expanded to nothing and contributed zero signal; (4) ties broke by catalog order.

## Post-fix results

All 5 evals pass (plus ASVS spot-check and determinism test); full suite 168/168, typecheck clean. Dogfood query "bcrypt auth reset password": pre-fix top hit AC-12.1 (session logout); post-fix IA-5.1 with score 1.749 vs 0.873 for the runner-up. Hooks now suggest `NIST IA-5(1)` for password-hashing edits.

## Notes

- The authorization eval is asserted at control-*branch* granularity (base or its enhancements): the ranking surfaces AC-3.3/AC-6.10, which are correct and more specific than the bases. Recorded here so a future reviewer doesn't mistake branch-matching for eval-weakening.
- match_score is now a fractional IDF-weighted sum (rounded to 3 decimals); descending-order contract preserved and covered by the pre-existing ranking test.
- searchStem is intentionally conservative (single suffix strip, ≥4-char stem); revisit only with eval evidence.
