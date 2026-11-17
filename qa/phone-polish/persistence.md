# Mobile persistence review

Tested candidate 3ba1406 on November 17, 2026 using PostgreSQL 17.11. Created a new empty cluster on 127.0.0.1, applied repository migrations, and used fictional accounts with proactive messaging disabled.

| Check | Result |
| --- | --- |
| Five PostgreSQL test files | 14 of 14 tests passed in 22.73 seconds. The run set both fixture URLs. |
| Concurrent inbound and dashboard activity | The existing 20-account test passed duplicate inbound handling and ordered back-to-back web turns. |
| Operational and delivery cases | The suites for inbound recovery, SMS delivery races, heartbeat retirement and outbound dispositions passed. These exercised database transactions with test providers. |
| Account A's separate dates | The workspace mutation service saved a dinner plan for November 28, a 12-minute walk for November 17 and breakfast for November 16. A fresh workspace read for each date returned the same item, title, kind and date, alongside matching diary coverage. |
| Account B's access | Its workspace returned none of A's three record IDs. A deletion attempt through the workspace service with B's identity and A's meal ID was rejected. A second read confirmed A still had the meal. |

The database checks cover persistence and ownership. A separate browser review covers the mobile controls, date navigation and sign-in. The fixture skipped carrier delivery and external Calendar authorization.

After the signed-in walkthrough, the tester stopped the local database and both fixture web services and confirmed their ports were no longer listening. Automatic shell review declined recursive deletion of the disposable temporary folder. A stopped synthetic database and temporary build files remain in the machine's temporary directory.

Authenticated HTTP check on application commit 005465b. The genuine phone confirmation route redeemed a single-use synthetic credential, returned a 303 to the configured workspace and issued its session cookie. With that cookie, the account and workspace endpoints returned HTTP 200 for QA Jules, and Profile and Extensions returned their pages. Fixture sign-in provisioned accounts locally. No SMS, external identity provider, or calendar authorization took place.
