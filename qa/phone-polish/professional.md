# Independent mobile design review

November 17, 2026. Local candidate on port 3104 while the branch advanced from `3ba1406` to `005465b`. I had no implementation role. I used a separate embedded Chromium session at 375 × 812, then 320 × 568. All workspace records were fictional. The scores below are visual and interaction design judgments. The separate customer reports cover longer workflows.

I weighted finding the next action and distinguishing it from secondary actions at 35%, comfort and readability on a small screen at 25%, navigation and feedback at 25%, and visual composition at 15%. A 9 requires a clear action, legible state, reachable controls, and at most minor presentation friction in the inspected flow. **Overall design score 9.1/10.**

| Screen | Score | Personally observed |
| --- | ---: | --- |
| Today | 9.3 | I could start the sample project immediately. The paper illustration gave the task visual identity while the title remained readable. |
| Spaces | 9.2 | I opened the sheet, expanded all four groups over the course of the review, and selected destinations. At 320 pixels the expanded group scrolled above the account controls. I measured buttons 44–66 CSS pixels tall. |
| To-do | 9.0 | I opened it from Planner. Each row offered completion and focus, with goal and duration shown beneath. At 375 pixels Add wrapped onto its own row. |
| Calendar | 9.0 | I moved from To-do to Calendar. Date selection, weekday strip, agenda, and a Plan action fit. The timezone identifier still reads like a system setting. |
| Goals | 9.1 | I opened the goal card. The next step, completion bar and add-step button were visible together. |
| Reminders | 9.1 | I located both scheduled items without opening details. Their time zone, status, and change actions were explicit. |
| Focus | 9.3 | I started the timer from Today and completed it. The task title and countdown dominated, with Pause and five-minute extension beside completion. |
| Journey | 9.3 | I opened the map after completing the task. Milestones, streak, and Pause animations were visible together. |
| Routines | 9.2 | I opened the routine from Spaces. The Morning/Evening controls, progress, next step, and start button appeared in reading order. |
| Sunrise / sunset | 9.1 | I opened the light controls. Duration, session start, preview, and sound settings had distinct purposes. The screen explicitly described the device boundary. |
| Meals | 9.1 | I opened the meal plan. The date, planned week, meal slot and dish image provided a clear sequence. |
| Recipes | 9.1 | I used the sibling navigation to open the library. Search, save, recipe photo, preparation time and servings were easy to distinguish. |
| Shopping | 9.0 | The list showed quantities and purchase controls. Edit and remove are adjacent small icons, although their row positions remain consistent. |
| Pantry | 9.1 | I switched directly from Shopping to Pantry. The empty state explained what to record and offered Add stock without a scroll. |
| Nutrition | 9.0 | Calendar, manual entry, food search, calories and macro panels were visible. Entry buttons wrap onto two lines at 375 pixels, costing some vertical room. |
| Fitness | 9.2 | I switched from Activity to Programs. Two illustrated program cards appeared side by side, with sessions, equipment and selected state. At 320 pixels all five section buttons measured 54 × 52 and the document had no horizontal overflow. |
| Thoughts | 9.1 | I opened it through Brain dump. The notebook treatment, actual note text, and conversion actions made the function immediately apparent. |
| Memories | 9.0 | I switched from Thoughts to Memories. Saved preferences, correction and removal had different controls. |
| Ask Tempo | 9.0 | I opened it deliberately from Spaces. Message history, composer, and the fictional-preview disclosure were all visible. |
| Settings | 9.0 | I entered through Account and settings. I found the jump menu, personalization, guide, and timezone controls on first inspection. |
| Guide | 9.1 | Starting the guide opened a mascot card pointing to the actual Spaces button. Skip and Next remained distinct. The first explanation can be shorter on phones. |
| Signup form | 9.0 | I opened the public form at both widths and inspected the accessible controls. Phone number, consent, then Get started appeared in that order. The illustration still occupies appreciable room before the form. |
| Login | 9.1 | The phone sign-in entry clearly related the number to the workspace and exposed one primary action. |
| Pricing | 9.0 | The private pilot heading and invitation card distinguished the pilot from proposed paid plans. |
| How it works | 9.1 | The first screen paired a concise product description with a direct entry action and a secondary flow link. |

I also opened Profile and Extensions on port 3104. Both displayed account-service recovery states, and Try again on Extensions returned that state. Their authenticated content needs separate evidence. This review did not exercise VoiceOver, a physical iPhone keyboard, provider sign-in, or paid messaging. Journey exposed a motion toggle. I did not test the operating system's reduced-motion preference.

[375px and 320px review screenshots](pro-design/) include navigation, section content, focus completion flow, the guide and public entry screens. These are from the same review session. The signup screenshot at 320 captures the top of the public landing page. Control order was verified via the accessible form.

## Signed-in Profile and Extensions follow-up

I independently inspected the lead engineer's signed-in synthetic QA Rowan screen captures at 390px and 320px. My own second browser session had no available browser surface. I scored the rendered screens and the first action each presented. The lead engineer separately verified saving a coaching preference, reloading, switching accounts and returning to its owner.

| Screen | First review | Revised design at `eba7af4` | Evidence and judgment |
| --- | ---: | ---: | --- |
| Profile | 7.8 | 9.1 | The earlier identity card used about 500px and offered two destinations that opened the same workspace. The revised card gathers the name, phone suffix, verified status and Manage extensions together. At 390px both editable fields are visible. At 320px the first field label is visible and a scroll reaches the inputs. [Before](lead/profile-before.png), [390px](lead/profile-final.png), [320px](lead/profile-small.png). |
| Extensions | 9.0 | 9.2 | The status, permission explanation and Connect Google Calendar button now sit together much higher on the 390px screen. The upcoming Health Connect card has a disabled action and explicit future copy. At 320px the calendar action still requires a short scroll. The teal disconnected badge could use a more neutral tint. [Before](lead/extensions-before.png), [390px](lead/extensions-final.png), [320px](lead/extensions-small.png). |

The Calendar card was observed in the disconnected state. External authorization and device integration were outside the session. Source inspection shows that the legacy room-board URL opens the workspace. There is no separate hardware surface to score.
