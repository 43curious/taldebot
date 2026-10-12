# Cleanup measurements

Measured locally on 2026-10-12 with Node 26, LibSQL file storage and synthetic data. Run `npm run benchmark:data` to reproduce: it creates a temporary database, warms each path once and reports the median of five runs. The original issue's query patterns are retained only inside this benchmark for comparison.

| Operation                                   | Fixture                         | Before               | After               |
| ------------------------------------------- | ------------------------------- | -------------------- | ------------------- |
| Dashboard data loading                      | 40 projects, 2,400 participants | 41 queries / 2.83 ms | 2 queries / 0.64 ms |
| Team page data loading and card preparation | 20 cards, 60 participants       | 42 queries / 4.61 ms | 4 queries / 0.98 ms |
| v2 generation and response preparation      | 300 participants, 30 teams      | 25.96 ms             | 25.98 ms            |

A separate HTTP SSR comparison used the original repository commit `ac3aa3a` and the cleanup workspace, the same synthetic database, authenticated requests and Astro development servers. After three warm-up requests, medians across seven requests were:

| Page | Before | After |
| --- | --- | --- |
| Dashboard, 40 projects / 2,400 participants | 6.60 ms | 4.81 ms |
| Teams, 20 cards / 60 participants | 7.85 ms | 4.70 ms |

These are local file-storage results, not production latency or bundle-size measurements. Local file calls are much cheaper than remote round trips. The dashboard/team gains come from fixed query counts; tests verify scoped counts, nullable absence flags, empty projects and conservative roster matching. Generation time is effectively unchanged: indexing responses removes repeated lookup work, while the existing allocation algorithm dominates. No more invasive allocation optimization was warranted by this fixture. HTTP timings include server rendering and local request overhead; the database benchmark remains the maintained reproducible comparison.

Graph loading groups project participants once and reuses its global roster-name ambiguity index. Continuous layout/camera behavior was left unchanged.
