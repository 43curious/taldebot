# TaldeBOT operating costs

Checked 15 October 2026. Expected monthly infrastructure bill for **up to 10 teachers and 250 students: $0**, within the free allowances below. This is a usage model, not an account invoice: provider dashboards and the Netlify account's exact plan generation were not accessible. Domain renewal and any separate email service are outside this estimate. Prices are USD before applicable taxes.

## Database: Turso

[Turso Free](https://turso.tech/pricing?frequency=monthly) includes **5 GB storage, 500 million rows read and 10 million rows written per month**, for $0. The measured database allocation is **880,640 bytes (0.88 MB)** with 230 durable students. There is no reason in the measured workload to buy more storage now. Developer costs $5.99/month when billed monthly if a paid allowance becomes necessary.

Database calls are not each a separate charge. Turso meters **rows scanned**, which can exceed rows returned, especially with joins, filters and aggregates. The application's `db_queries` and `db_rows` diagnostics count operations and returned rows; they cannot establish billable reads. The installed client does not expose scanned-row usage in these query results. Check the Turso usage dashboard for the real monthly meter. Free-tier quota exhaustion can block database operations. See [Turso's billing definitions](https://docs.turso.tech/help/usage-and-billing).

## Hosting: Netlify

The [current Free plan](https://www.netlify.com/pricing/) includes **300 credits/month**. Personal is $9/month with 1,000 credits if more capacity is needed. Teachers and students are application users, not additional paid Netlify team seats.

[Current credit rates](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/):

| Meter                                        |        Credits |
| -------------------------------------------- | -------------: |
| Successful production deployment             |        15 each |
| Outbound bandwidth                           |      20 per GB |
| Function compute                             | 10 per GB-hour |
| Web requests, including assets and redirects |   2 per 10,000 |

Static pages still consume requests and bandwidth, but avoid SSR function compute. Compute depends on memory allocation and execution duration, including waiting for remote work. Parallel reads reduce elapsed time without adding a per-call fee. Timing headers are not a substitute for the provider's billing meter.

The browser measured roughly **100–106 KB** of same-origin transfer for a first graph visit, including scripts/styles, versus **21–23 KB** for a repeat with browser caches. These Chrome encoded-transfer measurements include response headers, omit external fonts, and are approximate bandwidth evidence, not Netlify invoices. Decompressed HTML byte counts from the HTTP benchmark are unsuitable for estimating billed transfer.

### Illustrative month

Assume 2,000 teacher page visits (10 teachers × 20 days × 10 views), four surveys per student, and headroom for **10,000 dynamic executions, 50,000 total web requests and 1 GB outbound transfer**. Assume an average 0.75-second execution at 1 GB memory; these are budget assumptions, not measured monthly usage.

| Usage                               |    Credits/month |
| ----------------------------------- | ---------------: |
| Compute: 10,000 × 0.75 / 3,600 × 10 |             20.8 |
| 50,000 web requests                 |               10 |
| 1 GB bandwidth                      |               20 |
| Four production deployments         |               60 |
| **Total**                           | **110.8 of 300** |

With ten production deployments, the same model uses **200.8 credits**, still $0. Twenty production deployments use all 300 credits before any traffic. The allowance is shared with other usage in the account/team; this is not a universal deployment limit. On Free, reaching the credit limit can pause hosted projects rather than produce unlimited free traffic. See [Netlify's Free-plan limits](https://www.netlify.com/pricing/pro-vs-free/).

**Legacy exception:** accounts created before 4 September 2025 may retain legacy Free: 100 GB bandwidth, 300 build minutes and 125,000 function invocations per site/month. The credit calculation above does not apply to that plan. Check the plan name in Netlify before using either model; no plan change is proposed. [Legacy plan documentation](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/).

## Performance and the remaining limit

The deployed changes reduce dependent remote reads and make the login form static. They add no paid infrastructure and no access/data cache. Team-page medians fell from 1,379 to 739 ms for a master and 1,534 to 803 ms for a teacher. Other already-fast pages did not show a consistent improvement. Full results and measurement limits are in [loading-measurements.md](loading-measurements.md).

Repeated HTTP requests were mostly below one second at the median, but a browser graph visit took 5.5 seconds to first byte, and one earlier teacher graph request returned HTTP 500. Paying for a larger quota alone does not identify or resolve those outliers. Keep issue #6 open until the intermittent failure is diagnosed and deployment/first-request verification is complete. New failure headers preserve safe database error codes and query fingerprints for the next investigation; they require deployment first.
